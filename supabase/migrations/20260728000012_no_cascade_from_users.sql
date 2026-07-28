-- 0012 — Fin des suppressions en cascade depuis `users` (migration corrective)
--
-- PRINCIPE
--
-- Le droit à l'effacement et les obligations comptables ne s'opposent pas :
-- l'article 17.3.b du RGPD écarte le droit à l'effacement lorsque la
-- conservation est nécessaire au respect d'une obligation légale. Deux
-- périmètres sont donc séparés :
--
--   * les données de compte — effaçables ;
--   * les pièces comptables — conservées, puis purgées à échéance.
--
-- CONSÉQUENCE STRUCTURANTE
--
-- Il n'y a plus AUCUNE suppression physique d'utilisateur. L'effacement est une
-- procédure d'anonymisation (migration 0014), jamais un DELETE. Toutes les
-- clés étrangères pointant vers `users` passent donc de `on delete cascade` à
-- `on delete restrict` : une suppression accidentelle échoue au lieu
-- d'emporter silencieusement l'historique commercial.
--
-- LE CAS PARTICULIER DE auth.users
--
-- `public.users.id` référençait `auth.users(id)` en cascade. L'anonymisation
-- devant supprimer l'identité d'authentification tout en conservant la ligne
-- métier, cette clé étrangère est retirée. `public.users` devient autonome,
-- indexé sur le même identifiant. C'est ce qui rend l'anonymisation possible,
-- et c'est aussi ce qui libère l'ancienne adresse email pour une nouvelle
-- inscription.

-- ---------------------------------------------------------------------------
-- Statut du compte
-- ---------------------------------------------------------------------------

create type public.user_status as enum ('actif', 'suspendu', 'anonymise');

alter table public.users add column statut public.user_status not null default 'actif';
alter table public.users add column anonymise_le timestamptz;

-- Reprise de l'état existant avant retrait de l'ancienne colonne.
update public.users set statut = 'suspendu' where suspendu = true;

alter table public.users drop column suspendu;

comment on column public.users.statut is
  'Cycle de vie du compte. `anonymise` est un état TERMINAL : le compte ne peut plus être réactivé, et son ancienne adresse email est redevenue disponible.';
comment on column public.users.anonymise_le is
  'Date d''anonymisation. Nul tant que le compte est vivant.';

alter table public.users
  add constraint users_anonymise_a_une_date
  check ((statut = 'anonymise') = (anonymise_le is not null));

create index users_statut_idx on public.users (statut) where statut <> 'actif';

-- ---------------------------------------------------------------------------
-- Autonomie de public.users vis-à-vis de auth.users
-- ---------------------------------------------------------------------------

alter table public.users drop constraint users_id_fkey;

comment on table public.users is
  'Comptes utilisateurs. Aucune donnée d''enfant n''est collectée (CLAUDE.md règle 7, spécification §11.2). La table est autonome vis-à-vis de auth.users : l''anonymisation supprime l''identité d''authentification et conserve la ligne métier.';

-- ---------------------------------------------------------------------------
-- Retrait de toutes les cascades depuis `users`
-- ---------------------------------------------------------------------------

alter table public.carts drop constraint carts_user_id_fkey;
alter table public.carts add constraint carts_user_id_fkey
  foreign key (user_id) references public.users (id) on delete restrict;

alter table public.orders drop constraint orders_user_id_fkey;
alter table public.orders add constraint orders_user_id_fkey
  foreign key (user_id) references public.users (id) on delete restrict;

alter table public.promo_redemptions drop constraint promo_redemptions_user_id_fkey;
alter table public.promo_redemptions add constraint promo_redemptions_user_id_fkey
  foreign key (user_id) references public.users (id) on delete restrict;

alter table public.subscriptions drop constraint subscriptions_user_id_fkey;
alter table public.subscriptions add constraint subscriptions_user_id_fkey
  foreign key (user_id) references public.users (id) on delete restrict;

alter table public.entitlements drop constraint entitlements_user_id_fkey;
alter table public.entitlements add constraint entitlements_user_id_fkey
  foreign key (user_id) references public.users (id) on delete restrict;

alter table public.reading_progress drop constraint reading_progress_user_id_fkey;
alter table public.reading_progress add constraint reading_progress_user_id_fkey
  foreign key (user_id) references public.users (id) on delete restrict;

alter table public.download_logs drop constraint download_logs_user_id_fkey;
alter table public.download_logs add constraint download_logs_user_id_fkey
  foreign key (user_id) references public.users (id) on delete restrict;

alter table public.payment_events drop constraint payment_events_user_id_fkey;
alter table public.payment_events add constraint payment_events_user_id_fkey
  foreign key (user_id) references public.users (id) on delete restrict;

-- `email_log` conserve `on delete set null` : la trace d'un email envoyé garde
-- son intérêt sans son destinataire, et n'a pas à empêcher une purge.

-- ---------------------------------------------------------------------------
-- Favoris (§4.2 F7)
--
-- Créés ici parce que la procédure d'anonymisation doit les effacer : une
-- procédure qui oublierait une table de données personnelles serait pire
-- qu'absente, elle donnerait l'illusion de la conformité.
-- ---------------------------------------------------------------------------

create table public.favorites (
  user_id uuid not null references public.users (id) on delete restrict,
  book_id uuid not null references public.books (id) on delete cascade,
  ajoute_le timestamptz not null default public.app_now(),
  primary key (user_id, book_id)
);

comment on table public.favorites is
  'Titres mis de côté par l''utilisateur (§4.2 F7). Données personnelles : effacées par anonymize_user().';

alter table public.favorites enable row level security;

grant select, insert, delete on public.favorites to authenticated;

create policy favorites_proprietaire on public.favorites
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- `is_admin` suit le nouveau statut
-- ---------------------------------------------------------------------------

create or replace function public.is_admin(p_user uuid default auth.uid())
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
    where u.id = p_user
      and u.role = 'admin'
      and u.statut = 'actif'
  );
$$;
