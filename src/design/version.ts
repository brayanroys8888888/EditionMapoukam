/**
 * LA DIRECTION VISUELLE SERVIE, ET COMMENT ON LA LIT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL ENDROIT DÉCIDE, ET IL EST LISIBLE DES DEUX CÔTÉS.               │
 * │                                                                          │
 * │ `getServerEnv()` REFUSE de s'exécuter dans un navigateur — c'est ce qui  │
 * │ empêche la clé `service_role` de fuir. Un composant client ne peut donc  │
 * │ pas l'appeler pour savoir quel thème est actif.                          │
 * │                                                                          │
 * │ D'où cette lecture directe de `process.env.NEXT_PUBLIC_DESIGN_VERSION`,  │
 * │ que Next remplace à la compilation dans les deux mondes. Le préfixe      │
 * │ `NEXT_PUBLIC_` est ici parfaitement légitime : la direction visuelle     │
 * │ n'est pas un secret, elle se voit à l'œil sur chaque page.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type VersionDesign = 'v1' | 'v2' | 'v3';

export const VERSIONS_DESIGN: readonly VersionDesign[] = ['v1', 'v2', 'v3'];

/**
 * La direction visuelle courante.
 *
 * Le repli est `v2` : c'est la direction actuellement VALIDÉE. La V3, reprise
 * du dossier de passation (`docs/REFONTE-V3.md`), ne se sert que sur demande
 * explicite tant que ses treize lots ne sont pas livrés — un environnement
 * muet doit servir ce qui est fini, pas ce qui est en cours.
 *
 * Une valeur inconnue — une faute de frappe dans un fichier d'environnement —
 * retombe elle aussi sur `v2` plutôt que de casser le rendu.
 */
export function versionDesign(): VersionDesign {
  const brut = process.env.NEXT_PUBLIC_DESIGN_VERSION;
  if (brut === 'v1') return 'v1';
  if (brut === 'v3') return 'v3';
  return 'v2';
}


/** Vrai quand la V2 est servie. Sucre, pour les conditions de rendu. */
export function estV2(): boolean {
  return versionDesign() === 'v2';
}

/** Vrai quand la V3 est servie. */
export function estV3(): boolean {
  return versionDesign() === 'v3';
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE LES ÉCRANS DEMANDENT VRAIMENT QUAND ILS TESTENT « v2 ».          │
 * │                                                                          │
 * │ Douze écrans portaient `versionDesign() === 'v2'`. Aucun ne s'intéresse  │
 * │ à la V2 en tant que telle : ils demandent « est-ce que je rends la       │
 * │ structure REFONDUE, ou la structure d'origine ? ». La distinction est    │
 * │ structurelle — en-tête réactif, tiroir de panier, cartes de conte — pas  │
 * │ chromatique.                                                             │
 * │                                                                          │
 * │ Écrit `=== 'v2'`, ce test fait retomber la V3 sur la structure V1 : la   │
 * │ palette d'Organic peinte sur un squelette que personne n'a redessiné     │
 * │ depuis. Ce n'est pas une dégradation visible à la compilation — c'est    │
 * │ le genre de panne qui s'explique par « le thème ne marche pas ».         │
 * │                                                                          │
 * │ La V3 part donc de la structure de la V2, et les lots suivants la        │
 * │ déforment vers Organic. C'est son ascendance réelle : arrondie, accent   │
 * │ chaud, boutons en pilule.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function structureRefondue(): boolean {
  const version = versionDesign();
  return version === 'v2' || version === 'v3';
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE THÈME EST UN SECOND AXE, ORTHOGONAL À LA DIRECTION.                  │
 * │                                                                          │
 * │ `data-design` dit QUELLE palette ; `data-theme` dit dans quel SENS on la │
 * │ lit. Les deux se posent sur `<html>`, dans l'enveloppe racine, et nulle  │
 * │ part ailleurs.                                                           │
 * │                                                                          │
 * │ Seule la V3 porte un thème sombre. Les V1 et V2 n'en ont jamais eu, et   │
 * │ leur en fabriquer un au passage serait inventer une direction que        │
 * │ personne n'a dessinée : `themeValide` renvoie donc `null` pour elles,    │
 * │ et l'attribut n'est pas posé du tout.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type ThemeClair = 'light' | 'dark';

/** Le nom du cookie qui porte le choix explicite du visiteur. */
export const COOKIE_THEME = 'em_theme';

/**
 * Le thème à servir, à partir de la valeur brute du cookie.
 *
 * `null` signifie « ne pose pas l'attribut » — soit parce que la direction
 * servie n'a pas de thème sombre, soit parce que le visiteur n'a jamais
 * choisi. Dans ce second cas, c'est la requête média
 * `prefers-color-scheme: dark` des jetons qui décide, sur le sélecteur
 * `:root[data-design='v3']:not([data-theme])`.
 *
 * L'absence d'attribut est donc une VALEUR, pas un trou : elle veut dire
 * « suis le système ». La poser à `light` par défaut retirerait au visiteur
 * qui a réglé son téléphone en sombre le thème qu'il a demandé.
 */
export function themeValide(brut: string | undefined | null): ThemeClair | null {
  if (!estV3()) return null;
  if (brut === 'dark') return 'dark';
  if (brut === 'light') return 'light';
  return null;
}
