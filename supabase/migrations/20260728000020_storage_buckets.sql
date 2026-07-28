-- 0020 — Buckets de stockage
--
-- CLAUDE.md règle 3 : « Les buckets de fichiers sont privés. Aucun fichier de
-- livre n'est jamais accessible par URL publique. L'accès passe systématiquement
-- par une route serveur qui vérifie les droits puis émet une URL signée. »
--
-- §6.2 le formule autrement, et c'est la phrase à retenir : « Sans ce
-- mécanisme, un utilisateur pourrait partager une URL de fichier et contourner
-- intégralement le modèle économique. »
--
-- Quatre bucket, trois privés et un public :
--
--   book-sources    PDF d'origine déposés par l'éditeur. Jamais servis à
--                   personne — ils ne servent qu'à l'ingestion (étape 7).
--   book-pages      pages rendues en WebP, servies une par une.
--   book-downloads  fichiers filigranés, produits à l'achat (étape 11).
--   covers          couvertures. PUBLIC, et c'est délibéré : une couverture est
--                   un argument de vente, elle doit être indexable par les
--                   moteurs de recherche (§5.4) et servie par le CDN.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('book-sources',   'book-sources',   false, 104857600, array['application/pdf']),
  ('book-pages',     'book-pages',     false, 10485760,  array['image/webp', 'image/avif']),
  ('book-downloads', 'book-downloads', false, 209715200, array['application/pdf', 'application/epub+zip']),
  ('covers',         'covers',         true,  5242880,   array['image/webp', 'image/avif', 'image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Politiques
--
-- `storage.objects` a RLS activée par défaut chez Supabase, sans aucune
-- politique : tout est donc déjà refusé aux rôles clients. On pose malgré tout
-- un refus EXPLICITE sur les trois bucket privés — « aucune table sans
-- politique explicite » (CLAUDE.md règle 1) vaut aussi ici, et l'intention doit
-- se lire dans le schéma plutôt que se déduire d'une absence.
-- ---------------------------------------------------------------------------

create policy "contenu_prive_aucun_acces_client"
  on storage.objects
  for all
  to anon, authenticated
  using (bucket_id in ('book-sources', 'book-pages', 'book-downloads') and false)
  with check (bucket_id in ('book-sources', 'book-pages', 'book-downloads') and false);

-- Les couvertures, elles, sont lisibles par tous. Le bucket est déjà marqué
-- public ; la politique le dit aussi, pour que les deux niveaux concordent.
create policy "couvertures_lecture_publique"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'covers');

-- Pas de `comment on table storage.objects` : cette table appartient à
-- `supabase_storage_admin`, et le rôle qui joue les migrations n'en est pas
-- propriétaire. Poser des politiques y est permis, la commenter ne l'est pas.
--
-- Pour mémoire, donc, ici : les bucket `book-sources`, `book-pages` et
-- `book-downloads` sont privés et ne sont jamais servis directement. Une route
-- serveur vérifie les droits, puis émet une URL signée à durée courte.
