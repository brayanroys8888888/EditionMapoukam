-- 0003 — Énumérations

-- §8.1 users.role
create type public.user_role as enum ('user', 'admin');

-- §8.1 books.statut
create type public.book_status as enum ('brouillon', 'publie', 'archive');

-- Ajout à la spécification (docs/PLAN.md D2 point 4) : une traduction en
-- brouillon reste invisible, même pour un acheteur du livre.
create type public.translation_status as enum ('brouillon', 'publie');

-- §8.1 subscriptions.statut
create type public.subscription_status as enum ('essai', 'actif', 'annule', 'impaye', 'expire');

-- §8.1 orders.statut
create type public.order_status as enum ('en_attente', 'paye', 'rembourse', 'echoue');

-- ÉCART ASSUMÉ avec §8.1 (docs/PLAN.md D1 point 1) : la valeur `abonnement`
-- est retirée. `entitlements` ne contient que les faits non recalculables.
-- L'accès par abonnement est recalculé à chaque demande, jamais matérialisé :
-- le matérialiser obligerait à créer, mettre à jour et révoquer des lignes en
-- masse à chaque publication de titre et à chaque changement de statut.
create type public.entitlement_type as enum ('achat', 'offert');

-- §3.3 — deux zones tarifaires, déterminées par le pays de paiement.
create type public.price_zone as enum ('international', 'afrique');

-- docs/PLAN.md D5 — motif de la décision d'accès, du titre le plus fort au
-- plus faible : purchase > granted > subscription > free > preview.
-- `none` est réservé au livre non exploitable (brouillon ou archivé pour un
-- non-admin) : même l'extrait est refusé.
create type public.access_reason as enum (
  'purchase',
  'granted',
  'subscription',
  'free',
  'preview',
  'none'
);

-- §16.1 décision 7 — les deux formats téléchargeables.
create type public.download_format as enum ('pdf', 'epub');

-- §3.4 — codes promotionnels : montant fixe ou pourcentage.
create type public.promo_type as enum ('montant', 'pourcentage');

-- §7.4.3 — suivi de la chaîne d'ingestion.
create type public.ingestion_status as enum ('en_attente', 'en_cours', 'termine', 'echoue');
