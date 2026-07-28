-- 0017 — Le moteur de droits branché sur les politiques RLS
--
-- C'est ici que se vérifie la décision D1 : une seule implémentation, appelée
-- à la fois par l'application et par la base. Si le serveur oubliait un
-- contrôle, la politique le rattraperait — et réciproquement.

-- ---------------------------------------------------------------------------
-- Progression de lecture
--
-- On n'enregistre pas la progression d'un livre qu'on n'a pas le droit de
-- lire. Sans cette condition, `reading_progress` deviendrait un journal des
-- titres qu'un utilisateur a tenté d'ouvrir sans y avoir droit — et, plus
-- gênant, un moyen de vérifier l'existence d'un identifiant de livre.
-- ---------------------------------------------------------------------------

drop policy reading_progress_proprietaire on public.reading_progress;

create policy reading_progress_lecture on public.reading_progress
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reading_progress_ecriture on public.reading_progress
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (public.access_for((select auth.uid()), book_id)).can_read
  );

create policy reading_progress_mise_a_jour on public.reading_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (public.access_for((select auth.uid()), book_id)).can_read
  );

create policy reading_progress_suppression on public.reading_progress
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Favoris
--
-- Mettre de côté un titre ne suppose pas d'y avoir accès — c'est même l'usage :
-- on met en favori ce qu'on envisage d'acheter. La seule condition est que le
-- titre soit au catalogue, sinon les favoris permettraient de deviner
-- l'existence de titres en préparation.
-- ---------------------------------------------------------------------------

drop policy favorites_proprietaire on public.favorites;

create policy favorites_lecture on public.favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy favorites_ajout on public.favorites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.statut = 'publie')
  );

create policy favorites_retrait on public.favorites
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Pages de livre : le refus reste total, et c'est délibéré
--
-- On aurait pu poser ici une politique appelant `access_for`. Ce serait plus
-- faible que ce qui existe : aucun privilège SELECT n'est accordé à `anon` ni à
-- `authenticated` sur cette table, donc aucune requête cliente ne l'atteint,
-- politique ou pas.
--
-- Le contenu passe par une route serveur qui vérifie les droits puis émet une
-- URL signée à durée courte (CLAUDE.md règle 3). Ouvrir la table en lecture,
-- même sous condition, exposerait les chemins de stockage et la structure des
-- livres. La politique de refus explicite de la migration 0010 reste donc en
-- place.
-- ---------------------------------------------------------------------------

comment on table public.book_pages is
  'Pages rendues par la chaîne d''ingestion (§7.4.3). AUCUN accès client, ni en lecture ni en écriture : le contenu passe exclusivement par une route serveur qui vérifie les droits via access_for() puis émet une URL signée.';
