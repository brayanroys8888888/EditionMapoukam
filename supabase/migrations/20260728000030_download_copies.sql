-- 0030 — Copies filigranées : cache et purge (§9.4, §10.2)
--
-- ┌────────────────────────────────────────────────────────────────────────────┐
-- │ LE NOMBRE DE FICHIERS CROÎT EN UTILISATEURS × TITRES × LANGUES × FORMATS. │
-- │                                                                            │
-- │ §9.4 prévoit de générer à la première demande puis de stocker. À 2 000     │
-- │ acheteurs et 40 titres en deux langues et deux formats, cela ferait        │
-- │ 320 000 fichiers — et le stockage deviendrait le premier poste de coût de  │
-- │ la plateforme, devant tout le reste.                                       │
-- │                                                                            │
-- │ D'où deux dispositions prises DÈS MAINTENANT, et non « quand ça posera     │
-- │ problème » : une clé de cache déterministe, et une purge des copies non    │
-- │ téléchargées depuis N mois. Une copie purgée n'est pas perdue — elle est   │
-- │ REGÉNÉRABLE à l'identique, la clé étant déterministe.                     │
-- └────────────────────────────────────────────────────────────────────────────┘

create table public.download_copies (
  -- Identifiant de la copie, dérivé de (utilisateur, livre, langue, format,
  -- version du filigrane). Déterministe : la même demande rend toujours la
  -- même copie, et une copie purgée se reconstruit à l'identique.
  --
  -- C'est aussi la trace inscrite DANS le fichier — pied de page visible et
  -- métadonnées. Retrouver cet identifiant sur un fichier en circulation
  -- désigne l'acheteur.
  copie_id text primary key check (copie_id ~ '^[0-9a-f]{32}$'),

  -- `restrict` et non `cascade` : la migration 0012 a supprimé toute cascade
  -- depuis `users`. Un compte ne se supprime plus, il s'ANONYMISE — et une
  -- suppression accidentelle doit échouer franchement au lieu d'emporter
  -- silencieusement des lignes. Un test d'architecture le vérifie sur toutes
  -- les tables.
  --
  -- Conséquence pratique : l'anonymisation d'un compte doit purger ses copies.
  -- C'est cohérent — une copie porte l'adresse email de son acheteur, et la
  -- conserver après anonymisation garderait la donnée personnelle que
  -- l'effacement vise précisément à retirer.
  user_id uuid not null references public.users (id) on delete restrict,
  book_id uuid not null references public.books (id) on delete restrict,
  langue text not null check (langue in ('fr', 'en')),
  format public.download_format not null,

  chemin text not null,
  octets bigint not null check (octets > 0),

  cree_le timestamptz not null default public.app_now(),
  -- Sert à la purge. Distinct de `download_logs`, qui garde l'historique
  -- complet : ici, seule la DERNIÈRE demande compte.
  dernier_acces_le timestamptz not null default public.app_now(),

  -- Une seule copie par combinaison. La clé primaire le garantit déjà par
  -- construction, cette contrainte le dit dans le langage du métier.
  unique (user_id, book_id, langue, format)
);

comment on table public.download_copies is
  'Copies filigranées mises en cache (§9.4). Une copie purgée est regénérable à l''identique : la clé est déterministe.';
comment on column public.download_copies.copie_id is
  'Identifiant inscrit DANS le fichier — pied de page et métadonnées. Le retrouver sur un fichier en circulation désigne l''acheteur (§10.2, DRM social).';
comment on column public.download_copies.dernier_acces_le is
  'Dernière demande de cette copie. Seul critère de purge : une copie jamais redemandée occupe du stockage pour rien.';

create index download_copies_user_idx on public.download_copies (user_id);
create index download_copies_purge_idx on public.download_copies (dernier_acces_le);

alter table public.download_copies enable row level security;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ AUCUN ACCÈS CLIENT, MÊME EN LECTURE, MÊME À SES PROPRES COPIES.         │
-- │                                                                          │
-- │ La table porte les CHEMINS des fichiers filigranés. Les exposer, fût-ce  │
-- │ à leur propriétaire, donnerait un chemin de stockage à qui n'a besoin    │
-- │ que d'une URL signée — et rendrait la vérification de droits             │
-- │ contournable d'un cran.                                                  │
-- └──────────────────────────────────────────────────────────────────────────┘
create policy download_copies_aucun_acces_client on public.download_copies
  for all to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Rétention.
-- ---------------------------------------------------------------------------

alter table public.business_settings
  add column retention_copies_mois integer not null default 6
    check (retention_copies_mois between 1 and 120);

comment on column public.business_settings.retention_copies_mois is
  'Une copie filigranée non redemandée depuis ce délai est purgée. Elle reste regénérable à l''identique : la clé de cache est déterministe.';

/**
 * Copies purgeables.
 *
 * Rend les CHEMINS avant toute suppression : les objets vivent dans le
 * stockage, hors de portée du SQL. L'appelant efface les fichiers, puis les
 * lignes — jamais l'inverse, sans quoi plus rien ne dirait où sont les fichiers
 * devenus orphelins.
 */
create function public.copies_purgeables(p_at timestamptz default public.app_now())
  returns table (copie_id text, chemin text, dernier_acces_le timestamptz)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select c.copie_id, c.chemin, c.dernier_acces_le
  from public.download_copies c
  where c.dernier_acces_le
        + make_interval(months => (select retention_copies_mois from public.business_settings where id = 1))
        <= p_at
  order by c.dernier_acces_le asc;
$$;

comment on function public.copies_purgeables(timestamptz) is
  'Copies non redemandées depuis la durée de rétention. Rend les chemins AVANT suppression : les objets vivent dans le stockage, hors de portée du SQL.';

revoke all on function public.copies_purgeables(timestamptz) from public, anon, authenticated;
grant execute on function public.copies_purgeables(timestamptz) to service_role;
