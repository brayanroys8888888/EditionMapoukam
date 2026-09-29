-- ---------------------------------------------------------------------------
-- LE DÉPÔT DE FICHIERS DE L'ASSOCIATION — DEUX BUCKETS, ET LA LIGNE ENTRE EUX.
--
-- Jusqu'ici l'éditeur ne pouvait que COLLER UNE ADRESSE : couverture, photo,
-- fiche PDF, vidéo. L'aide du champ le disait, et `docs/CHANTIER-ASSOCIATION.md`
-- le rangeait dans « deux manques nommés, pas cachés ». Il peut désormais
-- choisir un fichier sur son appareil.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LA COUVERTURE EST PUBLIQUE. TOUT LE RESTE EST PRIVÉ.                    │
-- │                                                                          │
-- │ Ce n'est pas un compromis, c'est la même ligne que le dépôt trace déjà   │
-- │ pour les livres à la migration 0020 : `covers` y est public « délibéré-  │
-- │ ment — une couverture est un argument de vente, elle doit être indexable │
-- │ par les moteurs de recherche (§5.4) et servie par le CDN ».              │
-- │                                                                          │
-- │ La couverture d'une publication associative joue exactement ce rôle :    │
-- │ elle s'affiche sur les cartes de `/association`, y compris celles des    │
-- │ contenus RÉSERVÉS, où elle est justement ce qui donne envie d'adhérer.   │
-- │ La signer à chaque rendu la retirerait du CDN et ferait payer une URL    │
-- │ neuve, à chaque visite, à un public dont §5.1 rappelle qu'une part       │
-- │ importante est sur réseau mobile lent.                                   │
-- │                                                                          │
-- │ Le reste — photos DU CORPS, vidéos, sons, fiches PDF — vit derrière le   │
-- │ mur. `association_contenu` ne rend `corps` que si `can_read` est vrai,   │
-- │ et la colonne n'est accordée ni à `anon` ni à `authenticated`. Mettre    │
-- │ ces fichiers dans un bucket public rendrait leur adresse suffisante :    │
-- │ le mur tiendrait sur le texte et laisserait passer tout ce qui n'en est  │
-- │ pas. Ils sont donc privés, et servis par URL signée de courte durée.     │
-- │                                                                          │
-- │ C'est ce que le cahier des charges exige depuis l'arbitrage n° 15 du     │
-- │ 28 septembre 2026 : « les fichiers de l'espace passent par des liens     │
-- │ signés de courte durée et leur adresse en base n'est pas lisible ».      │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ CE QUE CES BUCKETS NE CHANGENT PAS.                                     │
-- │                                                                          │
-- │ Le téléchargement d'un LIVRE DU CATALOGUE n'est accordé que par un       │
-- │ achat, et rien ici ne l'approche : ces bucket ne contiennent aucun       │
-- │ fichier de livre, et `access_for_books` ne les connaît pas.              │
-- └──────────────────────────────────────────────────────────────────────────┘
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- La couverture. Même plafond que `covers`, et les mêmes formats : c'est le
  -- même objet, servi au même endroit.
  (
    'association-images',
    'association-images',
    true,
    5242880,
    array['image/webp', 'image/avif', 'image/png', 'image/jpeg']
  ),
  /*
   * Le reste. 200 Mo : un replay d'atelier d'une heure ne tient pas dans
   * moins, et le refuser ici obligerait à revenir à l'adresse collée — donc
   * à un fichier hébergé ailleurs, sur lequel le mur ne peut plus rien.
   *
   * La liste de types est CLOSE, et c'est le premier filtre : le stockage
   * refuse de lui-même ce qui n'y figure pas, même si la route se trompait.
   */
  (
    'association-fichiers',
    'association-fichiers',
    false,
    209715200,
    array[
      'application/pdf',
      'image/webp', 'image/avif', 'image/png', 'image/jpeg',
      'video/mp4', 'video/webm',
      'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'
    ]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Politiques
--
-- Même modèle qu'à la 0020, et pour la même raison : `storage.objects` a déjà
-- RLS activée sans aucune politique, donc tout est refusé aux rôles clients.
-- On pose malgré tout un refus EXPLICITE — « aucune table sans politique
-- explicite » vaut aussi ici, et l'intention doit se LIRE dans le schéma
-- plutôt que se déduire d'une absence.
-- ---------------------------------------------------------------------------

create policy "association_fichiers_aucun_acces_client"
  on storage.objects
  for all
  to anon, authenticated
  using (bucket_id = 'association-fichiers' and false)
  with check (bucket_id = 'association-fichiers' and false);

-- Les couvertures, elles, sont lisibles de tous. Le bucket est déjà marqué
-- public ; la politique le dit aussi, pour que les deux niveaux concordent.
create policy "association_images_lecture_publique"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'association-images');
