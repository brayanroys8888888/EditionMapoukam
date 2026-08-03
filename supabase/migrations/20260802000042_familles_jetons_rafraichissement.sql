-- ---------------------------------------------------------------------------
-- Familles de jetons de rafraîchissement — rotation et détection de réutilisation
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POURQUOI CETTE TABLE EXISTE ALORS QUE GOTRUE FAIT DÉJÀ LA ROTATION.      │
-- │                                                                          │
-- │ `enable_refresh_token_rotation = true` fait bien tourner le jeton à      │
-- │ chaque rafraîchissement, et `refresh_token_reuse_interval = 10` tolère   │
-- │ une course de dix secondes. Mais présenter un jeton déjà consommé y      │
-- │ produit une simple ERREUR : la session reste vivante.                    │
-- │                                                                          │
-- │ Or un jeton rejoué hors course n'a qu'une explication : quelqu'un        │
-- │ d'autre le détient. Le refuser sans rien faire laisse le voleur          │
-- │ retenter, et laisse surtout la victime en ligne sans le savoir. La       │
-- │ réponse correcte est de tuer la FAMILLE entière — toutes les             │
-- │ générations issues de la même connexion — et d'obliger à se reconnecter. │
-- │                                                                          │
-- │ C'est la contrepartie exacte du fait qu'un jeton de rafraîchissement     │
-- │ vaut trente jours d'accès : plus il dure, moins on peut se permettre de  │
-- │ hausser les épaules quand il réapparaît.                                 │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE JETON N'EST JAMAIS STOCKÉ. SON EMPREINTE SEULE.                      │
-- │                                                                          │
-- │ Une table de jetons de rafraîchissement en clair serait un trousseau :   │
-- │ sa lecture donnerait trente jours d'accès sur chaque compte. On y range  │
-- │ donc un SHA-256, qui suffit à reconnaître un jeton présenté et ne        │
-- │ permet pas de le fabriquer.                                             │
-- │                                                                          │
-- │ Pas de sel, et c'est délibéré : un jeton de rafraîchissement est déjà    │
-- │ une valeur aléatoire de haute entropie. Le sel protège les secrets       │
-- │ devinables — un mot de passe — contre les tables précalculées. Ici il    │
-- │ n'y a rien à deviner, et un sel par ligne interdirait la recherche par   │
-- │ empreinte, qui est toute la fonction de cette table.                     │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create table public.refresh_token_families (
  id uuid primary key default gen_random_uuid(),

  -- Toutes les générations d'une même connexion partagent cette valeur. C'est
  -- l'unité de révocation : on ne tue pas un jeton, on tue une lignée.
  famille uuid not null,

  -- `restrict` et non `cascade` : voir migration 0012. Un compte ne s'efface
  -- pas, il s'anonymise.
  user_id uuid not null references public.users (id) on delete restrict,

  /**
   * SHA-256 hexadécimal du jeton de rafraîchissement. Jamais le jeton.
   */
  jeton_hash text not null unique,

  -- ┌────────────────────────────────────────────────────────────────────────┐
  -- │ HEURE RÉELLE, ET NON L'HORLOGE MÉTIER — deuxième cas du projet après   │
  -- │ `reading_progress.maj_le`, et pour exactement la même raison.          │
  -- │                                                                        │
  -- │ Ces colonnes arbitrent une CONCURRENCE entre onglets, elles ne datent  │
  -- │ pas un fait métier. Avec l'horloge simulée, avancer le temps de trente │
  -- │ jours ferait juger « réutilisation » une course de deux millisecondes, │
  -- │ et déconnecterait des comptes sains à chaque test de fin de période.   │
  -- │                                                                        │
  -- │ La validité du jeton lui-même est appliquée par GoTrue, en heure       │
  -- │ réelle : aligner cette table sur l'horloge métier la ferait diverger   │
  -- │ de l'autorité qu'elle accompagne. Voir docs/PLAN.md §5 duodecies.      │
  -- └────────────────────────────────────────────────────────────────────────┘
  cree_le timestamptz not null default now(),

  /** Renseigné quand ce jeton a été échangé contre son successeur. */
  remplace_le timestamptz,

  /** Renseigné quand la famille entière a été révoquée. */
  revoque_le timestamptz,

  /** Pourquoi la famille est morte : `reutilisation`, `deconnexion`, `compte`. */
  revoque_pour text
    check (revoque_pour is null or revoque_pour in ('reutilisation', 'deconnexion', 'compte'))
);

comment on table public.refresh_token_families is
  'Empreintes des jetons de rafraichissement, par famille. Un jeton rejoue hors course tue la famille entiere. Le jeton n''est jamais stocke, seulement son SHA-256.';

comment on column public.refresh_token_families.cree_le is
  'HEURE REELLE, comme reading_progress.maj_le : arbitre une concurrence, ne date pas un fait metier.';

create index refresh_token_families_famille_idx
  on public.refresh_token_families (famille)
  where revoque_le is null;

create index refresh_token_families_user_idx
  on public.refresh_token_families (user_id, cree_le desc);

-- ---------------------------------------------------------------------------
-- RLS — refus total, y compris en lecture
--
-- CLAUDE.md règle 1 : RLS activé, refus par défaut. Aucune politique n'est
-- créée, et c'est délibéré : cette table contient des empreintes de jetons.
-- Personne n'a de raison légitime de la lire depuis un client, pas même son
-- propriétaire — savoir combien de sessions on a ouvertes ne vaut pas
-- d'exposer la surface. Même parti pris que `promo_codes` (migration 0010).
-- ---------------------------------------------------------------------------

alter table public.refresh_token_families enable row level security;

revoke all on public.refresh_token_families from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ouverture d'une famille — à la connexion
-- ---------------------------------------------------------------------------

create function public.ouvrir_famille_jetons(p_user_id uuid, p_hash text)
  returns uuid
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_famille uuid := gen_random_uuid();
begin
  insert into public.refresh_token_families (famille, user_id, jeton_hash)
  values (v_famille, p_user_id, p_hash)
  -- Une même empreinte réémise par GoTrue à l'intérieur de sa fenêtre de
  -- tolérance ne doit pas faire échouer une connexion par ailleurs valide.
  on conflict (jeton_hash) do nothing;

  if not found then
    select f.famille into v_famille
    from public.refresh_token_families f
    where f.jeton_hash = p_hash;
  end if;

  return v_famille;
end;
$$;

comment on function public.ouvrir_famille_jetons(uuid, text) is
  'Ouvre une lignee de jetons a la connexion. Idempotente sur l''empreinte.';

revoke all on function public.ouvrir_famille_jetons(uuid, text) from public, anon, authenticated;
grant execute on function public.ouvrir_famille_jetons(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Diagnostic d'un jeton présenté — ET révocation si réutilisation
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ QUATRE ÉTATS, ET LA DISTINCTION ENTRE LES DEUX DU MILIEU EST TOUT LE    │
-- │ SUJET.                                                                   │
-- │                                                                          │
-- │   inconnu       — jamais émis, ou purgé. Refus sec.                      │
-- │   revoque       — la famille est déjà morte. Refus sec.                  │
-- │   course        — jeton remplacé il y a MOINS que la tolérance. Deux     │
-- │                   onglets se sont rafraîchis en même temps. REFUS SANS   │
-- │                   PUNITION.                                              │
-- │   reutilisation — jeton remplacé il y a PLUS que la tolérance. Personne  │
-- │                   ne rejoue un jeton consommé par accident après ce      │
-- │                   délai. LA FAMILLE MEURT.                               │
-- │   valide        — jeton courant, échange autorisé.                       │
-- │                                                                          │
-- │ Pourquoi la tolérance ne fragilise rien : dans les deux cas le jeton est │
-- │ REFUSÉ. Elle ne suspend que la sanction, jamais le refus. Un voleur qui  │
-- │ frappe dans la fenêtre obtient un 401 comme les autres — il gagne         │
-- │ seulement de ne pas alerter, et n'obtient toujours aucun accès.          │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create function public.diagnostiquer_jeton_rafraichissement(
  p_hash text,
  p_tolerance_secondes integer default 10
)
  returns table (etat text, user_id uuid, famille uuid)
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_ligne public.refresh_token_families;
begin
  select * into v_ligne
  from public.refresh_token_families f
  where f.jeton_hash = p_hash;

  if not found then
    return query select 'inconnu'::text, null::uuid, null::uuid;
    return;
  end if;

  if v_ligne.revoque_le is not null then
    return query select 'revoque'::text, v_ligne.user_id, v_ligne.famille;
    return;
  end if;

  if v_ligne.remplace_le is not null then
    if now() - v_ligne.remplace_le <= make_interval(secs => p_tolerance_secondes) then
      return query select 'course'::text, v_ligne.user_id, v_ligne.famille;
      return;
    end if;

    -- RÉUTILISATION. Toute la lignée tombe, y compris le jeton courant que
    -- détient peut-être la victime : c'est le prix, et il est volontaire.
    update public.refresh_token_families f
       set revoque_le = now(),
           revoque_pour = 'reutilisation'
     where f.famille = v_ligne.famille
       and f.revoque_le is null;

    return query select 'reutilisation'::text, v_ligne.user_id, v_ligne.famille;
    return;
  end if;

  return query select 'valide'::text, v_ligne.user_id, v_ligne.famille;
end;
$$;

comment on function public.diagnostiquer_jeton_rafraichissement(text, integer) is
  'Diagnostique un jeton presente et REVOQUE la famille en cas de reutilisation hors tolerance. La tolerance suspend la sanction, jamais le refus.';

revoke all on function public.diagnostiquer_jeton_rafraichissement(text, integer)
  from public, anon, authenticated;
grant execute on function public.diagnostiquer_jeton_rafraichissement(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Rotation — marque l'ancien et enregistre le successeur
--
-- L'UPDATE conditionnel EST le verrou : deux appels concurrents pour la même
-- empreinte, un seul voit `found`. Sans cette condition, les deux inséreraient
-- un successeur et la lignée se dédoublerait.
-- ---------------------------------------------------------------------------

create function public.pivoter_jeton_rafraichissement(p_hash text, p_nouveau_hash text)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_famille uuid;
begin
  update public.refresh_token_families f
     set remplace_le = now()
   where f.jeton_hash = p_hash
     and f.remplace_le is null
     and f.revoque_le is null
  returning f.user_id, f.famille into v_user, v_famille;

  if not found then
    return false;
  end if;

  insert into public.refresh_token_families (famille, user_id, jeton_hash)
  values (v_famille, v_user, p_nouveau_hash)
  -- GoTrue rend le MÊME successeur aux deux appels d'une course de moins de
  -- dix secondes. Le second doit aboutir sans bruit, pas échouer.
  on conflict (jeton_hash) do nothing;

  return true;
end;
$$;

comment on function public.pivoter_jeton_rafraichissement(text, text) is
  'Echange un jeton contre son successeur. L''UPDATE conditionnel serialise les appels concurrents.';

revoke all on function public.pivoter_jeton_rafraichissement(text, text)
  from public, anon, authenticated;
grant execute on function public.pivoter_jeton_rafraichissement(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Révocation explicite
-- ---------------------------------------------------------------------------

create function public.revoquer_familles_jetons(
  p_user_id uuid,
  p_motif text default 'deconnexion',
  p_famille uuid default null
)
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_nombre integer;
begin
  update public.refresh_token_families f
     set revoque_le = now(),
         revoque_pour = p_motif
   where f.user_id = p_user_id
     and f.revoque_le is null
     and (p_famille is null or f.famille = p_famille);

  get diagnostics v_nombre = row_count;
  return v_nombre;
end;
$$;

comment on function public.revoquer_familles_jetons(uuid, text, uuid) is
  'Revoque une famille, ou toutes celles d''un compte. Appelee a la deconnexion et sur perte de statut actif.';

revoke all on function public.revoquer_familles_jetons(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.revoquer_familles_jetons(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Un compte qui cesse d'être actif perd ses sessions — sans passer par le code
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LE DÉCLENCHEUR PLUTÔT QUE L'APPEL, POUR LA RAISON DE L'ÉTAPE 13 : LA    │
-- │ TRACE SUIT LA DONNÉE, PAS LE CHEMIN DE CODE.                            │
-- │                                                                          │
-- │ Suspendre un compte depuis l'administration, l'anonymiser depuis         │
-- │ l'espace personnel, ou le basculer par une migration corrective sont     │
-- │ trois chemins distincts. Un appel explicite en couvrirait un, peut-être  │
-- │ deux. Le déclencheur les couvre tous, y compris ceux qui n'existent pas  │
-- │ encore.                                                                  │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

create function public.revoquer_jetons_si_compte_ferme()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.statut is distinct from old.statut and new.statut <> 'actif' then
    perform public.revoquer_familles_jetons(new.id, 'compte');
  end if;
  return new;
end;
$$;

create trigger users_revoquer_jetons
  after update of statut on public.users
  for each row
  execute function public.revoquer_jetons_si_compte_ferme();

comment on function public.revoquer_jetons_si_compte_ferme() is
  'Un compte suspendu ou anonymise perd ses sessions, quel que soit le chemin qui l''a ferme.';

-- ---------------------------------------------------------------------------
-- Purge
--
-- Une lignée morte ou remplacée n'a plus d'utilité passé un délai : elle ne
-- sert qu'à distinguer « inconnu » de « réutilisation », et un jeton rejoué
-- des mois plus tard est de toute façon expiré chez GoTrue.
--
-- Rien ne l'appelle automatiquement : c'est une entrée de plus derrière
-- l'ordonnanceur B5 de docs/AVANT-MISE-EN-PRODUCTION.md.
-- ---------------------------------------------------------------------------

create function public.purger_jetons_rafraichissement(p_jours integer default 60)
  returns integer
  language plpgsql
  volatile
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_nombre integer;
begin
  delete from public.refresh_token_families f
   where f.cree_le < now() - make_interval(days => p_jours)
     and (f.remplace_le is not null or f.revoque_le is not null);

  get diagnostics v_nombre = row_count;
  return v_nombre;
end;
$$;

comment on function public.purger_jetons_rafraichissement(integer) is
  'Efface les lignees mortes ou remplacees passe un delai. Depend de l''ordonnanceur (B5).';

revoke all on function public.purger_jetons_rafraichissement(integer) from public, anon, authenticated;
grant execute on function public.purger_jetons_rafraichissement(integer) to service_role;
