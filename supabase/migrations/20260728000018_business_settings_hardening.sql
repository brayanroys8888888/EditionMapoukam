-- 0018 — `business_settings` : source unique, bornée et tracée
--
-- CONSTAT CORRIGÉ ICI
--
-- La migration 0016 posait la table comme autorité, mais l'application
-- conservait `NEW_RELEASE_WINDOW_DAYS` et `PAYMENT_GRACE_PERIOD_DAYS` dans son
-- environnement, avec un test pour vérifier la concordance des deux. Un test de
-- concordance traite le symptôme : il constate la divergence au lieu de la
-- rendre impossible. La table devient donc la source UNIQUE, et les variables
-- d'environnement disparaissent.
--
-- EFFET RÉTROACTIF — À CONNAÎTRE AVANT DE TOUCHER À CES VALEURS
--
-- Ces réglages ne sont pas de la configuration technique : ils ont un effet
-- commercial immédiat et rétroactif. Réduire la fenêtre de nouveauté de 90 à
-- 60 jours fait basculer, À LA SECONDE, tous les titres publiés entre ces deux
-- bornes dans l'abonnement — sans migration, sans déploiement, sans que
-- personne ne s'en aperçoive. C'est du chiffre d'affaires unitaire transformé
-- en lecture incluse.
--
-- D'où les trois garde-fous posés ici : des bornes en base, une trace de qui a
-- modifié quoi, et une fonction de comptage des titres impactés que l'écran
-- d'administration doit afficher AVANT validation.

-- ---------------------------------------------------------------------------
-- Bornes appliquées par la base
--
-- Un formulaire d'administration peut être contourné : par un appel direct,
-- par un script de reprise, par une console. La contrainte, elle, tient.
-- ---------------------------------------------------------------------------

alter table public.business_settings
  drop constraint business_settings_fenetre_nouveaute_jours_check;
alter table public.business_settings
  drop constraint business_settings_periode_grace_jours_check;

alter table public.business_settings
  add constraint business_settings_fenetre_bornee
  check (fenetre_nouveaute_jours between 0 and 730);

alter table public.business_settings
  add constraint business_settings_grace_bornee
  check (periode_grace_jours between 0 and 90);

comment on constraint business_settings_fenetre_bornee on public.business_settings is
  'Zéro = tout titre entre immédiatement dans l''abonnement. Deux ans = borne haute au-delà de laquelle l''abonnement perdrait sa raison d''être (§3.3).';
comment on constraint business_settings_grace_bornee on public.business_settings is
  'Quatre-vingt-dix jours au maximum : au-delà, un impayé reviendrait à offrir un trimestre d''abonnement.';

-- ---------------------------------------------------------------------------
-- Trace des modifications
-- ---------------------------------------------------------------------------

alter table public.business_settings
  add column maj_par uuid references public.users (id) on delete set null;

comment on column public.business_settings.maj_par is
  'Administrateur ayant procédé à la dernière modification. Nul pour les valeurs posées par migration.';

create table public.business_settings_audit (
  id uuid primary key default gen_random_uuid(),
  modifie_le timestamptz not null default public.app_now(),
  modifie_par uuid references public.users (id) on delete set null,
  avant jsonb not null,
  apres jsonb not null
);

comment on table public.business_settings_audit is
  'Historique des modifications des paramètres métier. Ces réglages ont un effet commercial direct et rétroactif : savoir qui les a changés, quand, et depuis quelles valeurs n''est pas un luxe.';

create index business_settings_audit_date_idx on public.business_settings_audit (modifie_le desc);

create function public.tracer_business_settings()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  insert into public.business_settings_audit (modifie_par, avant, apres)
  values (
    new.maj_par,
    to_jsonb(old) - 'maj_le' - 'maj_par',
    to_jsonb(new) - 'maj_le' - 'maj_par'
  );
  new.maj_le := public.app_now();
  return new;
end;
$$;

create trigger business_settings_tracees
  before update on public.business_settings
  for each row
  when (
    old.fenetre_nouveaute_jours is distinct from new.fenetre_nouveaute_jours
    or old.periode_grace_jours is distinct from new.periode_grace_jours
  )
  execute function public.tracer_business_settings();

alter table public.business_settings_audit enable row level security;

create policy business_settings_audit_aucun_acces_client on public.business_settings_audit
  for all to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Lecture garantie quel que soit le rôle appelant
--
-- `access_for_books` est déjà `security definer` et lit donc la table en tant
-- que propriétaire de la fonction. `access_for` le devient aussi : le jour où
-- l'on retirerait le privilège de lecture publique sur `business_settings`,
-- rien ne doit cesser de fonctionner pour un visiteur anonyme.
-- ---------------------------------------------------------------------------

create or replace function public.access_for(
  p_user uuid,
  p_book uuid,
  p_at timestamptz default public.app_now()
)
  returns public.access_decision
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select (a.can_read, a.can_download, a.reason)::public.access_decision
  from public.access_for_books(p_user, array[p_book], p_at) a;
$$;

-- ---------------------------------------------------------------------------
-- Comptage des titres impactés
--
-- À afficher AVANT validation dans l'écran d'administration (étape 13). Sans
-- ce chiffre, l'administrateur modifie une règle commerciale à l'aveugle.
-- ---------------------------------------------------------------------------

create function public.titres_impactes_par_fenetre(
  p_nouvelle_fenetre integer,
  p_at timestamptz default public.app_now()
)
  returns table (
    entrent_dans_abonnement integer,
    sortent_de_l_abonnement integer
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with actuelle as (
    select fenetre_nouveaute_jours as jours from public.business_settings where id = 1
  ),
  eligibilite as (
    select
      b.id,
      (b.publie_le + make_interval(days => a.jours) <= p_at) as avant,
      (b.publie_le + make_interval(days => p_nouvelle_fenetre) <= p_at) as apres
    from public.books b
    cross join actuelle a
    where b.statut = 'publie'
      and b.inclus_abonnement
      and b.publie_le is not null
  )
  select
    count(*) filter (where not avant and apres)::integer,
    count(*) filter (where avant and not apres)::integer
  from eligibilite;
$$;

comment on function public.titres_impactes_par_fenetre(integer, timestamptz) is
  'Nombre de titres qui entreraient dans l''abonnement, et nombre qui en sortiraient, si la fenêtre passait à la valeur donnée. Destiné à l''écran de confirmation de l''administration.';

grant execute on function public.titres_impactes_par_fenetre(integer, timestamptz) to service_role;
