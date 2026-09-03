-- ===========================================================================
-- 0077 — L'ÉCRAN D'ÉDITION AVAIT PERDU LE SUPPORT ET L'ORIENTATION
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ UNE COPIE PRISE UNE VERSION TROP TÔT.                                    │
-- │                                                                          │
-- │ La 0070 devait ajouter `description` aux versions rendues par            │
-- │ `admin_lire_livre`. Changer une colonne de sortie impose `drop` puis     │
-- │ `create` : elle a donc réécrit la fonction entière, et son en-tête dit   │
-- │ « corps repris VERBATIM de la 0059 ».                                    │
-- │                                                                          │
-- │ C'est la 0059 qui était la mauvaise source. La 0062 avait ajouté         │
-- │ `type_document` et `orientation` à cette même fonction, deux jours plus  │
-- │ tôt. Les reprendre depuis la 0059 les a donc EFFACÉES de la sortie, sans │
-- │ toucher ni aux colonnes ni aux données : `books.type_document` est resté │
-- │ `not null`, l'écriture par `admin_modifier_livre` a continué de marcher, │
-- │ et rien n'a protesté côté base.                                          │
-- │                                                                          │
-- │ Côté écran, en revanche : `src/app/[langue]/admin/contes/[id]/page.tsx`  │
-- │ choisit ses libellés avec `MOTS[conte.type_document]`. Une clé           │
-- │ `undefined` rend un objet `undefined`, et la première lecture de champ   │
-- │ jette — la fiche d'édition de N'IMPORTE QUEL titre tombait en erreur.    │
-- │ Plus sournois encore si elle avait survécu : la liste déroulante du      │
-- │ support serait repartie sur sa première option, et enregistrer un        │
-- │ livret l'aurait retourné en conte sans qu'on l'ait demandé.              │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Le corps ci-dessous est celui de la 0070 — `description` comprise —, plus les
-- deux colonnes de la 0062 remises à leur place, juste après `region`. Aucun
-- autre changement : une migration corrective ne charrie rien d'autre.
--
-- `drop` puis `create` : ajouter une colonne de sortie est un changement de
-- TYPE DE RETOUR, et `create or replace` le refuse.
-- ===========================================================================

drop function if exists public.admin_lire_livre(uuid);

create function public.admin_lire_livre(p_book_id uuid)
  returns table (
    id uuid,
    slug text,
    auteur text,
    illustrateur text,
    origine_culturelle text,
    region public.region_conte,
    type_document public.document_type,
    orientation public.page_orientation,
    age_min smallint,
    age_max smallint,
    themes text[],
    nb_pages_extrait smallint,
    statut public.book_status,
    gratuit boolean,
    inclus_abonnement boolean,
    disponible_achat boolean,
    publie_le timestamptz,
    prix jsonb,
    traductions jsonb,
    manques text[],
    publiable boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
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
    (cardinality(public.manques_pour_publication(b.id)) = 0)
  from public.books b
  where b.id = p_book_id;
$$;

comment on function public.admin_lire_livre(uuid) is
  'Un titre et tout ce que le back-office en édite : champs métier, région, type de document, orientation, thèmes, prix par zone, versions linguistiques avec leur identifiant, leur résumé et leur description, et ce qui lui manque pour être publiable — calculé par `manques_pour_publication()`, la fonction qu''applique le déclencheur. Les versions portent `lisible` et `telechargeable`, des états et non des chemins de stockage. Le support et l''orientation, perdus par la 0070, sont revenus en 0077.';

revoke all on function public.admin_lire_livre(uuid) from public, anon, authenticated;
grant execute on function public.admin_lire_livre(uuid) to service_role;
