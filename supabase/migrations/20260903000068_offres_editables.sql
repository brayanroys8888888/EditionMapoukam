-- ═══════════════════════════════════════════════════════════════════════════
-- LES OFFRES D'ABONNEMENT QUITTENT LES VARIABLES D'ENVIRONNEMENT.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision de l'éditeur, 3 septembre 2026. Jusqu'ici, les deux formules
-- d'abonnement étaient `PRICE_SUBSCRIPTION_MONTHLY` et
-- `PRICE_SUBSCRIPTION_YEARLY` : deux nombres dans `.env.local`, deux codes
-- (`mensuel`, `annuel`) écrits en dur dans quinze fichiers, et aucune façon de
-- créer une troisième offre sans redéployer.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ CE QUE CE CHANGEMENT DÉPLACE, ET CE QU'IL NE DÉPLACE PAS.               │
-- │                                                                         │
-- │ Il déplace le CATALOGUE COMMERCIAL — quelles offres existent, comment    │
-- │ elles s'appellent, combien elles coûtent dans chaque zone. Cela devient  │
-- │ de la donnée, éditable depuis `/admin/offres`.                          │
-- │                                                                         │
-- │ Il ne déplace AUCUNE règle. Ce qu'un abonnement ouvre reste écrit dans   │
-- │ `abonnement_ouvre_droit` et dans `access_for_books` (migration 0067) :   │
-- │ créer une offre ne crée jamais un droit nouveau, elle vend un droit qui  │
-- │ existe déjà. Une offre porte un DOMAINE, et le domaine dit tout.         │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ PRIX PAR ZONE, COMME `book_prices` — ET POUR LA MÊME RAISON.            │
-- │                                                                         │
-- │ §3.3 : deux zones, deux grilles, aucune conversion de taux de change à   │
-- │ l'exécution. Un montant est toujours dans la plus petite unité de sa     │
-- │ devise : 799 EUR = 7,99 €, 2500 XAF = 2 500 FCFA.                        │
-- │                                                                         │
-- │ UNE OFFRE SANS PRIX DANS UNE ZONE N'Y EST PAS VENDUE. `catalog_list`     │
-- │ liste un livre sans prix — il peut être lisible par abonnement. Une      │
-- │ offre sans prix, elle, ne mène nulle part : la lister serait promettre   │
-- │ un bouton qui ne peut pas aboutir. `offres_publiques` l'omet donc, et    │
-- │ l'écran d'administration signale le manque à l'éditeur.                 │
-- └─────────────────────────────────────────────────────────────────────────┘

-- ---------------------------------------------------------------------------
-- 1. LES OFFRES
-- ---------------------------------------------------------------------------

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),

  -- Le code est l'identifiant STABLE de l'offre : c'est lui que transporte une
  -- demande de souscription, et lui qu'on retrouve dans un événement de
  -- paiement. Il ne se renomme pas — d'où le contrôle de forme, qui exclut
  -- l'espace et l'accent, et l'unicité.
  code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  domaine public.subscription_domain not null,

  -- La périodicité, et non une durée en jours : c'est elle qui dit de combien
  -- avance `fin_periode` à chaque renouvellement, et `dureeEnMois` en est
  -- l'unique traduction côté application.
  periode text not null check (periode in ('mensuel', 'annuel')),

  libelle_fr text not null check (length(btrim(libelle_fr)) > 0),
  libelle_en text not null check (length(btrim(libelle_en)) > 0),
  descriptif_fr text,
  descriptif_en text,

  -- `false` PAR DÉFAUT. Une offre naît invisible : on la crée, on lui pose ses
  -- prix, on la relit, puis on l'ouvre. L'inverse — naître ouverte — mettrait
  -- en vente une offre à moitié saisie le temps de la compléter.
  actif boolean not null default false,

  ordre smallint not null default 0,

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now()
);

comment on table public.subscription_plans is
  'Catalogue commercial des abonnements (§3.6, §4.3 F12 bis). Éditable depuis l''administration. Une offre VEND un droit ; elle n''en définit aucun — c''est `domaine` qui dit ce qu''elle ouvre, et la règle vit dans `abonnement_ouvre_droit`.';
comment on column public.subscription_plans.domaine is
  'Ce que l''abonnement souscrit sur cette offre ouvrira. Recopié sur `subscriptions.domaine` à la souscription, et jamais relu ensuite : modifier une offre ne doit pas changer ce qu''un contrat en cours a acheté.';
comment on column public.subscription_plans.actif is
  'Offre ouverte à la souscription. Une offre sans aucun prix ne peut pas être activée : `admin_modifier_offre` le refuse.';

create index subscription_plans_domaine_idx
  on public.subscription_plans (domaine, actif, ordre);

-- ---------------------------------------------------------------------------
-- 2. LES PRIX
-- ---------------------------------------------------------------------------

create table public.plan_prices (
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  zone public.price_zone not null,
  montant bigint not null check (montant >= 0),
  devise text not null references public.currencies (code),
  maj_le timestamptz not null default public.app_now(),
  primary key (plan_id, zone)
);

comment on table public.plan_prices is
  'Prix d''une offre par zone (§3.3). Même forme que `book_prices`, et même règle : aucune conversion de taux de change, chaque montant est écrit à la main pour sa zone.';
comment on column public.plan_prices.devise is
  'Devise de CETTE ligne. Jamais déduite de la zone : la zone afrique couvre XAF et XOF (docs/PLAN.md D4 point 4).';

-- ---------------------------------------------------------------------------
-- 3. L'ABONNEMENT SAIT DE QUELLE OFFRE IL VIENT
--
-- `on delete set null` et non `restrict` : une offre retirée du catalogue ne
-- doit pas empêcher la suppression d'un compte, ni figer la table. Les
-- conditions du contrat — `montant`, `devise`, `zone`, `offre` — sont déjà
-- FIGÉES sur la ligne d'abonnement depuis la 0008 ; `plan_id` est une
-- provenance, pas une dépendance.
--
-- `admin_supprimer_offre` refuse malgré tout de supprimer une offre souscrite :
-- perdre la provenance d'un contrat en cours n'apporterait rien.
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column plan_id uuid references public.subscription_plans (id) on delete set null;

comment on column public.subscriptions.plan_id is
  'Offre d''origine du contrat. INFORMATIVE : les conditions (montant, devise, zone, périodicité) sont figées sur la ligne d''abonnement et ne sont jamais relues depuis l''offre.';

create index subscriptions_plan_idx on public.subscriptions (plan_id);

-- ---------------------------------------------------------------------------
-- 4. SÉCURITÉ — RLS et privilèges (CLAUDE.md règle 1)
--
-- Ce sont des données commerciales PUBLIQUES : un prix affiché sur la page des
-- offres n'est pas un secret. Lisibles, donc — mais seulement quand l'offre est
-- ACTIVE : une offre en préparation, avec son prix pas encore arrêté, ne doit
-- pas se lire depuis le navigateur avant que l'éditeur ne l'ouvre.
--
-- Aucun privilège d'écriture n'est accordé à personne : toute mutation passe
-- par une fonction `admin_*` qui revérifie le rôle en base.
-- ---------------------------------------------------------------------------

alter table public.subscription_plans enable row level security;
alter table public.plan_prices        enable row level security;

grant select on public.subscription_plans to anon, authenticated;
grant select on public.plan_prices        to anon, authenticated;

create policy subscription_plans_lecture_publique on public.subscription_plans
  for select to anon, authenticated
  using (actif);

create policy plan_prices_lecture_publique on public.plan_prices
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.subscription_plans p
      where p.id = plan_prices.plan_id and p.actif
    )
  );

-- ---------------------------------------------------------------------------
-- 5. LA LECTURE PUBLIQUE — une seule réponse à « quelles offres, à quel prix »
--
-- `security definer` pour la même raison que le reste du projet : la même
-- réponse doit être rendue à un visiteur anonyme et à un abonné, sans que la
-- politique RLS de l'appelant fasse varier la liste.
-- ---------------------------------------------------------------------------

create function public.offres_publiques(
  p_zone public.price_zone default 'international',
  p_domaine public.subscription_domain default null
)
  returns table (
    code text,
    domaine public.subscription_domain,
    periode text,
    libelle_fr text,
    libelle_en text,
    descriptif_fr text,
    descriptif_en text,
    montant bigint,
    devise text,
    ordre smallint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    p.code,
    p.domaine,
    p.periode,
    p.libelle_fr,
    p.libelle_en,
    p.descriptif_fr,
    p.descriptif_en,
    pr.montant,
    pr.devise,
    p.ordre
  from public.subscription_plans p
  -- JOINTURE INTERNE, ET C'EST LE POINT. Une offre sans prix dans la zone
  -- demandée ne sort pas : on ne propose pas une souscription qui ne peut pas
  -- aboutir.
  join public.plan_prices pr on pr.plan_id = p.id and pr.zone = p_zone
  where p.actif
    and (p_domaine is null or p.domaine = p_domaine)
  order by p.domaine, p.ordre, p.periode desc, p.code;
$fn$;

comment on function public.offres_publiques(public.price_zone, public.subscription_domain) is
  'Offres ouvertes à la souscription pour une zone. Une offre sans prix dans cette zone n''y figure PAS : elle ne peut pas être souscrite.';

grant execute on function public.offres_publiques(public.price_zone, public.subscription_domain)
  to anon, authenticated, service_role;

/**
 * Une offre par son code, avec le prix de la zone demandée.
 *
 * Employée à la souscription, où il faut retrouver le montant à porter au
 * contrat. Rend zéro ligne si l'offre est inactive ou sans prix dans la zone —
 * les deux cas où la souscription doit être refusée, et refusée en un seul
 * endroit.
 */
create function public.offre_par_code(
  p_code text,
  p_zone public.price_zone default 'international'
)
  returns table (
    id uuid,
    code text,
    domaine public.subscription_domain,
    periode text,
    montant bigint,
    devise text
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select p.id, p.code, p.domaine, p.periode, pr.montant, pr.devise
  from public.subscription_plans p
  join public.plan_prices pr on pr.plan_id = p.id and pr.zone = p_zone
  where p.actif and p.code = p_code;
$fn$;

comment on function public.offre_par_code(text, public.price_zone) is
  'Une offre active et son prix dans une zone. Zéro ligne = offre inconnue, inactive, ou sans prix dans cette zone : les trois refus de souscription, en un seul endroit.';

grant execute on function public.offre_par_code(text, public.price_zone)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. L'ADMINISTRATION
--
-- Chaque mutation revérifie le rôle EN BASE via `admin_poser_acteur`, qui pose
-- aussi l'acteur pour les déclencheurs d'audit. C'est le troisième des trois
-- contrôles indépendants (CLAUDE.md, « l'administration est la surface la plus
-- privilégiée »).
-- ---------------------------------------------------------------------------

create function public.admin_lister_offres()
  returns table (
    id uuid,
    code text,
    domaine public.subscription_domain,
    periode text,
    libelle_fr text,
    libelle_en text,
    descriptif_fr text,
    descriptif_en text,
    actif boolean,
    ordre smallint,
    prix jsonb,
    -- Zones sans prix : ce que l'éditeur doit compléter avant d'activer. Rendu
    -- par la base plutôt que déduit par l'écran, pour la même raison que
    -- `manques_pour_publication` — un manque calculé deux fois se contredit.
    manques text[],
    abonnements bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select
    p.id,
    p.code,
    p.domaine,
    p.periode,
    p.libelle_fr,
    p.libelle_en,
    p.descriptif_fr,
    p.descriptif_en,
    p.actif,
    p.ordre,
    coalesce(
      (
        select jsonb_object_agg(pr.zone, jsonb_build_object('montant', pr.montant, 'devise', pr.devise))
        from public.plan_prices pr where pr.plan_id = p.id
      ),
      '{}'::jsonb
    ) as prix,
    array(
      select z::text
      from unnest(enum_range(null::public.price_zone)) as z
      where not exists (
        select 1 from public.plan_prices pr where pr.plan_id = p.id and pr.zone = z
      )
      order by z::text
    ) as manques,
    (select count(*) from public.subscriptions s where s.plan_id = p.id) as abonnements
  from public.subscription_plans p
  order by p.domaine, p.ordre, p.code;
$fn$;

comment on function public.admin_lister_offres() is
  'Toutes les offres, actives ou non, avec leurs prix par zone, les zones qui en manquent, et le nombre d''abonnements souscrits dessus.';

revoke all on function public.admin_lister_offres() from public, anon, authenticated;
grant execute on function public.admin_lister_offres() to service_role;

create function public.admin_creer_offre(
  p_acteur uuid,
  p_code text,
  p_domaine public.subscription_domain,
  p_periode text,
  p_libelle_fr text,
  p_libelle_en text,
  p_descriptif_fr text default null,
  p_descriptif_en text default null,
  p_ordre smallint default 0
)
  returns public.subscription_plans
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_offre public.subscription_plans;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  insert into public.subscription_plans
    (code, domaine, periode, libelle_fr, libelle_en, descriptif_fr, descriptif_en, ordre)
  values
    (btrim(lower(p_code)), p_domaine, p_periode, btrim(p_libelle_fr), btrim(p_libelle_en),
     nullif(btrim(coalesce(p_descriptif_fr, '')), ''),
     nullif(btrim(coalesce(p_descriptif_en, '')), ''),
     coalesce(p_ordre, 0))
  returning * into v_offre;

  -- Née INACTIVE, et le rappeler ici évite la question : le `default` de la
  -- colonne est la seule autorité, cette fonction ne le contredit pas.
  return v_offre;
end;
$fn$;

comment on function public.admin_creer_offre(uuid, text, public.subscription_domain, text, text, text, text, text, smallint) is
  'Crée une offre, toujours INACTIVE : ses prix doivent être posés avant qu''elle ne soit ouverte à la vente.';

revoke all on function public.admin_creer_offre(uuid, text, public.subscription_domain, text, text, text, text, text, smallint)
  from public, anon, authenticated;
grant execute on function public.admin_creer_offre(uuid, text, public.subscription_domain, text, text, text, text, text, smallint)
  to service_role;

/**
 * Modification d'une offre.
 *
 * Le DOMAINE et la PÉRIODICITÉ ne figurent pas parmi les champs modifiables, et
 * c'est délibéré : les changer changerait rétroactivement le sens des contrats
 * déjà souscrits sur cette offre — un abonné « lecture » deviendrait un abonné
 * « association » sans avoir rien signé. Pour changer l'un des deux, on crée
 * une autre offre et on désactive celle-ci.
 */
create function public.admin_modifier_offre(
  p_acteur uuid,
  p_id uuid,
  p_libelle_fr text default null,
  p_libelle_en text default null,
  p_descriptif_fr text default null,
  p_descriptif_en text default null,
  p_ordre smallint default null,
  p_actif boolean default null
)
  returns public.subscription_plans
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_offre public.subscription_plans;
  v_prix integer;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if not exists (select 1 from public.subscription_plans where id = p_id) then
    raise exception 'Offre % introuvable.', p_id using errcode = 'no_data_found';
  end if;

  -- ┌──────────────────────────────────────────────────────────────────────┐
  -- │ UNE OFFRE SANS AUCUN PRIX NE S'ACTIVE PAS.                           │
  -- │                                                                      │
  -- │ Activée, elle serait invisible partout : `offres_publiques` la joint  │
  -- │ à ses prix et n'en trouverait aucun. L'éditeur croirait avoir mis une │
  -- │ offre en vente, et personne ne la verrait jamais. Un refus nommé vaut │
  -- │ mieux qu'une activation sans effet.                                   │
  -- └──────────────────────────────────────────────────────────────────────┘
  if p_actif is true then
    select count(*) into v_prix from public.plan_prices where plan_id = p_id;
    if v_prix = 0 then
      raise exception 'Cette offre n''a aucun prix : elle ne peut pas etre activee.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.subscription_plans
  set libelle_fr = coalesce(nullif(btrim(coalesce(p_libelle_fr, '')), ''), libelle_fr),
      libelle_en = coalesce(nullif(btrim(coalesce(p_libelle_en, '')), ''), libelle_en),
      -- La chaîne VIDE efface le descriptif, `null` le laisse tel quel. C'est
      -- la convention déjà retenue pour le résumé d'une version linguistique
      -- (migration 0057) : sans elle, un texte posé par erreur ne s'enlève pas.
      descriptif_fr = case when p_descriptif_fr is null then descriptif_fr
                           else nullif(btrim(p_descriptif_fr), '') end,
      descriptif_en = case when p_descriptif_en is null then descriptif_en
                           else nullif(btrim(p_descriptif_en), '') end,
      ordre = coalesce(p_ordre, ordre),
      actif = coalesce(p_actif, actif),
      maj_le = public.app_now()
  where id = p_id
  returning * into v_offre;

  return v_offre;
end;
$fn$;

comment on function public.admin_modifier_offre(uuid, uuid, text, text, text, text, smallint, boolean) is
  'Modifie une offre. Ni le domaine ni la périodicité ne sont modifiables : les changer réécrirait le sens des contrats déjà souscrits.';

revoke all on function public.admin_modifier_offre(uuid, uuid, text, text, text, text, smallint, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_modifier_offre(uuid, uuid, text, text, text, text, smallint, boolean)
  to service_role;

create function public.admin_poser_prix_offre(
  p_acteur uuid,
  p_id uuid,
  p_zone public.price_zone,
  p_montant bigint,
  p_devise text
)
  returns public.plan_prices
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_prix public.plan_prices;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if not exists (select 1 from public.subscription_plans where id = p_id) then
    raise exception 'Offre % introuvable.', p_id using errcode = 'no_data_found';
  end if;

  insert into public.plan_prices (plan_id, zone, montant, devise)
  values (p_id, p_zone, p_montant, upper(btrim(p_devise)))
  on conflict (plan_id, zone) do update
    set montant = excluded.montant,
        devise = excluded.devise,
        maj_le = public.app_now()
  returning * into v_prix;

  return v_prix;
end;
$fn$;

comment on function public.admin_poser_prix_offre(uuid, uuid, public.price_zone, bigint, text) is
  'Pose ou remplace le prix d''une offre dans une zone. N''affecte AUCUN contrat en cours : les conditions sont figées sur la ligne d''abonnement (docs/PLAN.md D4 point 6).';

revoke all on function public.admin_poser_prix_offre(uuid, uuid, public.price_zone, bigint, text)
  from public, anon, authenticated;
grant execute on function public.admin_poser_prix_offre(uuid, uuid, public.price_zone, bigint, text)
  to service_role;

/**
 * Suppression d'une offre.
 *
 * Refusée dès qu'un abonnement en vient — même terminé. Supprimer effacerait la
 * provenance d'un contrat, et donc la réponse à « qu'est-ce que cette personne
 * a acheté ». Le bon geste sur une offre qu'on ne veut plus vendre est de la
 * DÉSACTIVER : elle disparaît des écrans publics et les contrats en cours vont
 * à leur terme.
 */
create function public.admin_supprimer_offre(p_acteur uuid, p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_abonnements integer;
begin
  perform public.admin_poser_acteur(p_acteur, null);

  if not exists (select 1 from public.subscription_plans where id = p_id) then
    raise exception 'Offre % introuvable.', p_id using errcode = 'no_data_found';
  end if;

  select count(*) into v_abonnements from public.subscriptions where plan_id = p_id;
  if v_abonnements > 0 then
    raise exception 'Cette offre a ete souscrite % fois : desactivez-la plutot que de la supprimer.', v_abonnements
      using errcode = 'check_violation';
  end if;

  delete from public.subscription_plans where id = p_id;
end;
$fn$;

comment on function public.admin_supprimer_offre(uuid, uuid) is
  'Supprime une offre JAMAIS souscrite. Une offre souscrite se désactive, elle ne se supprime pas : sa suppression effacerait la provenance de contrats réels.';

revoke all on function public.admin_supprimer_offre(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_supprimer_offre(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. LES DEUX OFFRES QUI EXISTAIENT DÉJÀ
--
-- Reprises À L'IDENTIQUE des variables d'environnement et de la grille de §3.3 :
-- 7,99 € et 69 € en zone internationale, 2 500 et 22 000 FCFA en zone Afrique.
-- Elles naissent ACTIVES, contrairement à la règle générale — elles étaient
-- déjà en vente hier, et cette migration ne doit rien fermer.
--
-- LES OFFRES ASSOCIATIVES NE SONT PAS SEMÉES ICI. Leur prix n'a pas été arrêté
-- par l'éditeur, et inventer un montant serait le pire des services : il
-- s'afficherait comme un prix décidé. L'éditeur les crée depuis
-- `/admin/offres`, et rien n'est vendu tant qu'il ne l'a pas fait.
-- ---------------------------------------------------------------------------

insert into public.subscription_plans
  (code, domaine, periode, libelle_fr, libelle_en, descriptif_fr, descriptif_en, actif, ordre)
values
  ('lecture-mensuel', 'lecture', 'mensuel',
   'Abonnement mensuel', 'Monthly subscription',
   'Lecture en ligne illimitée du catalogue. Sans engagement.',
   'Unlimited online reading of the catalogue. Cancel anytime.',
   true, 10),
  ('lecture-annuel', 'lecture', 'annuel',
   'Abonnement annuel', 'Yearly subscription',
   'Lecture en ligne illimitée du catalogue, environ deux mois offerts.',
   'Unlimited online reading of the catalogue, about two months free.',
   true, 20);

insert into public.plan_prices (plan_id, zone, montant, devise)
select p.id, z.zone, z.montant, z.devise
from public.subscription_plans p
join (values
  ('lecture-mensuel', 'international'::public.price_zone, 799::bigint,   'EUR'),
  ('lecture-mensuel', 'afrique'::public.price_zone,       2500::bigint,  'XAF'),
  ('lecture-annuel',  'international'::public.price_zone, 6900::bigint,  'EUR'),
  ('lecture-annuel',  'afrique'::public.price_zone,       22000::bigint, 'XAF')
) as z(code, zone, montant, devise) on z.code = p.code;

-- Les abonnements déjà souscrits sont rattachés à l'offre correspondante. Sans
-- ce rattachement, `admin_lister_offres` afficherait « 0 abonnement » sur une
-- offre qui en porte, et `admin_supprimer_offre` la laisserait supprimer.
update public.subscriptions s
set plan_id = p.id
from public.subscription_plans p
where p.domaine = 'lecture'
  and p.periode = s.offre
  and s.plan_id is null;
