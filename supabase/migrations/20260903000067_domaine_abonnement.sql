-- ═══════════════════════════════════════════════════════════════════════════
-- UN ABONNEMENT A UN DOMAINE. IL Y EN A DEUX, ET ILS SONT ÉTANCHES.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision de l'éditeur, 3 septembre 2026. La plateforme portait un seul
-- abonnement — la lecture en ligne du catalogue. Elle en porte deux :
--
--   `lecture`      lire le catalogue en ligne             (§3.1 flux A)
--   `association`  lire le contenu de l'Association Dave  (§3.6, nouveau)
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ ÉTANCHES, ET C'EST LA RÈGLE QUE CETTE MIGRATION EXISTE POUR TENIR.      │
-- │                                                                         │
-- │ Un abonné `association` n'a AUCUN droit sur le catalogue. Un abonné      │
-- │ `lecture` n'a AUCUN droit sur le contenu associatif. Un même compte peut │
-- │ détenir les deux — ce sont deux contrats, payés séparément.             │
-- │                                                                         │
-- │ Ni l'un ni l'autre n'accorde le TÉLÉCHARGEMENT : seul un achat le fait   │
-- │ (§3.2 principe 1). Cette migration ne touche pas `can_download`.         │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ LE DANGER PRÉCIS DE CETTE MIGRATION.                                    │
-- │                                                                         │
-- │ `access_for_books` demandait « cet utilisateur a-t-il un abonnement      │
-- │ vivant ? ». Sans le filtre de domaine ajouté ici, souscrire à            │
-- │ l'association ouvrirait TOUT LE CATALOGUE — une plateforme donnée pour   │
-- │ le prix du contenu associatif, sans qu'aucun message ne le signale.      │
-- │                                                                         │
-- │ C'est pourquoi la condition « abonnement vivant » quitte le corps du     │
-- │ moteur de droits pour devenir une fonction nommée, prenant le domaine    │
-- │ en argument OBLIGATOIRE : on ne peut plus l'appeler sans dire duquel on  │
-- │ parle.                                                                  │
-- └─────────────────────────────────────────────────────────────────────────┘

create type public.subscription_domain as enum ('lecture', 'association');

comment on type public.subscription_domain is
  'Domaine d''un abonnement (§3.6). `lecture` ouvre le catalogue en ligne, `association` ouvre le contenu associatif. Étanches et cumulables ; aucun n''ouvre le téléchargement.';

-- ---------------------------------------------------------------------------
-- 1. LA COLONNE
--
-- `default 'lecture'` : tout abonnement existant est un abonnement de lecture,
-- puisque c'est le seul qui existait. La valeur par défaut reste sur la
-- colonne — un `insert` qui ne dit rien décrit le contrat historique, et non un
-- abonnement associatif accordé par inadvertance.
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column domaine public.subscription_domain not null default 'lecture';

comment on column public.subscriptions.domaine is
  'Ce que cet abonnement ouvre (§3.6). ÉTANCHE : `association` n''ouvre aucun titre du catalogue, `lecture` n''ouvre aucun contenu associatif.';

-- ---------------------------------------------------------------------------
-- 2. UN SEUL ABONNEMENT VIVANT PAR DOMAINE, ET NON PAR COMPTE
--
-- L'index de la 0008 interdisait deux abonnements vivants pour un même compte.
-- Il interdirait maintenant de s'abonner à l'association quand on lit déjà —
-- c'est-à-dire exactement le cumul que l'éditeur a décidé d'autoriser.
--
-- La contrainte n'est pas levée, elle est REPORTÉE sur le couple : un compte a
-- au plus un abonnement vivant PAR DOMAINE. Deux abonnements de lecture
-- simultanés restent impossibles, et c'était le vrai objet de l'index.
-- ---------------------------------------------------------------------------

drop index if exists public.subscriptions_un_seul_actif_idx;

create unique index subscriptions_un_seul_actif_idx
  on public.subscriptions (user_id, domaine)
  where statut in ('essai', 'actif', 'impaye');

comment on index public.subscriptions_un_seul_actif_idx is
  'Au plus un abonnement vivant par compte ET PAR DOMAINE (0067). Les statuts terminaux restent pour l''historique.';

create index subscriptions_domaine_idx on public.subscriptions (user_id, domaine);

-- ---------------------------------------------------------------------------
-- 3. « CET ABONNEMENT OUVRE-T-IL LE DROIT ? » — UNE SEULE IMPLÉMENTATION
--
-- Le corps vient VERBATIM de la CTE `abonnement` de `access_for_books`
-- (migration 0064). Il n'est pas réécrit : il est DÉPLACÉ, et le moteur de
-- droits l'appelle désormais au lieu de le porter.
--
-- Quatre situations ouvrent le droit, et quatre seulement. Elles sont
-- identiques pour les deux domaines : une période de grâce après impayé vaut
-- pour un abonnement associatif comme pour un abonnement de lecture, et rien
-- ne justifierait qu'elle diffère.
-- ---------------------------------------------------------------------------

create function public.abonnement_ouvre_droit(
  p_user uuid,
  p_domaine public.subscription_domain,
  p_at timestamptz default public.app_now()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.subscriptions s,
         (select periode_grace_jours from public.business_settings where id = 1) p
    where p_user is not null
      and s.user_id = p_user
      -- LE FILTRE QUI TIENT L'ÉTANCHÉITÉ. Sans lui, les deux abonnements
      -- ouvriraient les mêmes portes.
      and s.domaine = p_domaine
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
  );
$fn$;

comment on function public.abonnement_ouvre_droit(uuid, public.subscription_domain, timestamptz) is
  'Un abonnement vivant existe-t-il pour ce compte DANS CE DOMAINE ? Unique implémentation de la question (0067) : access_for_books et access_for_association l''appellent, aucune ne la réécrit.';

grant execute on function public.abonnement_ouvre_droit(uuid, public.subscription_domain, timestamptz)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. LE MOTEUR DE DROITS DU CATALOGUE
--
-- Corps repris VERBATIM de la 0064. Un seul changement : la CTE `abonnement`
-- devient un appel à `abonnement_ouvre_droit(..., 'lecture', ...)`. La CTE
-- `parametres` disparaît avec elle — elle ne servait plus qu'à la grâce, que la
-- nouvelle fonction lit maintenant elle-même.
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
as $fn$
  with appelant as (
    select p_user is not null and public.is_admin(p_user) as est_admin
  ),
  abonnement as (
    -- LE DOMAINE EST ÉCRIT ICI, ET C'EST TOUT CE QUI SÉPARE LE CATALOGUE DU
    -- CONTENU ASSOCIATIF. Un abonné `association` ne passe pas par ici.
    select public.abonnement_ouvre_droit(p_user, 'lecture', p_at) as ouvre_droit
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
      -- l'acheteur un accès « sans limite de durée ».
      (d.statut = 'publie') as au_catalogue,
      (d.statut in ('publie', 'archive')) as exploitable,
      d.gratuit,
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
    (
      c.est_admin
      or ((c.a_achat or c.a_octroi) and c.exploitable)
      or (c.gratuit and c.au_catalogue)
      or c.par_abonnement
    ) as can_read,
    -- INDÉPENDANT de `reason`, et jamais accordé par un abonnement — d'aucun
    -- des deux domaines — ni par `gratuit`.
    (c.est_admin or (c.peut_telecharger and c.exploitable)) as can_download,
    (case
      when c.a_achat and c.exploitable then 'purchase'
      when (c.a_octroi and c.exploitable) or c.est_admin then 'granted'
      when c.par_abonnement then 'subscription'
      when c.gratuit and c.au_catalogue then 'free'
      when c.au_catalogue then 'preview'
      else 'none'
    end)::public.access_reason as reason
  from calcul c;
$fn$;

comment on function public.access_for_books(uuid, uuid[], timestamptz) is
  'Moteur de droits du CATALOGUE, source unique (§3.1). Depuis la migration 0067, seul un abonnement de domaine `lecture` y ouvre un titre : un abonnement associatif n''ouvre aucun conte.';
