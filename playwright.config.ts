import { defineConfig, devices } from '@playwright/test';

/**
 * RENDU VÉRIFIÉ DANS UN VRAI NAVIGATEUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE VITEST NE PEUT PAS VOIR, ET POURQUOI IL FALLAIT CECI.            │
 * │                                                                          │
 * │ Les 1271 tests de `npm run test` tournent sous jsdom, qui n'applique     │
 * │ AUCUN style : il ne calcule pas de mise en page, n'exécute pas de        │
 * │ media query, n'a pas de scroll-snap ni de `position: sticky`. Une        │
 * │ colonne de filtres qui recouvre la grille, un carrousel qui ne défile    │
 * │ pas, un pied de page invisible sur fond vert : tout cela passe au vert.  │
 * │                                                                          │
 * │ Ces vérifications-ci sont donc SÉPARÉES de la porte de validation. Elles │
 * │ demandent un serveur et un navigateur, ce que `npm run verify` ne doit   │
 * │ pas exiger — la porte doit rester exécutable partout, et vite.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `npm run rendu` les lance ; `npm run verify` les ignore.
 */
const BASE = process.env.RENDU_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/rendu',
  /*
   * En série, et un seul essai.
   *
   * Ces tests parlent tous à la MÊME base locale et au même serveur : les
   * paralléliser ferait dépendre le résultat de l'ordre d'exécution, et un
   * échec deviendrait irreproductible. Un test de rendu qui clignote ne se
   * corrige jamais — il se désactive.
   */
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: BASE,
    /* La trace uniquement au premier échec : elle pèse lourd, et on ne la
       regarde que quand quelque chose est cassé. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
  },

  /*
   * Trois appareils, choisis pour ce qu'ils PROUVENT, pas pour faire nombre :
   *
   *   * l'ordinateur montre les deux colonnes de la boutique et les flèches
   *     du carrousel ;
   *   * la tablette est la largeur où la colonne de filtres se replie ;
   *   * le téléphone est `pointer: coarse` — c'est là que le carrousel doit
   *     être magnétique et que les flèches doivent disparaître.
   */
  projects: [
    {
      name: 'ordinateur',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ LA TABLETTE TOURNE SOUS CHROMIUM, PAS SOUS WEBKIT.                   │
     * │                                                                      │
     * │ Le descripteur `iPad (gen 7)` de Playwright lance WebKit, qui est un │
     * │ second navigateur à télécharger — plus de cent mégaoctets, sur une   │
     * │ connexion qui a mis un quart d'heure pour Chromium.                  │
     * │                                                                      │
     * │ Or ce que ces vérifications éprouvent est une MISE EN PAGE à largeur │
     * │ de tablette et au doigt : le repli de la colonne de filtres, la      │
     * │ disparition des flèches du carrousel, l'absence de débordement. Rien │
     * │ de tout cela n'est propre à WebKit.                                  │
     * │                                                                      │
     * │ Ce que cette configuration ne couvre donc PAS, et qu'il faut savoir :│
     * │ les particularités du moteur de Safari. Le jour où un défaut         │
     * │ n'apparaît que sur iPad, il faudra installer WebKit — et ce          │
     * │ commentaire dira pourquoi il ne l'était pas.                         │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    {
      name: 'tablette',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        isMobile: false,
      },
    },
    {
      name: 'telephone',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
