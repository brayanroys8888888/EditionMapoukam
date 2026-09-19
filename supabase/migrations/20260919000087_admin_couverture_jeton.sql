-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0087 — L'ADMINISTRATION VOIT ENFIN LES COUVERTURES.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE N'ÉTAIT PAS UN AFFICHAGE CASSÉ : C'ÉTAIT UN EMPLACEMENT VIDE.        │
-- │                                                                          │
-- │ La fiche d'administration pose un rectangle pointillé de 148 × 206 px,   │
-- │ décoratif et muet, avec une légende. Le commentaire de                   │
-- │ `admin.module.css` le dit en toutes lettres : « `admin_lire_livre` ne    │
-- │ rend AUCUNE couverture […] il tient la place que la couverture occupera  │
-- │ le jour où la fonction la rendra. »                                      │
-- │                                                                          │
-- │ Ce jour est arrivé. Rien d'autre ne manquait : le jeton est en base sur  │
-- │ 12 des 14 titres en local et 15 des 18 en ligne, et les objets existent  │
-- │ bel et bien dans le bucket public — `fiche.webp` rend 200 et quelques    │
-- │ dizaines de kilo-octets. Seules les deux fonctions de lecture ne         │
-- │ transportaient pas la colonne.                                           │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LA COLONNE EST AJOUTÉE EN FIN DE `returns table`, JAMAIS ÉPISSÉE.       │
-- │                                                                          │
-- │ Le client Supabase mappe les colonnes PAR POSITION. La 0079 avait retapé │
-- │ la signature de `catalog_list` et renommé `book_id` en `id` au passage : │
-- │ tout le catalogue est devenu muet, sans qu'aucune erreur soit levée. La  │
-- │ 0082 a inscrit la leçon, et on l'applique ici — les corps ci-dessous     │
-- │ sont REPRIS VERBATIM de la 0082 et de la 0065, à une ligne d'ajout près  │
-- │ dans chacun, tout à la fin.                                              │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- `drop` puis `create` et non `create or replace` : PostgreSQL refuse de
-- changer le type de retour d'une fonction par remplacement, et les colonnes
-- d'un `returns table` en font partie.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne rend pas un chemin de stockage
-- ni une URL. Elle rend le JETON, et `src/lib/storage/covers.ts` reste le seul
-- module à connaître la convention de chemin — c'est la règle que tient
-- `covers-architecture`, et la 0049 explique pourquoi la base porte l'identité
-- du jeu de couvertures plutôt que trois chemins.

-- ---------------------------------------------------------------------------
-- 1. La fiche d'un titre
-- ---------------------------------------------------------------------------

drop function if exists public.admin_lire_livre(uuid);

create function public.admin_lire_livre(p_book_id uuid)
 RETURNS TABLE(id uuid, slug text, auteur text, illustrateur text, origine_culturelle text, region region_conte, type_document document_type, orientation page_orientation, age_min smallint, age_max smallint, themes text[], niveau text, objectifs text[], nb_pages_extrait smallint, statut book_status, gratuit boolean, inclus_abonnement boolean, disponible_achat boolean, publie_le timestamp with time zone, prix jsonb, traductions jsonb, manques text[], publiable boolean, couverture_jeton text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    b.id,
    b.slug,
    b.auteur,
    b.illustrateur,
    b.origine_culturelle,
    -- `region` reste rendue : la 0071 lui a retiré sa place dans le catalogue
    -- public, pas la donnée. La colonne existe, et cinq régions y sont
    -- renseignées.
    b.region,
    -- Le support et l'orientation, revenus de la 0062. Un champ qu'on peut
    -- écrire sans le relire est un champ qu'on écrase.
    b.type_document,
    b.orientation,
    b.age_min,
    b.age_max,
    b.themes,
    -- Le niveau et les objectifs, colonnes de la 0079. Ils étaient écrivables
    -- depuis la 0081 et INVISIBLES ici : la fiche d'administration ne pouvait
    -- pas les relire, donc pas les afficher, donc pas les corriger. Un champ
    -- qu'on peut écrire sans le relire est un champ qu'on écrase.
    b.niveau,
    b.objectifs,
    b.nb_pages_extrait,
    b.statut,
    b.gratuit,
    b.inclus_abonnement,
    b.disponible_achat,
    b.publie_le,
    coalesce((
      select jsonb_object_agg(bp.zone, jsonb_build_object('montant', bp.montant, 'devise', bp.devise))
      from public.book_prices bp where bp.book_id = b.id
    ), '{}'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', bt.id,
          'langue', bt.langue,
          'titre', bt.titre,
          'resume', bt.resume,
          'description', bt.description,
          'statut', bt.statut,
          'nb_pages', bt.nb_pages,
          -- Des ÉTATS, jamais des chemins. Le back-office a besoin de savoir
          -- si une version est complète ; il n'a aucun usage de la clé de
          -- stockage, et la lui donner reviendrait à lui donner le fichier.
          'lisible', bt.fichier_lecture is not null,
          'telechargeable', bt.fichier_telechargement is not null
        )
        order by bt.langue
      )
      from public.book_translations bt where bt.book_id = b.id
    ), '[]'::jsonb),
    public.manques_pour_publication(b.id),
    (cardinality(public.manques_pour_publication(b.id)) = 0),
    -- AJOUT DE LA 0087, en dernière position pour ne déplacer personne.
    -- Le jeton, jamais un chemin : trois tailles vivent sous `covers/<jeton>/`,
    -- et seul `src/lib/storage/covers.ts` sait les nommer.
    b.couverture_jeton
  from public.books b
  where b.id = p_book_id;
$function$;

comment on function public.admin_lire_livre is
  'Fiche complete d''un titre pour l''administration. Rend `couverture_jeton` depuis la 0087 : sans lui, la fiche affichait un rectangle vide a la place de la couverture.';

-- ---------------------------------------------------------------------------
-- 2. La liste du catalogue
-- ---------------------------------------------------------------------------
--
-- Corps repris VERBATIM de la 0065, à une colonne près — ajoutée après
-- `total_lignes`, donc sans rien décaler.

drop function if exists public.admin_lister_livres(text, integer, integer, text);

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
    total_lignes bigint,
    couverture_jeton text
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
    compte.total,
    -- AJOUT DE LA 0087, en dernière position.
    base.couverture_jeton
  from base cross join compte
  order by base.statut, base.slug
  offset greatest(p_page - 1, 0) * public.taille_page_admin(p_taille)
  limit public.taille_page_admin(p_taille);
$$;

comment on function public.admin_lister_livres(text, integer, integer, text) is
  'Liste paginee du catalogue avec, pour chaque titre, son support, ce qui lui manque pour etre publiable, et son `couverture_jeton` depuis la 0087. `p_type` isole un support.';

revoke all on function public.admin_lister_livres(text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_lister_livres(text, integer, integer, text) to service_role;

-- PostgREST garde en cache la signature d'une fonction supprimee puis recreee.
notify pgrst, 'reload schema';
