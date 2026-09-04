# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v2.spec.ts >> aucune page ne force le navigateur à élargir sa fenêtre >> connexion tient dans la largeur de l’APPAREIL
- Location: tests\rendu\v2.spec.ts:80:5

# Error details

```
Error: connexion : le navigateur a élargi sa fenêtre à 632px pour faire tenir une mise en page trop large — l'appareil en fait 412

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 413
Received:    632
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - complementary [ref=e4]:
        - link [ref=e5] [cursor=pointer]:
          - /url: /fr
          - text: EditionMapoukam
        - paragraph [ref=e7]: Vos contes reprennent à la page où la lecture s'est arrêtée.
      - generic [ref=e8]:
        - heading "Se connecter" [level=1] [ref=e9]
        - generic [ref=e10]:
          - generic [ref=e11]:
            - generic [ref=e12]: Adresse email
            - textbox "Adresse email" [ref=e13]
          - generic [ref=e14]:
            - generic [ref=e15]: Mot de passe
            - textbox "Mot de passe" [ref=e16]
          - button "Se connecter" [ref=e17] [cursor=pointer]
        - navigation "Se connecter" [ref=e18]:
          - link "Mot de passe oublié ?" [ref=e19] [cursor=pointer]:
            - /url: /fr/mot-de-passe-oublie
          - generic [ref=e20]:
            - text: Pas encore de compte ?
            - link "Créer un compte" [ref=e21] [cursor=pointer]:
              - /url: /fr/inscription
  - button "Open Next.js Dev Tools" [ref=e27] [cursor=pointer]
  - alert [ref=e31]
```

# Test source

```ts
  10  |  * │ texte s'affiche, quel lien mène où. Il éprouve ce qui n'existe QUE       │
  11  |  * │ lorsqu'un moteur de rendu applique les styles : des largeurs réelles,    │
  12  |  * │ des débordements, un défilement magnétique, un contraste calculé.        │
  13  |  * │                                                                          │
  14  |  * │ Règle de sélection : si l'assertion passerait sans une seule ligne de    │
  15  |  * │ CSS, elle n'a rien à faire dans ce fichier.                              │
  16  |  * └──────────────────────────────────────────────────────────────────────────┘
  17  |  */
  18  | 
  19  | const PAGES = [
  20  |   { nom: 'accueil', chemin: '/fr' },
  21  |   { nom: 'boutique', chemin: '/fr/catalogue' },
  22  |   { nom: 'fiche', chemin: '/fr/contes/anansi-l-araignee-maligne' },
  23  |   { nom: 'association', chemin: '/fr/association' },
  24  |   { nom: 'à propos', chemin: '/fr/a-propos' },
  25  |   { nom: 'contact', chemin: '/fr/contact' },
  26  |   { nom: 'connexion', chemin: '/fr/connexion' },
  27  | ];
  28  | 
  29  | test.describe('la direction V2 est bien servie', () => {
  30  |   test('l’attribut de thème est posé sur la racine', async ({ page }) => {
  31  |     await page.goto('/fr');
  32  |     await expect(page.locator('html')).toHaveAttribute('data-design', 'v2');
  33  |   });
  34  | 
  35  |   test('les trois polices sont réellement chargées', async ({ page }) => {
  36  |     // ┌────────────────────────────────────────────────────────────────────┐
  37  |     // │ LE DÉFAUT QUI A COÛTÉ LE PLUS CHER DANS CE PROJET.                 │
  38  |     // │                                                                    │
  39  |     // │ Aucune police n'était embarquée, puis le middleware a redirigé      │
  40  |     // │ `/fonts/*.woff2` vers `/fr/fonts/*.woff2`. Dans les deux cas la     │
  41  |     // │ page rendait en Georgia — ce qui ressemble à un mauvais dessin, pas │
  42  |     // │ à une panne. Aucun test unitaire ne pouvait le voir.                │
  43  |     // └────────────────────────────────────────────────────────────────────┘
  44  |     await page.goto('/fr');
  45  |     const chargees = await page.evaluate(async () => {
  46  |       await document.fonts.ready;
  47  |       return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
  48  |     });
  49  | 
  50  |     expect(chargees).toContain('Fraunces');
  51  |     expect(chargees).toContain('Nunito');
  52  |   });
  53  | });
  54  | 
  55  | test.describe('aucune page ne déborde horizontalement', () => {
  56  |   for (const { nom, chemin } of PAGES) {
  57  |     test(`${nom} tient dans la largeur`, async ({ page }) => {
  58  |       // Un débordement horizontal est le défaut de mise en page le plus
  59  |       // fréquent et le plus visible sur un téléphone : la page se balade
  60  |       // latéralement et le contenu sort de l'écran.
  61  |       await page.goto(chemin);
  62  |       await page.waitForLoadState('networkidle');
  63  | 
  64  |       const { document: largeurDocument, fenetre } = await page.evaluate(() => ({
  65  |         document: document.documentElement.scrollWidth,
  66  |         fenetre: window.innerWidth,
  67  |       }));
  68  | 
  69  |       // Un pixel de tolérance : les largeurs fractionnaires d'un écran à
  70  |       // forte densité ne retombent jamais exactement sur la même valeur.
  71  |       expect(largeurDocument, `${nom} déborde de ${String(largeurDocument - fenetre)}px`).toBeLessThanOrEqual(
  72  |         fenetre + 1,
  73  |       );
  74  |     });
  75  |   }
  76  | });
  77  | 
  78  | test.describe('aucune page ne force le navigateur à élargir sa fenêtre', () => {
  79  |   for (const { nom, chemin } of PAGES) {
  80  |     test(`${nom} tient dans la largeur de l’APPAREIL`, async ({ page }) => {
  81  |       // ┌────────────────────────────────────────────────────────────────────┐
  82  |       // │ POURQUOI CE TEST DOUBLE LE PRÉCÉDENT, ET NE FAIT PAS DOUBLON.      │
  83  |       // │                                                                    │
  84  |       // │ Le test ci-dessus compare `scrollWidth` à `window.innerWidth`.     │
  85  |       // │ Or, quand une mise en page ne peut pas descendre sous une certaine │
  86  |       // │ largeur, le navigateur mobile ne la casse pas : il ÉLARGIT sa      │
  87  |       // │ fenêtre de mise en page et dézoome pour la faire tenir. Les deux   │
  88  |       // │ mesures grandissent alors ENSEMBLE, et l'égalité est préservée —   │
  89  |       // │ le test reste vert pendant que la page s'affiche minuscule.        │
  90  |       // │                                                                    │
  91  |       // │ C'est exactement ce qui est arrivé à l'écran de connexion : sa     │
  92  |       // │ grille avait deux colonnes de minimums 280 px et 320 px, donc un   │
  93  |       // │ plancher de 632 px. Sur un Pixel 7 — 412 px — `innerWidth` valait  │
  94  |       // │ 632, `scrollWidth` aussi, et la suite passait au vert.             │
  95  |       // │                                                                    │
  96  |       // │ La seule référence qui ne bouge pas est la largeur de l'APPAREIL.  │
  97  |       // └────────────────────────────────────────────────────────────────────┘
  98  |       await page.goto(chemin);
  99  |       await page.waitForLoadState('networkidle');
  100 | 
  101 |       const largeurAppareil = page.viewportSize()?.width ?? 0;
  102 |       expect(largeurAppareil, 'viewport non défini').toBeGreaterThan(0);
  103 | 
  104 |       const largeurMiseEnPage = await page.evaluate(() => window.innerWidth);
  105 | 
  106 |       expect(
  107 |         largeurMiseEnPage,
  108 |         `${nom} : le navigateur a élargi sa fenêtre à ${String(largeurMiseEnPage)}px pour ` +
  109 |           `faire tenir une mise en page trop large — l'appareil en fait ${String(largeurAppareil)}`,
> 110 |       ).toBeLessThanOrEqual(largeurAppareil + 1);
      |         ^ Error: connexion : le navigateur a élargi sa fenêtre à 632px pour faire tenir une mise en page trop large — l'appareil en fait 412
  111 |     });
  112 |   }
  113 | });
  114 | 
  115 | test.describe('boutique — les filtres en colonne', () => {
  116 |   test('sur ordinateur, les filtres sont À GAUCHE de la grille', async ({ page }, infos) => {
  117 |     test.skip(infos.project.name !== 'ordinateur', 'mise en page à deux colonnes');
  118 | 
  119 |     await page.goto('/fr/catalogue');
  120 |     const filtres = page.getByRole('navigation', { name: /filtrer/i });
  121 |     const grille = page.locator('ul').filter({ has: page.getByRole('listitem') }).last();
  122 | 
  123 |     const cadreFiltres = await filtres.boundingBox();
  124 |     const cadreGrille = await grille.boundingBox();
  125 |     expect(cadreFiltres).not.toBeNull();
  126 |     expect(cadreGrille).not.toBeNull();
  127 | 
  128 |     // À gauche, et pas au-dessus : c'est très exactement le défaut signalé.
  129 |     expect(cadreFiltres!.x).toBeLessThan(cadreGrille!.x);
  130 |     expect(cadreFiltres!.width).toBeLessThan(cadreGrille!.width);
  131 |   });
  132 | 
  133 |   test('sur téléphone, la feuille est FERMÉE et ne coûte qu’un bouton', async ({
  134 |     page,
  135 |   }, infos) => {
  136 |     test.skip(infos.project.name !== 'telephone', 'comportement en écran étroit');
  137 | 
  138 |     await page.goto('/fr/catalogue');
  139 | 
  140 |     // ┌────────────────────────────────────────────────────────────────────┐
  141 |     // │ CE QUI COMPTE : LA PREMIÈRE COUVERTURE EST-ELLE VISIBLE ?          │
  142 |     // │                                                                    │
  143 |     // │ La hauteur des filtres n'est qu'un moyen. Le but est que la        │
  144 |     // │ marchandise apparaisse sans défilement — et c'est ce que ces        │
  145 |     // │ assertions mesurent, plutôt qu'un nombre de pixels arbitraire qui   │
  146 |     // │ deviendrait faux au premier changement de mise en page.             │
  147 |     // └────────────────────────────────────────────────────────────────────┘
  148 |     const filtres = page.getByRole('navigation', { name: /filtrer/i });
  149 |     await expect(filtres, 'la feuille doit être fermée à l’ouverture').toBeHidden();
  150 | 
  151 |     const declencheur = page.getByRole('link', { name: /^filtrer$/i });
  152 |     await expect(declencheur).toBeVisible();
  153 | 
  154 |     const cadre = (await declencheur.boundingBox())!;
  155 |     const hauteurFenetre = page.viewportSize()!.height;
  156 | 
  157 |     expect(
  158 |       cadre.height,
  159 |       `le déclencheur occupe ${String(Math.round(cadre.height))}px sur ${String(hauteurFenetre)}px de haut`,
  160 |     ).toBeLessThan(hauteurFenetre * 0.12);
  161 |   });
  162 | 
  163 |   test('la feuille s’ouvre, RESTE ouverte d’un filtre à l’autre, puis se referme', async ({
  164 |     page,
  165 |   }, infos) => {
  166 |     test.skip(infos.project.name !== 'telephone', 'comportement en écran étroit');
  167 | 
  168 |     await page.goto('/fr/catalogue');
  169 |     const filtres = page.getByRole('navigation', { name: /filtrer/i });
  170 | 
  171 |     await page.getByRole('link', { name: /^filtrer$/i }).click();
  172 |     await expect(filtres).toBeVisible();
  173 | 
  174 |     // ┌────────────────────────────────────────────────────────────────────┐
  175 |     // │ MESURÉ UNE FOIS LA FEUILLE POSÉE, PAS PENDANT QU'ELLE MONTE.       │
  176 |     // │                                                                    │
  177 |     // │ `toBeVisible()` bascule dès que la visibilité change, c'est-à-dire  │
  178 |     // │ au PREMIER des 280 ms de glissement : une mesure prise là trouve la │
  179 |     // │ feuille encore à moitié sous l'écran, et l'assertion échoue sur une │
  180 |     // │ mise en page parfaitement correcte. `expect.poll` attend qu'elle se │
  181 |     // │ stabilise, sans inscrire une durée d'animation dans un test.        │
  182 |     // └────────────────────────────────────────────────────────────────────┘
  183 |     const hauteurFenetre = page.viewportSize()!.height;
  184 | 
  185 |     // Elle tient dans l'écran : c'est une feuille, pas un bandeau qui aurait
  186 |     // poussé la grille.
  187 |     await expect
  188 |       .poll(async () => {
  189 |         const cadre = (await filtres.boundingBox())!;
  190 |         return Math.round(cadre.y + cadre.height);
  191 |       })
  192 |       .toBeLessThanOrEqual(hauteurFenetre + 1);
  193 | 
  194 |     // ┌────────────────────────────────────────────────────────────────────┐
  195 |     // │ LE POINT DE TOUTE LA MÉCANIQUE : POSER DEUX FILTRES DE SUITE.      │
  196 |     // │                                                                    │
  197 |     // │ Chaque pastille est un LIEN, donc un rechargement complet. Si les  │
  198 |     // │ liens de la feuille ne reconduisaient pas `#filtres`, la feuille   │
  199 |     // │ se refermerait à chaque choix et « Voir N contes » ne voudrait     │
  200 |     // │ plus rien dire.                                                    │
  201 |     // └────────────────────────────────────────────────────────────────────┘
  202 |     await filtres.getByRole('link').first().click();
  203 |     await page.waitForLoadState('networkidle');
  204 | 
  205 |     expect(new URL(page.url()).hash).toBe('#filtres');
  206 |     await expect(filtres, 'la feuille doit survivre au choix d’un filtre').toBeVisible();
  207 | 
  208 |     // « Voir N contes » referme, et ramène sur la marchandise.
  209 |     await page.getByRole('link', { name: /^Voir \d+ conte/ }).click();
  210 |     await expect(filtres).toBeHidden();
```