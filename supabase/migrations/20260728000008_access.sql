-- 0008 — Abonnements, droits d'accès, lecture, téléchargements (§8.1)

-- §8.1 `subscriptions`
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  id_prestataire text,
  offre text not null check (offre in ('mensuel', 'annuel')),
  statut public.subscription_status not null default 'essai',
  debut_periode timestamptz not null default public.app_now(),
  fin_periode timestamptz not null,

  -- D4 point 7 — zone FIGÉE à la souscription, jamais recalculée aux
  -- renouvellements.
  zone public.price_zone not null,
  devise text not null references public.currencies (code),
  montant bigint not null check (montant >= 0),

  -- §9.1 — un échec de prélèvement fait basculer en `impaye` ; l'accès est
  -- maintenu pendant la période de grâce, qui se compte à partir de cette date.
  impaye_depuis timestamptz,
  -- §9.1 — une annulation maintient l'accès jusqu'à la fin de la période déjà
  -- payée. On conserve donc la date d'annulation, pas seulement le statut.
  annule_le timestamptz,

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now(),

  constraint subscriptions_periode_coherente check (fin_periode > debut_periode),
  constraint subscriptions_impaye_date check (statut <> 'impaye' or impaye_depuis is not null)
);

comment on table public.subscriptions is
  'Abonnements. L''abonnement donne accès à la LECTURE EN LIGNE, jamais au téléchargement (§3.2, CLAUDE.md).';
comment on column public.subscriptions.zone is
  'Zone tarifaire figée à la souscription. Jamais recalculée aux renouvellements (docs/PLAN.md D4 point 7).';
comment on column public.subscriptions.impaye_depuis is
  'Début de la période de grâce après échec de prélèvement. L''accès est maintenu pendant PAYMENT_GRACE_PERIOD_DAYS puis retiré (§9.1).';

create index subscriptions_user_idx on public.subscriptions (user_id);

-- Un utilisateur n'a qu'un seul abonnement en cours de vie. Les statuts
-- terminaux (`annule`, `expire`) sont conservés pour l'historique et
-- n'empêchent pas une nouvelle souscription.
create unique index subscriptions_un_seul_actif_idx
  on public.subscriptions (user_id)
  where statut in ('essai', 'actif', 'impaye');

-- §8.1 `entitlements` — clé de voûte du système.
--
-- ÉCART ASSUMÉ avec §8.1 : la table ne contient QUE les faits non
-- recalculables — les achats et les octrois manuels d'un administrateur.
-- L'accès par abonnement est recalculé à chaque demande (docs/PLAN.md D1).
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- Le droit porte sur le LIVRE, jamais sur une version linguistique : pas de
  -- colonne `langue` ici, et c'est délibéré (docs/PLAN.md D2 point 1).
  book_id uuid not null references public.books (id) on delete cascade,
  type public.entitlement_type not null,

  -- Origine du droit : la commande pour un `achat`, nul pour un `offert`.
  -- C'est cette colonne qui rend l'index d'unicité ci-dessous opérant.
  source_id uuid references public.orders (id) on delete cascade,

  -- §3.2 — n'est accordé QUE par un achat, jamais par un abonnement.
  peut_telecharger boolean not null default false,

  accorde_le timestamptz not null default public.app_now(),
  expire_le timestamptz,

  constraint entitlements_achat_a_une_source
    check (type <> 'achat' or source_id is not null)
);

comment on table public.entitlements is
  'Droits d''accès durables. Ne contient que `achat` et `offert` : l''accès par abonnement est recalculé, jamais matérialisé (docs/PLAN.md D1). Un droit porte sur le livre, toutes langues publiées comprises.';
comment on column public.entitlements.peut_telecharger is
  'Droit de téléchargement. Accordé par un achat ou un geste commercial, JAMAIS par un abonnement (§3.2). C''est la règle métier la plus sensible du projet.';
comment on column public.entitlements.source_id is
  'Origine du droit : identifiant de commande pour un achat, nul pour un octroi manuel. Support de l''index d''unicité qui garantit l''idempotence au niveau base.';

-- IDEMPOTENCE GARANTIE PAR LA BASE, pas seulement par le code.
--
-- `nulls not distinct` : deux octrois manuels (source_id nul) pour le même
-- utilisateur et le même livre entrent aussi en collision. Sans cette clause,
-- PostgreSQL considérerait deux NULL comme distincts et laisserait passer le
-- doublon.
--
-- Le traitement concurrent de deux webhooks identiques ÉCHOUE ici, au niveau
-- base. La table webhook_events est la première ligne de défense ; cet index
-- est la dernière, et c'est lui qui tient sous concurrence réelle.
create unique index entitlements_unique_origin
  on public.entitlements (user_id, book_id, type, source_id)
  nulls not distinct;

create index entitlements_user_book_idx on public.entitlements (user_id, book_id);

-- §8.1 `reading_progress`
--
-- Clé (user_id, book_id) : la progression est conservée PAR LIVRE, pas par
-- langue. Basculer de version linguistique ne perd pas la page atteinte
-- (docs/PLAN.md D2 point 6).
create table public.reading_progress (
  user_id uuid not null references public.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  derniere_page integer not null check (derniere_page > 0),
  maj_le timestamptz not null default public.app_now(),
  primary key (user_id, book_id)
);

comment on table public.reading_progress is
  'Progression de lecture, par livre et non par langue (docs/PLAN.md D2 point 6).';

-- §8.1 `download_logs` — détection des partages abusifs et service après-vente.
create table public.download_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  -- Le téléchargement, lui, porte bien sur une combinaison langue × format :
  -- c'est un fichier concret, pas un droit (docs/PLAN.md D2 point 3).
  langue text not null check (langue in ('fr', 'en')),
  format public.download_format not null,
  adresse_ip inet,
  telecharge_le timestamptz not null default public.app_now()
);

comment on table public.download_logs is
  'Journal des téléchargements (§10.2). Permet de détecter un même achat téléchargé depuis quarante adresses différentes.';

create index download_logs_user_idx on public.download_logs (user_id, telecharge_le desc);
create index download_logs_book_idx on public.download_logs (book_id);
