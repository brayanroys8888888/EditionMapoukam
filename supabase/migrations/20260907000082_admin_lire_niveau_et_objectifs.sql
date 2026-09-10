-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0082 — LA FICHE D'ADMINISTRATION RELIT `niveau` ET `objectifs`.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ÉCRIRE SANS RELIRE, C'EST ÉCRASER.                                      │
-- │                                                                          │
-- │ La 0079 a créé les deux colonnes, la 0081 les a rendues écrivables. Il   │
-- │ manquait la moitié qui les rend UTILISABLES : `admin_lire_livre` ne les  │
-- │ rendait pas, si bien que la fiche d'édition ne pouvait pas afficher leur │
-- │ valeur actuelle. Un formulaire qui part d'un champ vide et qui envoie    │
-- │ toujours sa valeur efface ce qu'il n'a pas su montrer — au premier       │
-- │ enregistrement, sans rien dire.                                          │
-- │                                                                          │
-- │ C'est la même leçon que la 0062 sur `type_document` et `orientation`,    │
-- │ écrite en toutes lettres dans le corps de la fonction. Elle a été        │
-- │ répétée ici parce qu'elle vient d'être répétée en pratique.              │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- La signature ci-dessous est REPRISE du texte que la base rend
-- (`pg_get_functiondef`), avec les deux colonnes épissées à leur place. Elle
-- n'est pas retapée : la 0079 avait retapé celle de `catalog_list` et renommé
-- `book_id` en `id` au passage, ce qui a rendu tout le catalogue muet — le
-- client Supabase mappe par position, et aucune erreur n'est levée.

drop function if exists public.admin_lire_livre(uuid);

create function public.admin_lire_livre(p_book_id uuid)
 RETURNS TABLE(id uuid, slug text, auteur text, illustrateur text, origine_culturelle text, region region_conte, type_document document_type, orientation page_orientation, age_min smallint, age_max smallint, themes text[], niveau text, objectifs text[], nb_pages_extrait smallint, statut book_status, gratuit boolean, inclus_abonnement boolean, disponible_achat boolean, publie_le timestamp with time zone, prix jsonb, traductions jsonb, manques text[], publiable boolean)
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
    (cardinality(public.manques_pour_publication(b.id)) = 0)
  from public.books b
  where b.id = p_book_id;
$function$;

comment on function public.admin_lire_livre is
  'Fiche complete d''un titre pour l''administration. Rend `niveau` et `objectifs` depuis la 0082 : sans eux, la fiche d''edition les effacait au premier enregistrement.';

-- PostgREST garde en cache la signature d'une fonction supprimee puis recreee.
notify pgrst, 'reload schema';
