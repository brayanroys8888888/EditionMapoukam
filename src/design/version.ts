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
export type VersionDesign = 'v1' | 'v2';

export const VERSIONS_DESIGN: readonly VersionDesign[] = ['v1', 'v2'];

/**
 * La direction visuelle courante.
 *
 * Le repli est `v1`, jamais `v2` : tant que la V2 n'est pas validée, un
 * environnement qui ne dit rien doit servir ce qui l'est. Une valeur inconnue
 * — une faute de frappe dans un fichier d'environnement — retombe elle aussi
 * sur `v1` plutôt que de casser le rendu.
 */
export function versionDesign(): VersionDesign {
  const brut = process.env.NEXT_PUBLIC_DESIGN_VERSION;
  return brut === 'v1' ? 'v1' : 'v2';
}


/** Vrai quand la V2 est servie. Sucre, pour les conditions de rendu. */
export function estV2(): boolean {
  return versionDesign() === 'v2';
}
