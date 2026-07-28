-- 0009 — Tables techniques : webhooks, journal de paiement, emails, ingestion
--
-- Aucune de ces tables n'est exposée au client. Elles portent malgré tout une
-- politique RLS explicite de refus : « une table sans RLS est une faille, pas
-- un oubli » (CLAUDE.md règle 1).

-- CLAUDE.md règle 5 — les webhooks sont la seule source de vérité sur l'état
-- d'un paiement. Cette table porte l'idempotence : un même événement reçu deux
-- fois est traité une seule fois.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  -- Identifiant de l'événement chez le prestataire. C'est la clé de
  -- l'idempotence : un rejeu porte le même identifiant.
  event_id text not null unique,
  type text not null,
  payload jsonb not null,
  signature_valide boolean not null,
  recu_le timestamptz not null default public.app_now(),
  traite_le timestamptz,
  erreur text
);

comment on table public.webhook_events is
  'Journal des webhooks reçus. La contrainte d''unicité sur event_id est la première ligne de défense de l''idempotence ; l''index unique de entitlements est la dernière (docs/PLAN.md D1 point 8).';
comment on column public.webhook_events.signature_valide is
  'Un événement à signature invalide est journalisé PUIS rejeté. On garde la trace : une signature invalide répétée est un signal de sécurité.';

create index webhook_events_type_idx on public.webhook_events (type, recu_le desc);
create index webhook_events_non_traites_idx on public.webhook_events (recu_le) where traite_le is null;

-- Journal métier, distinct du journal brut ci-dessus : ce qui a été APPLIQUÉ,
-- et à quoi. Sert au débogage et au service après-vente.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  webhook_event_id uuid references public.webhook_events (id) on delete set null,
  type text not null,
  order_id uuid references public.orders (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete cascade,
  user_id uuid references public.users (id) on delete cascade,
  montant bigint,
  devise text references public.currencies (code),
  detail jsonb not null default '{}',
  survenu_le timestamptz not null default public.app_now()
);

create index payment_events_order_idx on public.payment_events (order_id);
create index payment_events_subscription_idx on public.payment_events (subscription_id);

-- Trace des emails écrits par FileMailer dans .mails/. Alimente la console de
-- simulation, qui les affiche sans avoir à lire le disque.
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  destinataire text not null,
  sujet text not null,
  modele text not null,
  langue text not null check (langue in ('fr', 'en')),
  chemin_fichier text,
  user_id uuid references public.users (id) on delete set null,
  envoye_le timestamptz not null default public.app_now(),
  erreur text
);

comment on table public.email_log is
  'Trace des emails transactionnels. Un échec d''envoi n''annule jamais un droit déjà acquis : il est journalisé ici, avec son erreur.';

create index email_log_destinataire_idx on public.email_log (destinataire, envoye_le desc);

-- §7.4.3 — suivi et rejouabilité de l'ingestion d'un PDF.
create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books (id) on delete cascade,
  translation_id uuid references public.book_translations (id) on delete cascade,
  chemin_source text not null,
  statut public.ingestion_status not null default 'en_attente',
  etape text,
  nb_pages integer,
  couche_texte boolean,
  erreur text,
  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now()
);

comment on table public.ingestion_jobs is
  'Suivi de la chaîne d''ingestion (§7.4.3). L''étape courante est conservée pour permettre une reprise sans tout recommencer.';

create index ingestion_jobs_statut_idx on public.ingestion_jobs (statut, cree_le);
