-- 0006 — Catalogue (§8.1 `books`, `book_translations`)
--
-- Deux écarts assumés avec §8.1, tranchés lors de la validation du plan :
--   * `books.prix` est SUPPRIMÉ. Tous les prix passent par `book_prices`
--     (D4 point 1). Conserver les deux mènerait à une divergence.
--   * `books.gratuit` et `books.nb_pages_extrait` sont ajoutés (D3).

create table public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  auteur text not null,
  illustrateur text,
  age_min smallint check (age_min between 0 and 18),
  age_max smallint check (age_max between 0 and 18),
  origine_culturelle text,
  themes text[] not null default '{}',
  couverture_url text,

  -- §3.2 — ces deux champs sont INDÉPENDANTS. Un titre peut être
  -- simultanément inclus dans l'abonnement et vendu à l'unité.
  inclus_abonnement boolean not null default false,
  disponible_achat boolean not null default false,

  -- D3 — conte gratuit de l'offre Découverte (§3.3). Lisible en ligne par
  -- tous, y compris les visiteurs non connectés, et même à l'intérieur de la
  -- fenêtre de vente de 3 mois. N'accorde JAMAIS le téléchargement.
  -- Indépendant de disponible_achat : le titre d'appel est gratuit en lecture
  -- ET vendu au téléchargement.
  gratuit boolean not null default false,

  -- D3 point 8 — longueur de l'extrait, par titre. Nul = valeur de
  -- configuration (EXCERPT_PAGES_DEFAULT). Certains contes courts ne
  -- supportent pas qu'on en dévoile cinq pages.
  nb_pages_extrait smallint check (nb_pages_extrait > 0),

  statut public.book_status not null default 'brouillon',

  -- §3.2 — la fenêtre de vente exclusive de 3 mois se calcule par comparaison
  -- avec cette date. Horodatage et non date : les tests et la console de
  -- simulation déplacent l'horloge à la seconde près.
  publie_le timestamptz,

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now(),

  constraint books_age_coherent check (age_min is null or age_max is null or age_min <= age_max),
  constraint books_publie_a_une_date check (statut <> 'publie' or publie_le is not null)
);

comment on table public.books is
  'Livre, entité parente indépendante de la langue (§5.5). Les versions linguistiques vivent dans book_translations.';
comment on column public.books.inclus_abonnement is
  'Éligible à la lecture par abonnement. Indépendant de disponible_achat (§3.2). Ne suffit pas : la fenêtre de 3 mois s''applique en plus.';
comment on column public.books.gratuit is
  'Lecture en ligne ouverte à tous, y compris aux visiteurs non connectés et à l''intérieur de la fenêtre de 3 mois. N''accorde jamais le téléchargement (docs/PLAN.md D3).';
comment on column public.books.publie_le is
  'Date de publication. Sert de référence à la fenêtre de vente exclusive de 3 mois avant entrée dans l''abonnement (§3.2).';

create index books_statut_idx on public.books (statut);
create index books_publie_le_idx on public.books (publie_le desc nulls last);
create index books_themes_idx on public.books using gin (themes);
create index books_abonnement_idx on public.books (inclus_abonnement, publie_le) where statut = 'publie';

-- §5.5 — un livre est une entité parente avec N déclinaisons linguistiques,
-- chacune ayant ses propres fichiers.
create table public.book_translations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  langue text not null check (langue in ('fr', 'en')),
  titre text not null,
  resume text,
  fichier_lecture text,
  fichier_telechargement text,
  nb_pages integer check (nb_pages > 0),

  -- D2 point 4 — une traduction en brouillon reste invisible, même pour un
  -- acheteur du livre.
  statut public.translation_status not null default 'brouillon',

  cree_le timestamptz not null default public.app_now(),
  maj_le timestamptz not null default public.app_now(),

  unique (book_id, langue)
);

comment on table public.book_translations is
  'Version linguistique d''un livre. Un droit d''accès porte sur le LIVRE, jamais sur une version linguistique (docs/PLAN.md D2).';
comment on column public.book_translations.statut is
  'Seules les versions publiées sont accessibles, y compris à un acheteur du livre (docs/PLAN.md D2 point 4).';

create index book_translations_book_idx on public.book_translations (book_id);

-- D4 — grille tarifaire par zone. Aucune dimension linguistique : le prix ne
-- dépend jamais de la langue (D2 point 5). La devise est portée par la ligne,
-- jamais déduite de la zone par une règle codée en dur (D4 point 4) : XAF et
-- XOF sont deux devises distinctes de la même zone.
create table public.book_prices (
  book_id uuid not null references public.books (id) on delete cascade,
  zone public.price_zone not null,
  montant bigint not null check (montant >= 0),
  devise text not null references public.currencies (code),
  maj_le timestamptz not null default public.app_now(),
  primary key (book_id, zone)
);

comment on table public.book_prices is
  'Prix par livre et par zone (§3.3). Montant exprimé dans la plus petite unité de la devise : 499 EUR = 4,99 €, 1500 XAF = 1 500 FCFA. Aucune conversion de taux de change n''est faite à l''exécution — chaque prix est écrit à la main pour sa zone.';
comment on column public.book_prices.devise is
  'Devise de CETTE ligne. Jamais déduite de la zone : la zone afrique couvre XAF et XOF (docs/PLAN.md D4 point 4).';

-- §7.4.3 — sortie de la chaîne d'ingestion. Les pages appartiennent à une
-- version linguistique, pas au livre parent.
create table public.book_pages (
  id uuid primary key default gen_random_uuid(),
  translation_id uuid not null references public.book_translations (id) on delete cascade,
  numero integer not null check (numero > 0),
  chemin_haute text not null,
  chemin_allegee text not null,
  largeur integer check (largeur > 0),
  hauteur integer check (hauteur > 0),
  -- §7.4.2 — couche texte extraite quand elle existe, pour la recherche
  -- interne et l'accessibilité.
  texte text,
  cree_le timestamptz not null default public.app_now(),
  unique (translation_id, numero)
);

comment on table public.book_pages is
  'Pages rendues par la chaîne d''ingestion, en deux résolutions (§7.4.3). Servies une par une via URL signée, jamais en bloc (§10.1).';
comment on column public.book_pages.chemin_allegee is
  'Résolution allégée, destinée aux connexions lentes — une part importante de l''audience est en Afrique francophone (§5.1).';
