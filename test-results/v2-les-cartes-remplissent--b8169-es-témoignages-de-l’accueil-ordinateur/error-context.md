# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v2.spec.ts >> les cartes remplissent leur colonne, et se tiennent à la même hauteur >> les témoignages de l’accueil
- Location: tests\rendu\v2.spec.ts:298:3

# Error details

```
Error: la carte remplit sa colonne

expect(received).toBe(expected) // Object.is equality

Expected: 372
Received: 292
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - link "Aller au contenu" [ref=e3] [cursor=pointer]:
      - /url: "#contenu"
    - generic [ref=e4]:
      - link "EditionMapoukam" [ref=e5] [cursor=pointer]:
        - /url: /fr
      - navigation "Navigation principale" [ref=e7]:
        - group [ref=e8]:
          - generic "Boutique" [ref=e9] [cursor=pointer]
        - link "Offres" [ref=e10] [cursor=pointer]:
          - /url: /fr/offres
        - link "Association" [ref=e11] [cursor=pointer]:
          - /url: /fr/association
        - link "Expertise & conseil" [ref=e12] [cursor=pointer]:
          - /url: /fr/expertise
        - link "À propos" [ref=e13] [cursor=pointer]:
          - /url: /fr/a-propos
        - link "Nous écrire" [ref=e14] [cursor=pointer]:
          - /url: /fr/contact
      - generic [ref=e15]:
        - group "Langue du site" [ref=e16]:
          - generic [ref=e17]: FR
          - link "EN" [ref=e18] [cursor=pointer]:
            - /url: /en
        - link "Rechercher un conte" [ref=e19] [cursor=pointer]:
          - /url: /fr/catalogue
        - link "Mon panier" [ref=e23] [cursor=pointer]:
          - /url: /fr/panier
        - link "Se connecter" [ref=e27] [cursor=pointer]:
          - /url: /fr/connexion
  - main [ref=e28]:
    - generic [ref=e29]:
      - region [ref=e30]:
        - generic [ref=e32]:
          - paragraph [ref=e33]: Contes africains illustrés · 4 à 10 ans
          - heading "Des histoires qui leur ressemblent" [level=1] [ref=e34]
          - paragraph [ref=e35]: Le patrimoine du conte africain, illustré et raconté pour les enfants d’aujourd’hui. À lire en ligne, ou à garder pour toujours.
          - generic [ref=e36]:
            - link "Découvrir nos livres" [ref=e37] [cursor=pointer]:
              - /url: /fr/catalogue
            - link "Comment ça marche" [ref=e38] [cursor=pointer]:
              - /url: /fr/offres
      - generic [ref=e40]:
        - generic [ref=e46]:
          - paragraph [ref=e47]: Paiement sécurisé
          - paragraph [ref=e48]: Vos achats sont protégés de bout en bout.
        - generic [ref=e54]:
          - paragraph [ref=e55]: Fichiers à garder
          - paragraph [ref=e56]: PDF et EPUB téléchargés, sans limite de durée.
        - generic [ref=e61]:
          - paragraph [ref=e62]: Une équipe qui répond
          - paragraph [ref=e63]: Une question ? Nous lisons chaque message.
      - region [ref=e64]:
        - generic [ref=e65]:
          - generic [ref=e66]:
            - generic [ref=e67]:
              - generic [ref=e68]: Notre catalogue
              - heading "Nouveautés" [level=2] [ref=e69]
              - paragraph [ref=e70]: Les dernières histoires entrées au catalogue, illustrées et prêtes à lire.
            - link "Voir tout le catalogue" [ref=e71] [cursor=pointer]:
              - /url: /fr/catalogue
          - generic [ref=e72]:
            - list "Nouveautés" [ref=e73]:
              - listitem [ref=e74]:
                - generic [ref=e75]:
                  - button "Ajouter au panier" [ref=e79] [cursor=pointer]
                  - generic [ref=e80]: merveilleux
                  - link "L'oiseau de feu" [ref=e82] [cursor=pointer]:
                    - /url: /fr/contes/l-oiseau-de-feu
                  - generic [ref=e83]: 5–10 ans · 20 pages
                  - generic [ref=e84]: Avec l'abonnement
              - listitem [ref=e86]:
                - generic [ref=e87]:
                  - button "Ajouter au panier" [ref=e91] [cursor=pointer]
                  - generic [ref=e92]: nature
                  - link "La rivière qui parlait" [ref=e94] [cursor=pointer]:
                    - /url: /fr/contes/la-riviere-qui-parlait
                  - generic [ref=e95]: 4–9 ans · 18 pages
                  - generic [ref=e96]: Gratuit
              - listitem [ref=e98]:
                - generic [ref=e99]:
                  - generic [ref=e100]: Lire l'extrait
                  - generic [ref=e103]: nature
                  - link "Petit Baobab" [ref=e105] [cursor=pointer]:
                    - /url: /fr/contes/petit-baobab
                  - generic [ref=e106]: 3–6 ans · 12 pages
                  - generic [ref=e107]: Gratuit
              - listitem [ref=e109]:
                - generic [ref=e110]:
                  - button "Ajouter au panier" [ref=e114] [cursor=pointer]
                  - generic [ref=e115]: animaux
                  - link "La girafe et l'oiseau malin" [ref=e117] [cursor=pointer]:
                    - /url: /fr/contes/la-girafe-et-l-oiseau-malin
                  - generic [ref=e118]: 4–8 ans · 16 pages
                  - generic [ref=e119]: Avec l'abonnement
              - listitem [ref=e121]:
                - generic [ref=e122]:
                  - button "Ajouter au panier" [ref=e126] [cursor=pointer]
                  - generic [ref=e127]: ruse
                  - link "Anansi l'araignée maligne" [ref=e129] [cursor=pointer]:
                    - /url: /fr/contes/anansi-l-araignee-maligne
                  - generic [ref=e130]: 6–12 ans · 24 pages
                  - generic [ref=e131]: Avec l'abonnement
              - listitem [ref=e133]:
                - generic [ref=e134]:
                  - button "Ajouter au panier" [ref=e138] [cursor=pointer]
                  - generic [ref=e139]: musique
                  - link "Kouassi et le tam-tam" [ref=e141] [cursor=pointer]:
                    - /url: /fr/contes/kouassi-et-le-tam-tam
                  - generic [ref=e142]: 5–10 ans · 20 pages
                  - generic [ref=e143]: Avec l'abonnement
              - listitem [ref=e145]:
                - generic [ref=e146]:
                  - button "Ajouter au panier" [ref=e150] [cursor=pointer]
                  - generic [ref=e151]: animaux
                  - link "Le lion et la souris" [ref=e153] [cursor=pointer]:
                    - /url: /fr/contes/le-lion-et-la-souris
                  - generic [ref=e154]: 3–7 ans · 16 pages
                  - generic [ref=e155]: Avec l'abonnement
              - listitem [ref=e157]:
                - generic [ref=e158]:
                  - button "Ajouter au panier" [ref=e162] [cursor=pointer]
                  - generic [ref=e163]: animaux
                  - link "La tortue et le lapin" [ref=e165] [cursor=pointer]:
                    - /url: /fr/contes/la-tortue-et-le-lapin
                  - generic [ref=e166]: 3–8 ans · 14 pages
                  - generic [ref=e167]: 4,99 €
            - generic [ref=e169]:
              - button "Précédent" [ref=e170] [cursor=pointer]:
                - generic [ref=e171]: ‹
              - button "Suivant" [ref=e172] [cursor=pointer]:
                - generic [ref=e173]: ›
      - region [ref=e174]:
        - generic [ref=e177]:
          - img "Pourquoi des contes africains pour enfants" [ref=e179]
          - generic [ref=e180]:
            - generic [ref=e181]: Notre histoire
            - heading "Pourquoi des contes africains pour enfants" [level=2] [ref=e182]
            - paragraph [ref=e183]: Chaque enfant mérite de grandir avec des histoires qui lui ressemblent, qui célèbrent ses racines et qui nourrissent ses rêves.
            - paragraph [ref=e184]: "Nos livres ne sont pas simplement des histoires : ce sont des ponts entre les générations et les cultures, des outils d’éveil à la diversité, et des compagnons de route pour grandir en confiance."
            - link "En savoir plus" [ref=e185] [cursor=pointer]:
              - /url: /fr/a-propos
      - region [ref=e186]:
        - generic [ref=e187]:
          - generic [ref=e189]:
            - generic [ref=e190]: Par thème
            - heading "Explorez par thème" [level=2] [ref=e191]
            - paragraph [ref=e192]: Chaque thème a sa couleur. Cliquez pour filtrer le catalogue.
          - list [ref=e193]:
            - listitem [ref=e194]:
              - link [ref=e196] [cursor=pointer]:
                - /url: /fr/catalogue?themes=animaux
                - paragraph [ref=e198]: animaux
                - paragraph [ref=e199]: 4 titres
            - listitem [ref=e200]:
              - link [ref=e202] [cursor=pointer]:
                - /url: /fr/catalogue?themes=nature
                - paragraph [ref=e204]: nature
                - paragraph [ref=e205]: 2 titres
            - listitem [ref=e206]:
              - link [ref=e208] [cursor=pointer]:
                - /url: /fr/catalogue?themes=ruse
                - paragraph [ref=e210]: ruse
                - paragraph [ref=e211]: 2 titres
            - listitem [ref=e212]:
              - link [ref=e214] [cursor=pointer]:
                - /url: /fr/catalogue?themes=amiti%C3%A9
                - paragraph [ref=e216]: amitié
                - paragraph [ref=e217]: 1 titre
            - listitem [ref=e218]:
              - link [ref=e220] [cursor=pointer]:
                - /url: /fr/catalogue?themes=courage
                - paragraph [ref=e222]: courage
                - paragraph [ref=e223]: 1 titre
      - region [ref=e224]:
        - generic [ref=e225]:
          - generic [ref=e227]:
            - generic [ref=e228]: Ils nous lisent
            - heading "Ce que pensent les familles" [level=2] [ref=e229]
          - list [ref=e230]:
            - listitem [ref=e231]:
              - figure "Sophie Maman de deux enfants" [ref=e233]:
                - generic [ref=e234]: «
                - blockquote [ref=e235]: Mes enfants de 5 et 7 ans adorent ces histoires. Les valeurs de courage et de gentillesse sont magnifiquement transmises.
                - generic [ref=e236]:
                  - text: Sophie
                  - generic [ref=e237]: Maman de deux enfants
            - listitem [ref=e238]:
              - figure "Thomas Instituteur en maternelle" [ref=e240]:
                - generic [ref=e241]: «
                - blockquote [ref=e242]: Je l’ai utilisé en classe pour aborder la culture africaine. Les enfants ont été fascinés par l’histoire et les personnages.
                - generic [ref=e243]:
                  - text: Thomas
                  - generic [ref=e244]: Instituteur en maternelle
            - listitem [ref=e245]:
              - figure "Aïcha Grand-mère" [ref=e247]:
                - generic [ref=e248]: «
                - blockquote [ref=e249]: J’en ai offert à mes petits-enfants. Ils réclament l’histoire chaque soir, et j’apprécie particulièrement la manière de raconter.
                - generic [ref=e250]:
                  - text: Aïcha
                  - generic [ref=e251]: Grand-mère
      - generic [ref=e253]:
        - heading "Offrez une histoire qui reste" [level=2] [ref=e254]
        - paragraph [ref=e255]: "Un conte acheté est à vous pour toujours : PDF et EPUB, à relire, à imprimer, à transmettre."
        - generic [ref=e256]:
          - link "Découvrir nos livres" [ref=e257] [cursor=pointer]:
            - /url: /fr/catalogue
          - link "En savoir plus" [ref=e258] [cursor=pointer]:
            - /url: /fr/offres
  - contentinfo [ref=e259]:
    - generic [ref=e260]:
      - generic [ref=e261]:
        - link "EditionMapoukam" [ref=e262] [cursor=pointer]:
          - /url: /fr
        - paragraph [ref=e264]: Des contes du patrimoine africain, illustrés et racontés pour les enfants d'aujourd'hui.
      - group [ref=e265]:
        - paragraph [ref=e266]: Boutique
        - list [ref=e267]:
          - listitem [ref=e268]:
            - link "Tous les contes" [ref=e269] [cursor=pointer]:
              - /url: /fr/catalogue
          - listitem [ref=e270]:
            - link "Nouveautés" [ref=e271] [cursor=pointer]:
              - /url: /fr/catalogue?tri=nouveautes
          - listitem [ref=e272]:
            - link "Gratuit" [ref=e273] [cursor=pointer]:
              - /url: /fr/catalogue?acces=gratuit
          - listitem [ref=e274]:
            - link "Livrets pédagogiques" [ref=e275] [cursor=pointer]:
              - /url: /fr/livrets
      - group [ref=e276]:
        - paragraph [ref=e277]: Offres
        - list [ref=e278]:
          - listitem [ref=e279]:
            - link "Abonnement" [ref=e280] [cursor=pointer]:
              - /url: /fr/offres
          - listitem [ref=e281]:
            - link "Achat à l'unité" [ref=e282] [cursor=pointer]:
              - /url: /fr/offres
          - listitem [ref=e283]:
            - link "Association" [ref=e284] [cursor=pointer]:
              - /url: /fr/association
          - listitem [ref=e285]:
            - link "Expertise & conseil" [ref=e286] [cursor=pointer]:
              - /url: /fr/expertise
      - group [ref=e287]:
        - paragraph [ref=e288]: Nous écrire
        - list [ref=e289]:
          - listitem [ref=e290]:
            - link "À propos du studio" [ref=e291] [cursor=pointer]:
              - /url: /fr/a-propos
          - listitem [ref=e292]:
            - link "Aide et questions" [ref=e293] [cursor=pointer]:
              - /url: /fr/questions-frequentes
          - listitem [ref=e294]:
            - link "Nous écrire" [ref=e295] [cursor=pointer]:
              - /url: /fr/contact
    - generic [ref=e297]:
      - navigation "Liens utiles" [ref=e298]:
        - link "Conditions générales" [ref=e299] [cursor=pointer]:
          - /url: /fr/conditions-generales
        - link "Confidentialité" [ref=e300] [cursor=pointer]:
          - /url: /fr/confidentialite
        - generic [ref=e301]: © 2026 EditionMapoukam
      - group "Langue du site" [ref=e302]:
        - generic [ref=e303]: Français
        - link "English" [ref=e304] [cursor=pointer]:
          - /url: /en
  - button "Open Next.js Dev Tools" [ref=e310] [cursor=pointer]
  - alert [ref=e314]
```

# Test source

```ts
  236 |   test('il est présent, et il n’ouvre pas la fiche', async ({ page }) => {
  237 |     await page.goto('/fr/catalogue');
  238 | 
  239 |     const ajout = page.getByRole('button', { name: /ajouter au panier/i }).first();
  240 |     await expect(ajout).toBeVisible();
  241 | 
  242 |     // ┌────────────────────────────────────────────────────────────────────┐
  243 |     // │ LE PIÈGE DE LA CARTE ENTIÈREMENT CLIQUABLE.                        │
  244 |     // │                                                                    │
  245 |     // │ Le lien du titre s'étire sur toute la carte par un pseudo-élément.  │
  246 |     // │ Si le bouton ne repasse pas au-dessus, chaque clic sur « ajouter »  │
  247 |     // │ ouvre la fiche — un défaut qui ne se voit qu'à l'usage, et jamais   │
  248 |     // │ dans jsdom, qui n'empile rien.                                      │
  249 |     // └────────────────────────────────────────────────────────────────────┘
  250 |     const cadre = (await ajout.boundingBox())!;
  251 |     const dessus = await page.evaluate(
  252 |       ({ x, y }) => {
  253 |         const element = document.elementFromPoint(x, y);
  254 |         return element?.closest('button') !== null;
  255 |       },
  256 |       { x: cadre.x + cadre.width / 2, y: cadre.y + cadre.height / 2 },
  257 |     );
  258 | 
  259 |     expect(dessus, 'le lien étiré recouvre le bouton d’ajout').toBe(true);
  260 |   });
  261 | });
  262 | 
  263 | test.describe('cibles tactiles', () => {
  264 |   test('aucune cible interactive ne descend sous 44 px sur téléphone', async ({ page }, infos) => {
  265 |     test.skip(infos.project.name !== 'telephone', 'critère tactile');
  266 | 
  267 |     await page.goto('/fr/catalogue');
  268 |     await page.waitForLoadState('networkidle');
  269 | 
  270 |     const trop_petites = await page.evaluate(() => {
  271 |       const fautives: string[] = [];
  272 |       for (const el of document.querySelectorAll('a, button')) {
  273 |         // ┌──────────────────────────────────────────────────────────────┐
  274 |         // │ UN LIEN ÉTIRÉ N'A PAS LA TAILLE DE SA BOÎTE.                 │
  275 |         // │                                                              │
  276 |         // │ Le titre d'une carte porte un pseudo-élément qui couvre toute │
  277 |         // │ la carte : sa cible réelle fait trois cents pixels, sa boîte  │
  278 |         // │ vingt. Mesurer la seconde signale un défaut qui n'existe pas. │
  279 |         // │                                                              │
  280 |         // │ `data-etire` est posé par le composant, donc la règle suit le │
  281 |         // │ code au lieu de deviner.                                     │
  282 |         // └──────────────────────────────────────────────────────────────┘
  283 |         if (el.hasAttribute('data-etire')) continue;
  284 | 
  285 |         const r = el.getBoundingClientRect();
  286 |         // Les éléments masqués ou hors flux ne sont pas des cibles.
  287 |         if (r.width === 0 || r.height === 0) continue;
  288 |         if (r.height < 40) fautives.push(`${el.tagName}: ${(el.textContent ?? '').trim().slice(0, 30)}`);
  289 |       }
  290 |       return fautives;
  291 |     });
  292 | 
  293 |     expect(trop_petites, trop_petites.join(' | ')).toHaveLength(0);
  294 |   });
  295 | });
  296 | 
  297 | test.describe('les cartes remplissent leur colonne, et se tiennent à la même hauteur', () => {
  298 |   test('les témoignages de l’accueil', async ({ page }) => {
  299 |     // ┌────────────────────────────────────────────────────────────────────┐
  300 |     // │ DEUX DÉFAUTS QUE SEUL UN MOTEUR DE RENDU POUVAIT MONTRER.          │
  301 |     // │                                                                    │
  302 |     // │ 1. Les cartes sont des `<figure>`, à qui le NAVIGATEUR donne       │
  303 |     // │    `margin: 1em 40px`. Elles mesuraient 292 px dans une colonne de │
  304 |     // │    372, et le texte s'y cassait à trois mots par ligne. Aucune      │
  305 |     // │    feuille du projet ne portait cette valeur : elle venait d'une    │
  306 |     // │    feuille par défaut que personne ne lit.                         │
  307 |     // │                                                                    │
  308 |     // │ 2. `Revele` enveloppe ce qu'il anime : le `height: 100%` de la     │
  309 |     // │    carte se mesurait sur cette enveloppe, de hauteur automatique,  │
  310 |     // │    et les trois cartes gardaient des hauteurs différentes.         │
  311 |     // │                                                                    │
  312 |     // │ Les deux passent inaperçus de jsdom, qui ne calcule aucune boîte.  │
  313 |     // └────────────────────────────────────────────────────────────────────┘
  314 |     await page.goto('/fr');
  315 |     await page.waitForLoadState('networkidle');
  316 | 
  317 |     const mesures = await page.evaluate(() => {
  318 |       const cartes = [...document.querySelectorAll('[class*="avisCarte"]')];
  319 |       return cartes.map((carte) => {
  320 |         const boite = carte.getBoundingClientRect();
  321 |         const case_ = carte.closest('li')?.getBoundingClientRect();
  322 |         return {
  323 |           largeur: Math.round(boite.width),
  324 |           hauteur: Math.round(boite.height),
  325 |           haut: Math.round(boite.top),
  326 |           largeurCase: Math.round(case_?.width ?? 0),
  327 |         };
  328 |       });
  329 |     });
  330 | 
  331 |     // Garde d'effectif : sans elle, une page qui ne rendrait AUCUN
  332 |     // témoignage passerait les deux assertions suivantes sans rien prouver.
  333 |     expect(mesures.length).toBeGreaterThanOrEqual(3);
  334 | 
  335 |     for (const mesure of mesures) {
> 336 |       expect(mesure.largeur, 'la carte remplit sa colonne').toBe(mesure.largeurCase);
      |                                                             ^ Error: la carte remplit sa colonne
  337 |     }
  338 | 
  339 |     /*
  340 |      * ┌────────────────────────────────────────────────────────────────────┐
  341 |      * │ « MÊME HAUTEUR » NE VAUT QUE POUR UNE MÊME RANGÉE.                 │
  342 |      * │                                                                    │
  343 |      * │ Sur téléphone, la grille passe à une colonne : les trois cartes    │
  344 |      * │ s'empilent, et leur imposer une hauteur commune les alignerait sur  │
  345 |      * │ le plus bavard des trois — deux cartes à moitié vides, pour rien.   │
  346 |      * │                                                                    │
  347 |      * │ La première version de ce test l'exigeait quand même, et le profil  │
  348 |      * │ téléphone l'a fait tomber. Le défaut était dans l'assertion, pas    │
  349 |      * │ dans la page : c'est le genre d'erreur qu'on corrige en affaiblissant│
  350 |      * │ le test « pour qu'il passe ». On le formule donc pour ce qu'il veut  │
  351 |      * │ vraiment dire — les cartes qui partagent une rangée partagent une   │
  352 |      * │ hauteur — ce qui reste faux si le défaut revient.                   │
  353 |      * └────────────────────────────────────────────────────────────────────┘
  354 |      */
  355 |     const rangees = new Map<number, number[]>();
  356 |     for (const mesure of mesures) {
  357 |       rangees.set(mesure.haut, [...(rangees.get(mesure.haut) ?? []), mesure.hauteur]);
  358 |     }
  359 | 
  360 |     for (const [haut, hauteurs] of rangees) {
  361 |       const distinctes = new Set(hauteurs);
  362 |       expect(distinctes.size, `rangée ${String(haut)} : ${hauteurs.join(', ')}`).toBe(1);
  363 |     }
  364 |   });
  365 | });
  366 | 
```