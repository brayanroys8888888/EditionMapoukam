-- ---------------------------------------------------------------------------
-- CORRECTIF de la 0096 — le privilège retiré ne retirait rien.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ON NE RETIRE PAS UNE COLONNE D'UN PRIVILÈGE ACCORDÉ SUR LA TABLE.       │
-- │                                                                          │
-- │ La 0096 écrivait `revoke select (fichier_pdf, video_url) … from anon`.   │
-- │ PostgreSQL l'a accepté sans broncher, et la lecture est restée ouverte : │
-- │ `anon` tient un `SELECT` au niveau de la TABLE, et un retrait de colonne │
-- │ n'entame pas un privilège de table. La commande a réussi et n'a rien     │
-- │ fait — c'est la pire forme de protection, celle qui ne proteste pas.    │
-- │                                                                          │
-- │ Le seul modèle qui tienne est celui déjà employé par la 0069 sur         │
-- │ `association_content_translations` : AUCUN privilège de table, et une    │
-- │ liste EXPLICITE de colonnes. Ce qui n'y figure pas est refusé, avec un   │
-- │ code d'erreur, avant qu'une ligne soit lue.                              │
-- │                                                                          │
-- │ Vérifié à la main : `set role anon; select fichier_pdf …` rendait une    │
-- │ colonne avant ce fichier, et échoue après.                               │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

revoke select on public.association_contents from anon, authenticated;

/*
 * La liste est écrite EN TOUTES LETTRES, et c'est délibéré : une colonne
 * ajoutée demain n'est pas lisible tant que personne ne l'a inscrite ici. Le
 * défaut penche du côté du refus, et l'oubli se voit à l'écran plutôt que de
 * s'ouvrir en silence.
 *
 * `fichier_pdf` et `video_url` sont ABSENTS. C'est toute la protection des
 * ressources réservées. Les ajouter ouvrirait chaque fiche et chaque replay à
 * qui détient la clé publique, sans qu'aucun écran ne change d'apparence.
 *
 * `pdf_pages` et `video_minutes` y sont : « 12 pages », « 52 min » se lisent
 * sans donner la ressource, et c'est ce qui donne envie d'adhérer.
 */
grant select (
  id, slug, categorie, acces, statut, publie_le, minutes, image_url, vedette,
  ordre, cree_le, maj_le, type_publication, programme_le, signe_par, publics,
  commentaires_ouverts, vues, video_minutes, pdf_pages, evenement_id,
  prevenir_adherents, email_envoye_le
) on public.association_contents to anon, authenticated;

/*
 * Le texte alternatif décrit la couverture, qui est montrée à TOUT LE MONDE —
 * y compris sur la page publique et sur les cartes. Le refuser priverait de
 * la description ceux-là mêmes à qui elle est destinée : les lecteurs
 * d'écran. Il rejoint donc titre et chapeau, du côté ouvert.
 *
 * La 0096 l'a ajouté sans l'accorder, et il était donc illisible : sur cette
 * table, le modèle des colonnes explicites était déjà en place.
 */
grant select (texte_alternatif) on public.association_content_translations to anon, authenticated;
