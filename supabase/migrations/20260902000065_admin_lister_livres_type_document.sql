-- ---------------------------------------------------------------------------
-- `admin_lister_livres` rend et filtre le TYPE DE DOCUMENT.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUI MANQUAIT, ET POURQUOI ÇA RENDAIT L'ACCÈS MODULAIRE INOPÉRANT.    │
-- │                                                                          │
-- │ Les trois leviers d'accès — `gratuit`, `inclus_abonnement`,              │
-- │ `disponible_achat` — existent depuis la migration 0006, sont             │
-- │ indépendants, et `access_for_books` ne regarde JAMAIS `type_document`.   │
-- │ Un livret pédagogique peut donc déjà être offert, inclus dans            │
-- │ l'abonnement, vendu à l'unité, ou toute combinaison des trois.           │
-- │                                                                          │
-- │ Mais le seul écran d'où l'on pose ces leviers est la fiche d'édition, et │
-- │ le seul chemin vers cette fiche est la liste du back-office — une liste  │
-- │ qui ne dit pas quels titres sont des livrets et ne sait pas les isoler.  │
-- │ Sur un catalogue de deux cents titres, régler l'accès des livrets        │
-- │ revenait à ouvrir les fiches une par une pour voir de quel support il    │
-- │ s'agit. Une capacité qu'on ne peut pas atteindre n'est pas une capacité. │
-- │                                                                          │
-- │ Le filtre descend ICI plutôt que dans l'écran : filtrer la page reçue    │
-- │ laisserait `total_lignes` compter tout le catalogue, et la pagination    │
-- │ promettrait des pages de livrets qui n'existent pas — le même défaut que │
-- │ celui corrigé côté public par la migration 0063.                         │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- `drop` puis `create` et non `create or replace` : PostgreSQL refuse de
-- changer le type de retour d'une fonction par remplacement, et les colonnes
-- d'un `returns table` en font partie. Corps repris VERBATIM de la migration
-- 0035, à trois ajouts près — le paramètre, la colonne rendue, et la clause du
-- `where`.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_lister_livres(text, integer, integer);

create function public.admin_lister_livres(
  p_statut text default null,
  p_page integer default 1,
  p_taille integer default 25,
  p_type text default null
)
  returns table (
    id uuid,
    slug text,
    auteur text,
    statut public.book_status,
    type_document public.document_type,
    gratuit boolean,
    inclus_abonnement boolean,
    disponible_achat boolean,
    publie_le timestamptz,
    prix jsonb,
    manques text[],
    publiable boolean,
    total_lignes bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with base as (
    select b.* from public.books b
    where (p_statut is null or b.statut::text = p_statut)
      -- La comparaison passe par `text` et non par un cast vers l'énumération :
      -- un type inconnu donne alors une liste vide, là où
      -- `p_type::public.document_type` lèverait une erreur 22P02 que l'écran
      -- traduirait en « quelque chose n'a pas fonctionné » sur une URL bricolée.
      and (p_type is null or b.type_document::text = p_type)
  ),
  compte as (select count(*) as total from base)
  select
    base.id,
    base.slug,
    base.auteur,
    base.statut,
    base.type_document,
    base.gratuit,
    base.inclus_abonnement,
    base.disponible_achat,
    base.publie_le,
    coalesce((
      select jsonb_object_agg(bp.zone, jsonb_build_object('montant', bp.montant, 'devise', bp.devise))
      from public.book_prices bp where bp.book_id = base.id
    ), '{}'::jsonb),
    -- La MÊME fonction que le déclencheur de publication (migration 0024) :
    -- le back-office affiche exactement ce que la base refusera, jamais une
    -- approximation qui laisserait découvrir le refus au moment de publier.
    public.manques_pour_publication(base.id),
    (cardinality(public.manques_pour_publication(base.id)) = 0) as publiable,
    compte.total
  from base cross join compte
  order by base.statut, base.slug
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.admin_lister_livres(text, integer, integer, text) is
  'Liste paginée du catalogue avec, pour chaque titre, son support et ce qui lui manque pour être publiable. `p_type` isole un support — c''est par là que l''éditeur retrouve ses livrets pédagogiques pour en régler l''accès, chaque titre portant ses propres leviers `gratuit`, `inclus_abonnement` et `disponible_achat`.';

revoke all on function public.admin_lister_livres(text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_lister_livres(text, integer, integer, text) to service_role;
