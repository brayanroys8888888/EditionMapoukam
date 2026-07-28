-- 0007 — Panier, commandes, codes promotionnels (§8.1, §4.2 F9, §4.3 F12)

-- §4.2 F9 — panier permettant l'achat de plusieurs titres en une transaction.
-- Un panier actif par utilisateur.
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  -- Langue choisie à l'ajout. Purement informative : elle ne conditionne
  -- jamais un droit d'accès (docs/PLAN.md D2 point 2).
  langue text not null check (langue in ('fr', 'en')),
  ajoute_le timestamptz not null default public.app_now(),
  unique (cart_id, book_id)
);

comment on column public.cart_items.langue is
  'Version linguistique choisie. INFORMATIVE UNIQUEMENT : un achat porte sur le livre, toutes langues comprises (docs/PLAN.md D2).';

-- §8.1 `orders`
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  montant_total bigint not null check (montant_total >= 0),
  devise text not null references public.currencies (code),

  -- D4 point 5 — zone d'ENCAISSEMENT, déterminée par le pays réel du moyen de
  -- paiement, jamais par l'adresse IP (§3.3). Figée sur la commande.
  zone public.price_zone not null,

  statut public.order_status not null default 'en_attente',
  -- §8.1 prévoit `stripe` / `mobile_money`. `fake` s'y ajoute pour le mode de
  -- développement local : seul l'émetteur est simulé, le récepteur est réel.
  prestataire text not null default 'fake' check (prestataire in ('fake', 'stripe', 'mobile_money')),
  reference_paiement text,

  promo_code_id uuid,
  remise bigint not null default 0 check (remise >= 0),

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now(),
  paye_le timestamptz
);

comment on table public.orders is
  'Commandes d''achat à l''unité. Le passage au statut `paye` n''est jamais déclenché par une redirection de navigateur, uniquement par un webhook signé (§9.1, CLAUDE.md règle 5).';
comment on column public.orders.zone is
  'Zone d''encaissement, figée à la commande. Une évolution de la grille tarifaire ne modifie aucune commande passée (docs/PLAN.md D4 point 6).';

create index orders_user_idx on public.orders (user_id, cree_le desc);
create index orders_statut_idx on public.orders (statut);
create unique index orders_reference_paiement_idx
  on public.orders (reference_paiement) where reference_paiement is not null;

-- §8.1 `order_items`
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- `restrict` : un livre référencé par une commande ne se supprime pas. Le
  -- catalogue s'archive (statut = 'archive'), il ne se détruit pas.
  book_id uuid not null references public.books (id) on delete restrict,
  langue text not null check (langue in ('fr', 'en')),
  prix_unitaire bigint not null check (prix_unitaire >= 0),
  devise text not null references public.currencies (code),
  zone public.price_zone not null,
  unique (order_id, book_id)
);

-- docs/PLAN.md D2 point 2 — consigné en base pour qu'aucune évolution future
-- ne se trompe.
comment on column public.order_items.langue is
  'Version linguistique choisie à l''achat. INFORMATIVE UNIQUEMENT — facture, statistiques de vente. Ne doit JAMAIS apparaître dans une vérification de droits d''accès : un achat porte sur le livre, toutes langues publiées comprises, y compris celles publiées après l''achat (docs/PLAN.md D2).';
comment on column public.order_items.prix_unitaire is
  'Prix au moment de l''achat, dans la plus petite unité de `devise`. Fige les conditions tarifaires : une évolution de book_prices ne modifie pas les commandes passées.';

create index order_items_book_idx on public.order_items (book_id);

-- §3.4, §4.3 F12 — codes promotionnels.
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and length(code) between 3 and 32),
  type public.promo_type not null,
  -- Montant dans la plus petite unité de `devise` si type = 'montant',
  -- pourcentage entier de 1 à 100 si type = 'pourcentage'.
  valeur bigint not null check (valeur > 0),
  devise text references public.currencies (code),
  expire_le timestamptz,
  actif boolean not null default true,
  usage_max integer check (usage_max > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  cree_le timestamptz not null default public.app_now(),

  constraint promo_montant_a_une_devise
    check (type <> 'montant' or devise is not null),
  constraint promo_pourcentage_borne
    check (type <> 'pourcentage' or valeur between 1 and 100)
);

alter table public.orders
  add constraint orders_promo_code_fk
  foreign key (promo_code_id) references public.promo_codes (id) on delete set null;

create table public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  utilise_le timestamptz not null default public.app_now(),
  unique (promo_code_id, order_id)
);

comment on table public.promo_redemptions is
  'Utilisations effectives d''un code promotionnel. L''unicité par (code, commande) empêche qu''un rejeu de webhook décompte deux fois le même code.';
