/**
 * UN `Blob`, JAMAIS UN `Buffer` NU — et ce n'est pas une préférence de style.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE LE `Buffer` NU DEVENAIT EN PRODUCTION.                           │
 * │                                                                          │
 * │ Mesuré sur les fichiers réellement déposés en ligne : une vignette qui   │
 * │ pesait 26 Ko en local en pesait 68 en ligne, et commençait par           │
 * │                                                                          │
 * │     52 49 46 46  ef bf bd ef bf bd  0000  au lieu de                     │
 * │     52 49 46 46  66 67 00 00              — soit RIFF….WEBP              │
 * │                                                                          │
 * │ `EF BF BD` est l'encodage UTF-8 de U+FFFD, le caractère de remplacement. │
 * │ Chaque octet qui ne formait pas de l'UTF-8 valide avait été remplacé par │
 * │ lui : le binaire avait traversé un décodage TEXTE. D'où un fichier plus  │
 * │ lourd, portant les bons en-têtes, servi en `200 image/webp` — et         │
 * │ parfaitement illisible.                                                  │
 * │                                                                          │
 * │ Le corps était passé à `fetch`, que Next instrumente pour son cache. Un  │
 * │ corps binaire NU y est exposé à être lu comme du texte ; un `Blob` ne    │
 * │ l'est pas, la couche multipart le traitant comme une pièce opaque.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI RIEN NE L'A VU PENDANT DES JOURS.                              │
 * │                                                                          │
 * │ 1. Le dépôt RÉUSSIT. Aucune exception, aucun code d'erreur, rien dans    │
 * │    les journaux — c'est à la LECTURE, bien plus tard, qu'une image       │
 * │    refuse de s'ouvrir.                                                   │
 * │ 2. En local, le client Supabase parle à une pile Docker sans passer par  │
 * │    le `fetch` instrumenté de Next. Le défaut n'existe pas sur les postes │
 * │    de développement.                                                     │
 * │ 3. Le fichier garde ses en-têtes : il a l'air d'un WebP, il est servi    │
 * │    comme un WebP, il est simplement plus gros. Rien ne le distingue      │
 * │    d'une image valide sans l'ouvrir.                                     │
 * │                                                                          │
 * │ D'où le test qui dépose puis RELIT, et compare les octets un à un.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function enBlob(contenu: Buffer, contentType: string): Blob {
  // `Uint8Array.from` plutôt que le `Buffer` tel quel : un `Buffer` est une vue
  // sur un tampon partagé, dont les bornes ne sont pas toujours celles qu'on
  // croit après un découpage. La copie lève l'ambiguïté.
  return new Blob([Uint8Array.from(contenu)], { type: contentType });
}
