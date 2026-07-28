-- 0016 — Moteur de droits d'accès
--
-- LE MODULE QUI CONCENTRE LE RISQUE DU PROJET.
--
-- Implémenté en PostgreSQL, et non en TypeScript, pour une raison précise : les
-- politiques RLS doivent pouvoir l'appeler, et une politique RLS ne sait pas
-- invoquer du code applicatif. Une seule implémentation, appelée à la fois par
-- le RLS et par l'application. Si la logique existait à deux endroits, elle
-- divergerait — et la divergence porterait sur qui a le droit de lire quoi.
--
-- La couche TypeScript n'est qu'un appelant typé : elle ne réimplémente aucune
-- règle, et un test vérifie qu'elle n'en contient aucune.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SÉMANTIQUE (docs/PLAN.md D5) — trois calculs INDÉPENDANTS
-- ─────────────────────────────────────────────────────────────────────────────
--
--   can_read     OU LOGIQUE entre toutes les sources. L'ordre n'a aucune
--                importance.
--
--   can_download INDÉPENDANT de `reason`. Ne dépend que d'un droit `achat` ou
--                `offert` portant peut_telecharger. JAMAIS accordé par un
--                abonnement (§3.2), jamais par `gratuit`.
--
--   reason       Le titre LE PLUS FORT détenu :
--                purchase > granted > subscription > free > preview
--                `none` = livre non exploitable, même pas d'extrait.
--
-- Un acheteur ne doit jamais voir « gratuit » : il a payé.

-- ---------------------------------------------------------------------------
-- Paramètres métier
--
-- La fenêtre de 3 mois et la période de grâce sont lues ICI, en base, et non
-- dans l'environnement : une politique RLS n'a pas accès aux variables du
-- processus Node. La base est donc l'autorité, et un test vérifie que les
-- variables d'environnement de l'application concordent.
-- ---------------------------------------------------------------------------

create table public.business_settings (
  id smallint primary key default 1 check (id = 1),
  fenetre_nouveaute_jours integer not null default 90 check (fenetre_nouveaute_jours >= 0),
  periode_grace_jours integer not null default 7 check (periode_grace_jours >= 0),
  maj_le timestamptz not null default public.app_now()
);

comment on table public.business_settings is
  'Paramètres métier lus par le moteur de droits. Autorité unique : les politiques RLS ne peuvent pas lire l''environnement du processus applicatif.';
comment on column public.business_settings.fenetre_nouveaute_jours is
  'Durée de la fenêtre de vente exclusive avant entrée dans l''abonnement (§3.2). 90 jours = les 3 mois de la spécification.';
comment on column public.business_settings.periode_grace_jours is
  'Durée pendant laquelle l''accès est maintenu après un échec de prélèvement (§9.1).';

insert into public.business_settings (id) values (1);

alter table public.business_settings enable row level security;

grant select on public.business_settings to anon, authenticated;

-- Lisible : ce sont des règles commerciales publiques, pas des secrets. Non
-- modifiable : aucun privilège d'écriture n'est accordé.
create policy business_settings_lecture_publique on public.business_settings
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Décision d'accès
-- ---------------------------------------------------------------------------

create type public.access_decision as (
  can_read boolean,
  can_download boolean,
  reason public.access_reason
);

/**
 * Version par LOT — l'implémentation de référence.
 *
 * Résolue en UNE seule requête, quel que soit le nombre de titres. Sans elle,
 * l'affichage d'un catalogue de 40 contes déclencherait 40 requêtes.
 *
 * `security definer` : appelée depuis des politiques RLS évaluées en tant
 * qu'`anon`, qui n'a aucun droit de lecture sur `entitlements` ni
 * `subscriptions`. Sans cela, un visiteur ne pourrait jamais rien lire.
 */
create function public.access_for_books(
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
    select fenetre_nouveaute_jours, periode_grace_jours from public.business_settings where id = 1
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
      (
        ab.ouvre_droit
        and d.inclus_abonnement
        and d.statut = 'publie'
        and d.publie_le is not null
        -- Fenêtre de vente exclusive : le titre n'entre dans l'abonnement
        -- qu'une fois la fenêtre écoulée (§3.2).
        and d.publie_le + make_interval(days => pa.fenetre_nouveaute_jours) <= p_at
      ) as par_abonnement
    from demandes d
    cross join appelant a
    cross join abonnement ab
    cross join parametres pa
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
    -- `gratuit`. C'est la règle métier la plus sensible du projet.
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
  'Décision d''accès pour un lot de titres, en une seule requête. Implémentation de référence : access_for() n''en est qu''un raccourci.';

/**
 * Version unitaire.
 *
 * Un simple raccourci sur la version par lot : il ne doit exister qu'UNE
 * implémentation des règles. Un test vérifie que les deux donnent exactement
 * les mêmes réponses sur les mêmes entrées.
 */
create function public.access_for(
  p_user uuid,
  p_book uuid,
  p_at timestamptz default public.app_now()
)
  returns public.access_decision
  language sql
  stable
as $$
  select (a.can_read, a.can_download, a.reason)::public.access_decision
  from public.access_for_books(p_user, array[p_book], p_at) a;
$$;

comment on function public.access_for(uuid, uuid, timestamptz) is
  'Décision d''accès pour un titre. Raccourci sur access_for_books : aucune règle n''est réimplémentée ici.';

grant execute on function public.access_for_books(uuid, uuid[], timestamptz)
  to anon, authenticated, service_role;
grant execute on function public.access_for(uuid, uuid, timestamptz)
  to anon, authenticated, service_role;
