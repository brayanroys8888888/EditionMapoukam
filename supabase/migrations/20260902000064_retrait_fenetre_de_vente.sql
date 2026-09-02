-- ═══════════════════════════════════════════════════════════════════════════
-- LA FENÊTRE DE VENTE EXCLUSIVE DE TROIS MOIS EST RETIRÉE DE LA PLATEFORME.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision de l'éditeur, 2 septembre 2026. §3.2 du cahier des charges est
-- réécrit dans le même commit : un titre publié et marqué `inclus_abonnement`
-- entre dans l'abonnement IMMÉDIATEMENT, sans délai d'aucune sorte.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ CE QUI NE CHANGE PAS, ET QU'IL FAUT LIRE AVANT DE CROIRE QUE SI.        │
-- │                                                                         │
-- │ `inclus_abonnement` et `disponible_achat` restent INDÉPENDANTS. Retirer  │
-- │ la fenêtre ne met pas tout le catalogue dans l'abonnement : elle retire  │
-- │ un DÉLAI, pas un interrupteur. Un titre vendu seul le reste, aussi       │
-- │ longtemps que `inclus_abonnement` vaut faux.                            │
-- │                                                                         │
-- │ De même, le droit de TÉLÉCHARGER n'est toujours accordé que par un       │
-- │ achat. Cette migration ne touche pas à `can_download`.                   │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ L'ORDRE DES OPÉRATIONS N'EST PAS INDIFFÉRENT.                           │
-- │                                                                         │
-- │ On retire d'abord la règle de ses DEUX appelantes, puis on supprime la   │
-- │ fonction, puis la colonne qui la paramétrait. L'ordre inverse ferait     │
-- │ échouer la migration sur une dépendance — et, pire, laisserait la base   │
-- │ à moitié transformée si l'on s'était contenté de `drop ... cascade`,     │
-- │ qui aurait emporté `access_for_books` en silence.                       │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ---------------------------------------------------------------------------
-- 1. LE MOTEUR DE DROITS
--
-- Corps repris VERBATIM de la migration 0033. Trois retraits, et trois
-- seulement : `fenetre_nouveaute_jours` dans la CTE `parametres`, le
-- `cross join parametres pa` de `calcul`, et l'appel à
-- `fenetre_de_vente_ecoulee` dans `par_abonnement`.
-- ---------------------------------------------------------------------------

create or replace function public.access_for_books(
  p_user uuid,
  p_books uuid[],
  p_at timestamptz default public.app_now()
)
  returns table (
    book_id uuid,
    can_read boolean,
    can_download boolean,
    reason public.access_reason
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with parametres as (
    select periode_grace_jours from public.business_settings where id = 1
  ),
  appelant as (
    select p_user is not null and public.is_admin(p_user) as est_admin
  ),
  -- Un abonnement ouvre le droit dans quatre situations, et quatre seulement.
  abonnement as (
    select exists (
      select 1
      from public.subscriptions s, parametres p
      where p_user is not null
        and s.user_id = p_user
        and (
          -- Essai en cours ou abonnement actif, période non échue.
          (s.statut in ('essai', 'actif') and s.fin_periode > p_at)
          -- Annulé : l'accès est maintenu jusqu'à la fin de la période PAYÉE.
          or (s.statut = 'annule' and s.fin_periode > p_at)
          -- Impayé : l'accès est maintenu pendant la période de grâce, même si
          -- la période d'abonnement est déjà échue.
          or (
            s.statut = 'impaye'
            and s.impaye_depuis is not null
            and s.impaye_depuis + make_interval(days => p.periode_grace_jours) > p_at
          )
        )
    ) as ouvre_droit
  ),
  demandes as (
    select distinct b.id, b.statut, b.gratuit, b.inclus_abonnement, b.publie_le
    from unnest(p_books) as demande(id)
    join public.books b on b.id = demande.id
  ),
  droits as (
    select
      e.book_id,
      bool_or(e.type = 'achat') as a_achat,
      bool_or(e.type = 'offert') as a_octroi,
      bool_or(e.peut_telecharger) as peut_telecharger
    from public.entitlements e
    where p_user is not null
      and e.user_id = p_user
      and e.book_id = any (p_books)
      and (e.expire_le is null or e.expire_le > p_at)
    group by e.book_id
  ),
  calcul as (
    select
      d.id as book_id,
      a.est_admin,
      coalesce(dr.a_achat, false) as a_achat,
      coalesce(dr.a_octroi, false) as a_octroi,
      coalesce(dr.peut_telecharger, false) as peut_telecharger,
      -- Un titre en brouillon n'a jamais été vendu : il n'existe pas pour le
      -- public. Un titre ARCHIVÉ, lui, a pu être acheté — et §3.1 promet à
      -- l'acheteur un accès « sans limite de durée ». L'archivage le retire du
      -- catalogue et de l'abonnement, il ne révoque pas un droit payé.
      (d.statut = 'publie') as au_catalogue,
      (d.statut in ('publie', 'archive')) as exploitable,
      d.gratuit,
      -- ┌──────────────────────────────────────────────────────────────────┐
      -- │ PLUS DE FENÊTRE DE VENTE : ÊTRE PUBLIÉ SUFFIT.                   │
      -- │                                                                  │
      -- │ La condition qui manque ici est un DÉLAI, pas un droit. Les deux  │
      -- │ autres tiennent toujours : il faut que le titre soit marqué       │
      -- │ `inclus_abonnement`, et qu'il soit publié.                        │
      -- └──────────────────────────────────────────────────────────────────┘
      (
        ab.ouvre_droit
        and d.inclus_abonnement
        and d.statut = 'publie'
      ) as par_abonnement
    from demandes d
    cross join appelant a
    cross join abonnement ab
    left join droits dr on dr.book_id = d.id
  )
  select
    c.book_id,
    -- OU LOGIQUE entre toutes les sources. L'ordre est sans importance.
    (
      c.est_admin
      or ((c.a_achat or c.a_octroi) and c.exploitable)
      or (c.gratuit and c.au_catalogue)
      or c.par_abonnement
    ) as can_read,
    -- INDÉPENDANT de `reason`, et jamais accordé par un abonnement ni par
    -- `gratuit`. C'est la règle métier la plus sensible du projet, et elle
    -- n'est pas concernée par ce retrait.
    (c.est_admin or (c.peut_telecharger and c.exploitable)) as can_download,
    -- Le titre LE PLUS FORT détenu.
    (case
      when c.a_achat and c.exploitable then 'purchase'
      when (c.a_octroi and c.exploitable) or c.est_admin then 'granted'
      when c.par_abonnement then 'subscription'
      when c.gratuit and c.au_catalogue then 'free'
      when c.au_catalogue then 'preview'
      else 'none'
    end)::public.access_reason as reason
  from calcul c;
$$;

comment on function public.access_for_books(uuid, uuid[], timestamptz) is
  'Moteur de droits, source UNIQUE (§3.1). Depuis la migration 0064, l''abonnement ouvre un titre dès sa publication : la fenêtre de vente exclusive a été retirée de la plateforme.';

-- ---------------------------------------------------------------------------
-- 2. LE CATALOGUE
--
-- Même signature qu'en 0063, donc `create or replace` suffit. Corps repris
-- VERBATIM, moins la CTE `parametres`, son `cross join`, et l'appel à la
-- fenêtre dans le filtre « accessible par abonnement ».
-- ---------------------------------------------------------------------------

create or replace function public.catalog_list(
  p_langue text default 'fr',
  p_recherche text default null,
  p_age_min smallint default null,
  p_age_max smallint default null,
  p_themes text[] default null,
  p_origine text default null,
  p_region public.region_conte default null,
  p_type_document public.document_type default null,
  p_acces text default null,
  p_zone public.price_zone default 'international',
  p_tri text default 'nouveautes',
  p_page integer default 1,
  p_taille integer default 20,
  p_at timestamptz default public.app_now()
)
  returns table (
    book_id uuid,
    slug text,
    auteur text,
    illustrateur text,
    age_min smallint,
    age_max smallint,
    origine_culturelle text,
    themes text[],
    couverture_url text,
    inclus_abonnement boolean,
    disponible_achat boolean,
    gratuit boolean,
    publie_le timestamptz,
    titre text,
    resume text,
    nb_pages integer,
    langues text[],
    montant bigint,
    devise text,
    zone_prix public.price_zone,
    score_popularite bigint,
    total bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with requete as (
    select case when nullif(btrim(coalesce(p_recherche, '')), '') is null then null
                else websearch_to_tsquery('french', p_recherche) end as tsq
  ),
  -- AUCUN REPLI DE ZONE : la zone demandée, ou aucun prix.
  --
  -- Annoncer « 4,99 € » à un visiteur de la zone Afrique parce que le titre n'a
  -- pas de prix local serait une substitution silencieuse de devise — et le
  -- panier refuserait ensuite ce même titre, la tarification n'admettant plus
  -- ce repli. Le titre reste LISTÉ, simplement sans montant : il peut être
  -- lisible par abonnement.
  prix as (
    select p.book_id, p.montant, p.devise, p.zone as zone_prix
    from public.book_prices p
    where p.zone = p_zone
  ),
  base as (
    select
      b.id,
      b.slug,
      b.auteur,
      b.illustrateur,
      b.age_min,
      b.age_max,
      b.origine_culturelle,
      b.themes,
      b.couverture_url,
      b.inclus_abonnement,
      b.disponible_achat,
      b.gratuit,
      b.publie_le,
      t.titre,
      t.resume,
      t.nb_pages,
      array(
        select t2.langue from public.book_translations t2
        where t2.book_id = b.id and t2.statut = 'publie' order by t2.langue
      ) as langues,
      pr.montant,
      pr.devise,
      pr.zone_prix,
      pop.score as score_popularite,
      -- Pertinence : nulle en l'absence de recherche, pour que le tri demandé
      -- s'applique tel quel.
      case when r.tsq is null then 0
           else ts_rank(b.recherche, r.tsq) + ts_rank(t.recherche, r.tsq) end as pertinence
    from public.books b
    join public.book_translations t
      on t.book_id = b.id and t.langue = p_langue and t.statut = 'publie'
    left join prix pr on pr.book_id = b.id
    left join public.book_popularity pop on pop.book_id = b.id
    cross join requete r
    where b.statut = 'publie'
      -- Brouillons et titres archivés ne sortent JAMAIS du catalogue public.
      and (r.tsq is null or b.recherche @@ r.tsq or t.recherche @@ r.tsq)
      and (p_age_min is null or b.age_max is null or b.age_max >= p_age_min)
      and (p_age_max is null or b.age_min is null or b.age_min <= p_age_max)
      and (p_themes is null or b.themes && p_themes)
      and (p_origine is null or b.origine_culturelle ilike '%' || p_origine || '%')
      and (p_region is null or b.region = p_region)
      and (p_type_document is null or b.type_document = p_type_document)
      and (
        p_acces is null
        or (p_acces = 'gratuit' and b.gratuit)
        or (p_acces = 'achat' and b.disponible_achat)
        -- « Accessible par abonnement » n'a plus de condition de date : depuis
        -- la migration 0064, un titre inclus l'est dès sa publication. Le
        -- catalogue et `access_for_books` disent donc la même chose sans avoir
        -- à partager une fonction — il n'y a plus de règle à partager.
        or (p_acces = 'abonnement' and b.inclus_abonnement)
      )
  ),
  compte as (select count(*) as total from base)
  select
    base.id,
    base.slug,
    base.auteur,
    base.illustrateur,
    base.age_min,
    base.age_max,
    base.origine_culturelle,
    base.themes,
    base.couverture_url,
    base.inclus_abonnement,
    base.disponible_achat,
    base.gratuit,
    base.publie_le,
    base.titre,
    base.resume,
    base.nb_pages,
    base.langues,
    base.montant,
    base.devise,
    base.zone_prix,
    base.score_popularite,
    compte.total
  from base cross join compte
  order by
    case when p_tri = 'pertinence' then base.pertinence end desc nulls last,
    case when p_tri = 'nouveautes' then base.publie_le end desc nulls last,
    case when p_tri = 'popularite' then base.score_popularite end desc nulls last,
    case when p_tri = 'prix' then base.montant end asc nulls last,
    case when p_tri = 'alphabetique' then base.titre end asc nulls last,
    -- Départage stable : sans lui, deux titres de même rang pourraient
    -- s'échanger d'une page à l'autre et apparaître en double.
    base.titre asc,
    base.id asc
  offset greatest(p_page - 1, 0) * p_taille
  limit p_taille;
$$;

comment on function public.catalog_list is
  'Catalogue publié, filtré et trié (§4.1 F2). Depuis la migration 0064, le filtre « accessible par abonnement » ne porte plus de condition de date : la fenêtre de vente exclusive a été retirée.';

-- ---------------------------------------------------------------------------
-- 3. LES TROIS OBJETS QUI N'EXISTAIENT QUE POUR LA FENÊTRE
--
-- `abonnement_a_partir_du` répondait « à quelle date ce titre entrera-t-il
-- dans l'abonnement ». La question n'a plus de sens : la réponse serait
-- toujours « il y est déjà », c'est-à-dire `null` pour tout le catalogue. Une
-- fonction qui rend invariablement `null` est un piège pour qui la lira dans
-- six mois.
--
-- `titres_impactes_par_fenetre` chiffrait l'effet d'un déplacement de la
-- fenêtre, à montrer avant validation. Il n'y a plus rien à déplacer.
-- ---------------------------------------------------------------------------

drop function if exists public.abonnement_a_partir_du(uuid[], timestamptz);
drop function if exists public.titres_impactes_par_fenetre(integer, timestamptz);

-- Supprimée APRÈS ses deux appelantes, jamais en `cascade` : une suppression en
-- cascade aurait emporté `access_for_books` et `catalog_list` sans le dire.
drop function if exists public.fenetre_de_vente_ecoulee(timestamptz, integer, timestamptz);

-- ---------------------------------------------------------------------------
-- 4. LE RÉGLAGE
--
-- La colonne part avec sa contrainte `business_settings_fenetre_bornee`, que
-- PostgreSQL supprime en même temps qu'elle.
--
-- Le déclencheur d'audit doit être recréé AVANT : sa clause `when` nomme la
-- colonne, et un déclencheur qui référence une colonne disparue fait échouer
-- toute écriture ultérieure sur la table — un symptôme qui ne parlerait ni de
-- fenêtre ni d'audit.
-- ---------------------------------------------------------------------------

drop trigger if exists business_settings_tracees on public.business_settings;

create trigger business_settings_tracees
  before update on public.business_settings
  for each row
  when (
    old.periode_grace_jours is distinct from new.periode_grace_jours
    or old.jours_essai is distinct from new.jours_essai
    or old.abonnement_ouvert is distinct from new.abonnement_ouvert
  )
  execute function public.tracer_business_settings();

-- La trace couvre désormais l'essai et l'ouverture commerciale, qui n'y
-- figuraient pas : ce sont les deux leviers restants dont l'effet est
-- commercial et immédiat. Le retrait de la fenêtre ne devait pas RÉDUIRE ce
-- qui est journalisé.

alter table public.business_settings drop column fenetre_nouveaute_jours;

-- ---------------------------------------------------------------------------
-- 5. LA MUTATION D'ADMINISTRATION
--
-- La signature perd son deuxième paramètre. L'ancienne est retirée APRÈS la
-- nouvelle : sans cela PostgreSQL garderait deux surcharges et tout appel par
-- paramètres nommés deviendrait ambigu — c'est le raisonnement de la 0052.
-- ---------------------------------------------------------------------------

create or replace function public.admin_modifier_parametres(
  p_acteur uuid,
  p_periode_grace_jours integer default null,
  p_jours_essai integer default null,
  p_tolerance_renouvellement_heures integer default null,
  p_retention_copies_mois integer default null,
  p_abonnement_ouvert boolean default null
)
  returns public.business_settings
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_parametres public.business_settings;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  update public.business_settings
  set periode_grace_jours = coalesce(p_periode_grace_jours, periode_grace_jours),
      jours_essai = coalesce(p_jours_essai, jours_essai),
      tolerance_renouvellement_heures =
        coalesce(p_tolerance_renouvellement_heures, tolerance_renouvellement_heures),
      retention_copies_mois = coalesce(p_retention_copies_mois, retention_copies_mois),
      abonnement_ouvert = coalesce(p_abonnement_ouvert, abonnement_ouvert),
      maj_le = public.app_now()
  where id = 1
  returning * into v_parametres;

  return v_parametres;
end;
$$;

drop function if exists public.admin_modifier_parametres(
  uuid, integer, integer, integer, integer, integer, boolean
);

revoke all on function public.admin_modifier_parametres(
  uuid, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.admin_modifier_parametres(
  uuid, integer, integer, integer, integer, boolean
) to service_role;

comment on function public.admin_modifier_parametres(uuid, integer, integer, integer, integer, boolean) is
  'Modification des paramètres métier par un administrateur, acteur posé pour l''audit. La fenêtre de nouveauté a été retirée par la migration 0064 : elle ne figure plus parmi les leviers réglables.';
