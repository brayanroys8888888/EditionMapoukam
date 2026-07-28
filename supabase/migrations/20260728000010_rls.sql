-- 0010 — Sécurité : RLS et privilèges
--
-- CLAUDE.md règle 1 : « RLS activé sur toutes les tables, en refus par défaut.
-- Aucune table sans politique explicite. Une table sans RLS est une faille,
-- pas un oubli. »
--
-- Deux barrières indépendantes, délibérément :
--
--   1. Les PRIVILÈGES (grant/revoke) — ce que le rôle a le droit de faire sur
--      la table, colonne par colonne.
--   2. Les POLITIQUES (RLS) — sur quelles LIGNES il peut le faire.
--
-- Une seule ne suffit pas : sans révocation de privilège, une politique
-- oubliée sur une table laisse tout passer ; sans RLS, un privilège de lecture
-- expose toutes les lignes. Les deux sont donc posées ici, dans un fichier
-- unique, pour que le modèle de sécurité se relise d'un seul tenant.
--
-- `service_role` conserve tous ses droits et contourne RLS : c'est le rôle du
-- serveur, qui vérifie les droits lui-même contre `entitlements` avant chaque
-- réponse (CLAUDE.md règle 4). Il ne quitte jamais le serveur (règle 2).

-- ---------------------------------------------------------------------------
-- Point de départ : aucun privilège pour les rôles clients.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

-- Et pour toute table créée ensuite par les migrations : refus par défaut.
-- Chaque nouvelle table devra accorder ses privilèges explicitement, ce qui
-- rend l'oubli visible plutôt que silencieux.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activation de RLS sur la totalité des tables du schéma public.
-- ---------------------------------------------------------------------------

alter table public.dev_clock_activation enable row level security;
alter table public.users               enable row level security;
alter table public.currencies          enable row level security;
alter table public.books               enable row level security;
alter table public.book_translations   enable row level security;
alter table public.book_prices         enable row level security;
alter table public.book_pages          enable row level security;
alter table public.carts               enable row level security;
alter table public.cart_items          enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.promo_codes         enable row level security;
alter table public.promo_redemptions   enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.entitlements        enable row level security;
alter table public.reading_progress    enable row level security;
alter table public.download_logs       enable row level security;
alter table public.webhook_events      enable row level security;
alter table public.payment_events      enable row level security;
alter table public.email_log           enable row level security;
alter table public.ingestion_jobs      enable row level security;

-- ---------------------------------------------------------------------------
-- Données de référence : lisibles par tous.
-- ---------------------------------------------------------------------------

grant select on public.currencies to anon, authenticated;

create policy currencies_lecture_publique on public.currencies
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Comptes utilisateurs.
-- ---------------------------------------------------------------------------

grant select on public.users to authenticated;
-- Seules ces deux colonnes sont modifiables par l'utilisateur. `role` et
-- `suspendu` ne le sont par personne d'autre que le serveur : une politique
-- RLS agit sur les lignes, pas sur les colonnes ; c'est donc le privilège
-- qui porte cette garantie.
grant update (nom_complet, langue_preferee) on public.users to authenticated;

create policy users_lecture_soi_ou_admin on public.users
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy users_modification_soi on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Catalogue : lisible par tous, y compris les visiteurs non connectés (§4.1).
-- Un brouillon ou un titre archivé ne sort jamais du catalogue public.
-- ---------------------------------------------------------------------------

grant select on public.books, public.book_translations, public.book_prices
  to anon, authenticated;

create policy books_lecture_publiee on public.books
  for select to anon, authenticated
  using (statut = 'publie' or public.is_admin());

-- docs/PLAN.md D2 point 4 — une traduction en brouillon reste invisible, même
-- pour un acheteur du livre.
create policy book_translations_lecture_publiee on public.book_translations
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      statut = 'publie'
      and exists (
        select 1 from public.books b
        where b.id = book_translations.book_id and b.statut = 'publie'
      )
    )
  );

create policy book_prices_lecture_publiee on public.book_prices
  for select to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.books b
      where b.id = book_prices.book_id and b.statut = 'publie'
    )
  );

-- Les pages d'un livre ne sont JAMAIS lisibles directement par un client. Le
-- contenu passe par une route serveur qui vérifie les droits puis émet une URL
-- signée à durée courte (CLAUDE.md règle 3, §6.2).
--
-- Refus explicite plutôt qu'absence de politique : l'intention doit se lire.
-- L'étape 6 remplacera cette politique par un appel à `access_for`.
create policy book_pages_aucun_acces_direct on public.book_pages
  for all to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Panier : l'utilisateur le gère lui-même.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.carts to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;

create policy carts_proprietaire on public.carts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy cart_items_proprietaire on public.cart_items
  for all to authenticated
  using (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id and c.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Commandes : lecture seule pour l'utilisateur.
--
-- Aucun privilège d'écriture n'est accordé, et c'est structurant : une
-- commande est créée par le serveur, qui relit les prix en base. Le client ne
-- peut donc pas soumettre un montant.
-- ---------------------------------------------------------------------------

grant select on public.orders, public.order_items to authenticated;

create policy orders_lecture_proprietaire on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy order_items_lecture_proprietaire on public.order_items
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = (select auth.uid())
    )
  );

-- Les codes promotionnels ne sont jamais exposés au client : leur validation
-- est faite par le serveur. Sans cela, la liste des codes actifs serait
-- lisible par n'importe quel visiteur.
create policy promo_codes_aucun_acces_client on public.promo_codes
  for all to anon, authenticated
  using (false)
  with check (false);

grant select on public.promo_redemptions to authenticated;

create policy promo_redemptions_lecture_proprietaire on public.promo_redemptions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Abonnements et droits d'accès : lecture seule.
--
-- `entitlements` est la table la plus sensible du schéma. Un utilisateur peut
-- consulter ses droits ; il ne peut ni en créer, ni en modifier, ni en
-- supprimer. Seul le gestionnaire de webhooks, côté serveur, en crée.
-- ---------------------------------------------------------------------------

grant select on public.subscriptions to authenticated;
grant select on public.entitlements to authenticated;
grant select on public.download_logs to authenticated;

create policy subscriptions_lecture_proprietaire on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy entitlements_lecture_proprietaire on public.entitlements
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy download_logs_lecture_proprietaire on public.download_logs
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Progression de lecture : le seul contenu que l'utilisateur écrit lui-même.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.reading_progress to authenticated;

create policy reading_progress_proprietaire on public.reading_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Tables techniques : aucun accès client, refus explicite.
-- ---------------------------------------------------------------------------

create policy dev_clock_activation_aucun_acces_client on public.dev_clock_activation
  for all to anon, authenticated
  using (false)
  with check (false);

create policy webhook_events_aucun_acces_client on public.webhook_events
  for all to anon, authenticated
  using (false)
  with check (false);

create policy payment_events_aucun_acces_client on public.payment_events
  for all to anon, authenticated
  using (false)
  with check (false);

create policy email_log_aucun_acces_client on public.email_log
  for all to anon, authenticated
  using (false)
  with check (false);

create policy ingestion_jobs_aucun_acces_client on public.ingestion_jobs
  for all to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Fonctions internes : non appelables par un client.
-- ---------------------------------------------------------------------------

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;
