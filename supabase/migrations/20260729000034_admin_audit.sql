-- 0034 — Journal d'audit des leviers à effet commercial (étape 13, point 3)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ LE JOURNAL EST ÉCRIT PAR DES DÉCLENCHEURS, JAMAIS PAR LES ROUTES.         │
-- │                                                                            │
-- │ Une route qui écrit la mutation puis la trace peut oublier la seconde      │
-- │ moitié : un `return` prématuré, une exception rattrapée, une branche       │
-- │ ajoutée six mois plus tard. Et un journal incomplet est pire qu'absent —   │
-- │ on s'y fie.                                                                │
-- │                                                                            │
-- │ Confiée au déclencheur, la trace suit la DONNÉE et non le code : elle      │
-- │ tient quel que soit le chemin d'écriture, y compris `service_role` qui     │
-- │ contourne RLS, y compris un `psql` ouvert à la main.                       │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- L'ADMINISTRATION EST LA SURFACE LA PLUS PRIVILÉGIÉE DU PROJET : elle passe
-- par `service_role`, donc RLS est contourné par construction. Le seul contrôle
-- qui subsiste est celui du code — et c'est précisément pourquoi la trace ne
-- doit pas en dépendre.

-- ---------------------------------------------------------------------------
-- L'acteur
--
-- `auth.uid()` est nul sous `service_role` : le serveur agit pour le compte de
-- l'administrateur, pas en son nom. L'identité doit donc voyager autrement, et
-- les déclencheurs ne reçoivent aucun paramètre applicatif — d'où un paramètre
-- de session, comme pour `app.now`.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE PARAMÈTRE EST POSÉ PAR LA FONCTION D'ADMINISTRATION, JAMAIS PAR LA    │
-- │ ROUTE.                                                                    │
-- │                                                                          │
-- │ La distinction est structurelle, pas stylistique. Les routes parlent à la │
-- │ base par PostgREST, où chaque appel est une transaction distincte : un    │
-- │ paramètre posé par un appel serait déjà oublié au suivant. La trace       │
-- │ dépendrait alors d'un état que rien ne garantit — c'est-à-dire de rien.   │
-- │                                                                          │
-- │ Chaque mutation d'administration passe donc par une fonction              │
-- │ `admin_…(p_acteur, …)` qui pose le paramètre dans SA transaction, où les  │
-- │ déclencheurs le voient. L'acteur est un ARGUMENT : il ne peut pas être    │
-- │ oublié sans que l'appel échoue à la compilation.                          │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Un acteur ABSENT n'est pas une erreur : les migrations, les seeds et le
-- gestionnaire de webhooks écrivent légitimement sans administrateur derrière.
-- La trace est alors marquée `systeme`, ce qui se distingue d'un coup d'œil
-- d'une action humaine.
-- ---------------------------------------------------------------------------

create function public.acteur_courant()
  returns uuid
  language plpgsql
  stable
as $$
declare
  v_brut text;
begin
  -- `true` en second argument : ne lève pas si le paramètre n'existe pas.
  v_brut := current_setting('app.acteur', true);
  if v_brut is null or v_brut = '' then
    return null;
  end if;
  return v_brut::uuid;
exception
  when invalid_text_representation then
    -- Une valeur illisible ne doit pas faire échouer l'écriture métier ; elle
    -- sera tracée comme `systeme`, ce qui est déjà un signal.
    return null;
end;
$$;

comment on function public.acteur_courant() is
  'Administrateur à l''origine de la requête, déposé dans `app.acteur` par la route. Nul pour une écriture système (migration, seed, webhook) : la trace est alors marquée `systeme`.';

create function public.motif_courant()
  returns text
  language sql
  stable
as $$
  select nullif(current_setting('app.motif', true), '');
$$;

comment on function public.motif_courant() is
  'Motif déposé dans `app.motif` par la route. Obligatoire pour un octroi manuel de droits — voir le déclencheur sur `entitlements`.';

-- ---------------------------------------------------------------------------
-- Le journal
-- ---------------------------------------------------------------------------

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),

  -- QUI. Nul pour une écriture système, jamais falsifiable par le client :
  -- le paramètre de session est posé côté serveur, après vérification du rôle.
  --
  -- `on delete set null` et non `cascade` : effacer un administrateur ne doit
  -- pas effacer la trace de ses décisions commerciales. La règle générale du
  -- projet interdit d'ailleurs toute cascade depuis `users` (migration 0012).
  acteur_id uuid references public.users (id) on delete set null,

  -- QUOI.
  action text not null check (action in (
    'prix_modifie',
    'gratuit_modifie',
    'inclus_abonnement_modifie',
    'disponible_achat_modifie',
    'publication_modifiee',
    'parametres_modifies',
    'droit_octroye',
    'droit_retire',
    'remboursement',
    'zone_abonnement_modifiee',
    'compte_suspendu',
    'compte_reactive',
    'code_promo_modifie',
    'purge_copies'
  )),

  cible_type text not null check (cible_type in (
    'book', 'book_price', 'business_settings', 'entitlement',
    'order', 'subscription', 'user', 'promo_code', 'maintenance'
  )),
  cible_id uuid,

  -- ANCIENNE ET NOUVELLE VALEUR. En `jsonb` : la forme varie d'un levier à
  -- l'autre, et un schéma figé obligerait à une migration à chaque nouveau
  -- levier — c'est-à-dire à ne pas le tracer.
  ancienne_valeur jsonb,
  nouvelle_valeur jsonb,

  -- Obligatoire pour un octroi manuel, libre ailleurs.
  motif text check (motif is null or length(btrim(motif)) between 3 and 1000),

  -- QUAND. `app_now()` comme tout le reste du schéma : une trace doit se lire
  -- dans le même référentiel de temps que les faits qu'elle décrit, sans quoi
  -- un scénario joué avec l'horloge avancée produirait un journal incohérent.
  cree_le timestamptz not null default public.app_now()
);

comment on table public.admin_audit_log is
  'Journal des leviers à effet commercial (étape 13, point 3) : qui, quoi, quand, ancienne valeur, nouvelle valeur. Écrit par des DÉCLENCHEURS et non par les routes, pour que la trace suive la donnée et tienne quel que soit le chemin d''écriture.';
comment on column public.admin_audit_log.acteur_id is
  'Administrateur à l''origine de l''action. Nul pour une écriture système (webhook, migration, seed) — ce qui se distingue d''une action humaine.';
comment on column public.admin_audit_log.motif is
  'Obligatoire pour `droit_octroye` : c''est le levier qui donne du contenu gratuitement.';

create index admin_audit_log_date_idx on public.admin_audit_log (cree_le desc);
create index admin_audit_log_cible_idx on public.admin_audit_log (cible_type, cible_id, cree_le desc);
create index admin_audit_log_acteur_idx on public.admin_audit_log (acteur_id, cree_le desc);

-- ---------------------------------------------------------------------------
-- Le journal ne se modifie pas
--
-- Un journal d'audit dont on peut retirer une ligne ne prouve rien. Aucun
-- privilège de `update` ni de `delete` n'est accordé, à personne — pas même à
-- `service_role`, qui contourne pourtant RLS.
--
-- La purge à échéance, si elle devient nécessaire, passera par une fonction
-- `security definer` dédiée et tracée. Elle n'existe pas aujourd'hui.
-- ---------------------------------------------------------------------------

alter table public.admin_audit_log enable row level security;

-- Refus par défaut, sans exception cliente : ce journal nomme des utilisateurs
-- et des décisions commerciales. Il se lit par le serveur, jamais par le client.
create policy admin_audit_log_aucun_acces_client on public.admin_audit_log
  for all to anon, authenticated
  using (false) with check (false);

revoke update, delete, truncate on public.admin_audit_log from service_role;

-- ---------------------------------------------------------------------------
-- L'écriture d'une entrée
-- ---------------------------------------------------------------------------

create function public.journaliser_admin(
  p_action text,
  p_cible_type text,
  p_cible_id uuid,
  p_ancienne jsonb,
  p_nouvelle jsonb,
  p_motif text default null
)
  returns uuid
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  insert into public.admin_audit_log
    (acteur_id, action, cible_type, cible_id, ancienne_valeur, nouvelle_valeur, motif)
  values
    (public.acteur_courant(), p_action, p_cible_type, p_cible_id,
     p_ancienne, p_nouvelle, coalesce(p_motif, public.motif_courant()))
  returning id;
$$;

comment on function public.journaliser_admin(text, text, uuid, jsonb, jsonb, text) is
  'Écrit une entrée d''audit. `security definer` parce que la table refuse toute écriture directe côté client.';

revoke all on function public.journaliser_admin(text, text, uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.journaliser_admin(text, text, uuid, jsonb, jsonb, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- LES DÉCLENCHEURS
-- ---------------------------------------------------------------------------

/**
 * `books` — quatre leviers commerciaux dans une seule table.
 *
 * Chacun est tracé SÉPARÉMENT : une modification qui touche le prix et le
 * drapeau `gratuit` doit produire deux lignes, pas une ligne fourre-tout dont
 * on ne saurait dire quel levier a bougé.
 */
create function public.tracer_leviers_book()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.gratuit is distinct from old.gratuit then
    perform public.journaliser_admin(
      'gratuit_modifie', 'book', new.id,
      jsonb_build_object('gratuit', old.gratuit),
      jsonb_build_object('gratuit', new.gratuit),
      null);
  end if;

  if new.inclus_abonnement is distinct from old.inclus_abonnement then
    perform public.journaliser_admin(
      'inclus_abonnement_modifie', 'book', new.id,
      jsonb_build_object('inclus_abonnement', old.inclus_abonnement),
      jsonb_build_object('inclus_abonnement', new.inclus_abonnement),
      null);
  end if;

  if new.disponible_achat is distinct from old.disponible_achat then
    perform public.journaliser_admin(
      'disponible_achat_modifie', 'book', new.id,
      jsonb_build_object('disponible_achat', old.disponible_achat),
      jsonb_build_object('disponible_achat', new.disponible_achat),
      null);
  end if;

  if new.statut is distinct from old.statut then
    perform public.journaliser_admin(
      'publication_modifiee', 'book', new.id,
      jsonb_build_object('statut', old.statut, 'publie_le', old.publie_le),
      jsonb_build_object('statut', new.statut, 'publie_le', new.publie_le),
      null);
  end if;

  return new;
end;
$$;

create trigger books_tracer_leviers
  after update on public.books
  for each row
  execute function public.tracer_leviers_book();

/**
 * `book_prices` — le prix, sous ses trois formes de mutation.
 *
 * Une suppression est tracée aussi : retirer le prix d'une zone retire le titre
 * de la vente dans cette zone, ce qui est une décision commerciale à part
 * entière (N1).
 */
create function public.tracer_prix()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.journaliser_admin(
      'prix_modifie', 'book_price', old.book_id,
      jsonb_build_object('zone', old.zone, 'montant', old.montant, 'devise', old.devise),
      null, null);
    return old;
  end if;

  perform public.journaliser_admin(
    'prix_modifie', 'book_price', new.book_id,
    case when tg_op = 'UPDATE'
      then jsonb_build_object('zone', old.zone, 'montant', old.montant, 'devise', old.devise)
    end,
    jsonb_build_object('zone', new.zone, 'montant', new.montant, 'devise', new.devise),
    null);
  return new;
end;
$$;

create trigger book_prices_tracer
  after insert or update or delete on public.book_prices
  for each row
  execute function public.tracer_prix();

/**
 * `business_settings` — les paramètres qui déplacent les règles elles-mêmes.
 *
 * La ligne entière est enregistrée, et non le champ modifié : ces paramètres
 * sont peu nombreux, ils interagissent, et relire l'état complet à une date
 * donnée vaut mieux que de recomposer une suite de deltas.
 */
create function public.tracer_parametres()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  perform public.journaliser_admin(
    'parametres_modifies', 'business_settings', null,
    to_jsonb(old) - 'maj_le', to_jsonb(new) - 'maj_le', null);
  return new;
end;
$$;

create trigger business_settings_tracer
  after update on public.business_settings
  for each row
  execute function public.tracer_parametres();

/**
 * `entitlements` — l'octroi manuel, et son motif obligatoire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST LE LEVIER QUI DONNE DU CONTENU GRATUITEMENT.                      │
 * │                                                                          │
 * │ Un octroi manuel ne coûte rien à l'exécution, ne laisse aucune trace     │
 * │ comptable — pas de commande, pas de facture — et accorde un accès        │
 * │ définitif. Sans motif, un journal dirait « quelqu'un a offert ce titre » │
 * │ sans jamais dire pourquoi, ce qui n'est pas une trace mais un constat.   │
 * │                                                                          │
 * │ Le motif est donc EXIGÉ dès lors qu'un administrateur est identifié.     │
 * │ Un octroi système sans motif reste possible — les tests et les seeds en   │
 * │ posent — mais il est alors tracé avec un acteur nul, ce qui le distingue  │
 * │ d'une décision humaine au lieu de le confondre avec elle.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Un droit issu d'un ACHAT n'est pas tracé ici : sa trace est la commande
 * elle-même, et la journaliser en double ferait du bruit dans un journal qui
 * doit rester lisible.
 */
create function public.tracer_octroi()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.type = 'offert' then
      perform public.journaliser_admin(
        'droit_retire', 'entitlement', old.id,
        jsonb_build_object('user_id', old.user_id, 'book_id', old.book_id,
                           'type', old.type, 'peut_telecharger', old.peut_telecharger),
        null, null);
    end if;
    return old;
  end if;

  if new.type <> 'offert' then
    return new;
  end if;

  if public.acteur_courant() is not null and public.motif_courant() is null then
    raise exception 'Un octroi manuel de droits exige un motif.'
      using errcode = 'check_violation',
            hint = 'Déposer le motif dans le paramètre de session `app.motif`.';
  end if;

  perform public.journaliser_admin(
    'droit_octroye', 'entitlement', new.id,
    null,
    jsonb_build_object('user_id', new.user_id, 'book_id', new.book_id,
                       'peut_telecharger', new.peut_telecharger,
                       'expire_le', new.expire_le),
    null);
  return new;
end;
$$;

create trigger entitlements_tracer_octroi
  after insert or delete on public.entitlements
  for each row
  execute function public.tracer_octroi();

/**
 * `orders` — le remboursement.
 *
 * Tracé même lorsqu'il vient d'un webhook, avec un acteur nul : savoir qu'un
 * remboursement a eu lieu sans intervention humaine est une information, pas
 * un trou dans le journal.
 */
create function public.tracer_remboursement()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.statut is distinct from old.statut and new.statut = 'rembourse' then
    perform public.journaliser_admin(
      'remboursement', 'order', new.id,
      jsonb_build_object('statut', old.statut, 'montant_total', old.montant_total),
      jsonb_build_object('statut', new.statut),
      null);
  end if;
  return new;
end;
$$;

create trigger orders_tracer_remboursement
  after update on public.orders
  for each row
  execute function public.tracer_remboursement();

/**
 * `subscriptions` — le changement de zone (arbitrage N4).
 *
 * Jamais accessible à l'utilisateur : changer de zone changerait le prix de
 * renouvellement, et le laisser choisir reviendrait à publier une grille
 * tarifaire au choix du client. La trace est donc la contrepartie d'un geste
 * qui n'appartient qu'à l'administration.
 */
create function public.tracer_zone_abonnement()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.zone is distinct from old.zone then
    perform public.journaliser_admin(
      'zone_abonnement_modifiee', 'subscription', new.id,
      jsonb_build_object('zone', old.zone, 'devise', old.devise, 'montant', old.montant),
      jsonb_build_object('zone', new.zone, 'devise', new.devise, 'montant', new.montant),
      null);
  end if;
  return new;
end;
$$;

create trigger subscriptions_tracer_zone
  after update on public.subscriptions
  for each row
  execute function public.tracer_zone_abonnement();

/**
 * `users` — la suspension.
 *
 * L'anonymisation n'est PAS tracée ici : elle est demandée par l'utilisateur
 * lui-même et non par l'administration, et journaliser « ce compte a été
 * effacé » avec son identifiant conserverait un pointeur vers un effacement —
 * ce que R2 cherche précisément à éviter.
 */
create function public.tracer_statut_compte()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.statut is distinct from old.statut and 'anonymise' not in (new.statut::text, old.statut::text) then
    perform public.journaliser_admin(
      case when new.statut = 'suspendu' then 'compte_suspendu' else 'compte_reactive' end,
      'user', new.id,
      jsonb_build_object('statut', old.statut),
      jsonb_build_object('statut', new.statut),
      null);
  end if;
  return new;
end;
$$;

create trigger users_tracer_statut
  after update on public.users
  for each row
  execute function public.tracer_statut_compte();

/**
 * `promo_codes` — création et modification.
 *
 * Un code promotionnel est une remise consentie : son barème, son plafond
 * d'utilisation et sa date d'expiration sont des décisions commerciales.
 */
create function public.tracer_code_promo()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.journaliser_admin(
      'code_promo_modifie', 'promo_code', old.id,
      to_jsonb(old) - 'usage_count', null, null);
    return old;
  end if;

  -- `usage_count` est exclu : il bouge à chaque commande, et le tracer ferait
  -- du journal d'audit un doublon de `promo_redemptions`.
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'usage_count') = (to_jsonb(new) - 'usage_count') then
    return new;
  end if;

  perform public.journaliser_admin(
    'code_promo_modifie', 'promo_code', new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) - 'usage_count' end,
    to_jsonb(new) - 'usage_count',
    null);
  return new;
end;
$$;

create trigger promo_codes_tracer
  after insert or update or delete on public.promo_codes
  for each row
  execute function public.tracer_code_promo();
