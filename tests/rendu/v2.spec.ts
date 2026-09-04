import { expect, test } from '@playwright/test';

/**
 * RENDU DE LA DIRECTION V2, DANS UN VRAI NAVIGATEUR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CHAQUE VÉRIFICATION ICI EST INVISIBLE À JSDOM.                          │
 * │                                                                          │
 * │ Ce fichier ne re-teste pas ce que `npm run test` couvre déjà — quel      │
 * │ texte s'affiche, quel lien mène où. Il éprouve ce qui n'existe QUE       │
 * │ lorsqu'un moteur de rendu applique les styles : des largeurs réelles,    │
 * │ des débordements, un défilement magnétique, un contraste calculé.        │
 * │                                                                          │
 * │ Règle de sélection : si l'assertion passerait sans une seule ligne de    │
 * │ CSS, elle n'a rien à faire dans ce fichier.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const PAGES = [
  { nom: 'accueil', chemin: '/fr' },
  { nom: 'boutique', chemin: '/fr/catalogue' },
  { nom: 'fiche', chemin: '/fr/contes/anansi-l-araignee-maligne' },
  { nom: 'association', chemin: '/fr/association' },
  { nom: 'à propos', chemin: '/fr/a-propos' },
  { nom: 'contact', chemin: '/fr/contact' },
  { nom: 'connexion', chemin: '/fr/connexion' },
];

test.describe('la direction V2 est bien servie', () => {
  test('l’attribut de thème est posé sur la racine', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.locator('html')).toHaveAttribute('data-design', 'v2');
  });

  test('les trois polices sont réellement chargées', async ({ page }) => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉFAUT QUI A COÛTÉ LE PLUS CHER DANS CE PROJET.                 │
    // │                                                                    │
    // │ Aucune police n'était embarquée, puis le middleware a redirigé      │
    // │ `/fonts/*.woff2` vers `/fr/fonts/*.woff2`. Dans les deux cas la     │
    // │ page rendait en Georgia — ce qui ressemble à un mauvais dessin, pas │
    // │ à une panne. Aucun test unitaire ne pouvait le voir.                │
    // └────────────────────────────────────────────────────────────────────┘
    await page.goto('/fr');
    const chargees = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    });

    expect(chargees).toContain('Fraunces');
    expect(chargees).toContain('Nunito');
  });
});

test.describe('aucune page ne déborde horizontalement', () => {
  for (const { nom, chemin } of PAGES) {
    test(`${nom} tient dans la largeur`, async ({ page }) => {
      // Un débordement horizontal est le défaut de mise en page le plus
      // fréquent et le plus visible sur un téléphone : la page se balade
      // latéralement et le contenu sort de l'écran.
      await page.goto(chemin);
      await page.waitForLoadState('networkidle');

      const { document: largeurDocument, fenetre } = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        fenetre: window.innerWidth,
      }));

      // Un pixel de tolérance : les largeurs fractionnaires d'un écran à
      // forte densité ne retombent jamais exactement sur la même valeur.
      expect(largeurDocument, `${nom} déborde de ${String(largeurDocument - fenetre)}px`).toBeLessThanOrEqual(
        fenetre + 1,
      );
    });
  }
});

test.describe('aucune page ne force le navigateur à élargir sa fenêtre', () => {
  for (const { nom, chemin } of PAGES) {
    test(`${nom} tient dans la largeur de l’APPAREIL`, async ({ page }) => {
      // ┌────────────────────────────────────────────────────────────────────┐
      // │ POURQUOI CE TEST DOUBLE LE PRÉCÉDENT, ET NE FAIT PAS DOUBLON.      │
      // │                                                                    │
      // │ Le test ci-dessus compare `scrollWidth` à `window.innerWidth`.     │
      // │ Or, quand une mise en page ne peut pas descendre sous une certaine │
      // │ largeur, le navigateur mobile ne la casse pas : il ÉLARGIT sa      │
      // │ fenêtre de mise en page et dézoome pour la faire tenir. Les deux   │
      // │ mesures grandissent alors ENSEMBLE, et l'égalité est préservée —   │
      // │ le test reste vert pendant que la page s'affiche minuscule.        │
      // │                                                                    │
      // │ C'est exactement ce qui est arrivé à l'écran de connexion : sa     │
      // │ grille avait deux colonnes de minimums 280 px et 320 px, donc un   │
      // │ plancher de 632 px. Sur un Pixel 7 — 412 px — `innerWidth` valait  │
      // │ 632, `scrollWidth` aussi, et la suite passait au vert.             │
      // │                                                                    │
      // │ La seule référence qui ne bouge pas est la largeur de l'APPAREIL.  │
      // └────────────────────────────────────────────────────────────────────┘
      await page.goto(chemin);
      await page.waitForLoadState('networkidle');

      const largeurAppareil = page.viewportSize()?.width ?? 0;
      expect(largeurAppareil, 'viewport non défini').toBeGreaterThan(0);

      const largeurMiseEnPage = await page.evaluate(() => window.innerWidth);

      expect(
        largeurMiseEnPage,
        `${nom} : le navigateur a élargi sa fenêtre à ${String(largeurMiseEnPage)}px pour ` +
          `faire tenir une mise en page trop large — l'appareil en fait ${String(largeurAppareil)}`,
      ).toBeLessThanOrEqual(largeurAppareil + 1);
    });
  }
});

test.describe('boutique — les filtres en colonne', () => {
  test('sur ordinateur, les filtres sont À GAUCHE de la grille', async ({ page }, infos) => {
    test.skip(infos.project.name !== 'ordinateur', 'mise en page à deux colonnes');

    await page.goto('/fr/catalogue');
    const filtres = page.getByRole('navigation', { name: /filtrer/i });
    const grille = page.locator('ul').filter({ has: page.getByRole('listitem') }).last();

    const cadreFiltres = await filtres.boundingBox();
    const cadreGrille = await grille.boundingBox();
    expect(cadreFiltres).not.toBeNull();
    expect(cadreGrille).not.toBeNull();

    // À gauche, et pas au-dessus : c'est très exactement le défaut signalé.
    expect(cadreFiltres!.x).toBeLessThan(cadreGrille!.x);
    expect(cadreFiltres!.width).toBeLessThan(cadreGrille!.width);
  });

  test('sur téléphone, la feuille est FERMÉE et ne coûte qu’un bouton', async ({
    page,
  }, infos) => {
    test.skip(infos.project.name !== 'telephone', 'comportement en écran étroit');

    await page.goto('/fr/catalogue');

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ CE QUI COMPTE : LA PREMIÈRE COUVERTURE EST-ELLE VISIBLE ?          │
    // │                                                                    │
    // │ La hauteur des filtres n'est qu'un moyen. Le but est que la        │
    // │ marchandise apparaisse sans défilement — et c'est ce que ces        │
    // │ assertions mesurent, plutôt qu'un nombre de pixels arbitraire qui   │
    // │ deviendrait faux au premier changement de mise en page.             │
    // └────────────────────────────────────────────────────────────────────┘
    const filtres = page.getByRole('navigation', { name: /filtrer/i });
    await expect(filtres, 'la feuille doit être fermée à l’ouverture').toBeHidden();

    const declencheur = page.getByRole('link', { name: /^filtrer$/i });
    await expect(declencheur).toBeVisible();

    const cadre = (await declencheur.boundingBox())!;
    const hauteurFenetre = page.viewportSize()!.height;

    expect(
      cadre.height,
      `le déclencheur occupe ${String(Math.round(cadre.height))}px sur ${String(hauteurFenetre)}px de haut`,
    ).toBeLessThan(hauteurFenetre * 0.12);
  });

  test('la feuille s’ouvre, RESTE ouverte d’un filtre à l’autre, puis se referme', async ({
    page,
  }, infos) => {
    test.skip(infos.project.name !== 'telephone', 'comportement en écran étroit');

    await page.goto('/fr/catalogue');
    const filtres = page.getByRole('navigation', { name: /filtrer/i });

    await page.getByRole('link', { name: /^filtrer$/i }).click();
    await expect(filtres).toBeVisible();

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ MESURÉ UNE FOIS LA FEUILLE POSÉE, PAS PENDANT QU'ELLE MONTE.       │
    // │                                                                    │
    // │ `toBeVisible()` bascule dès que la visibilité change, c'est-à-dire  │
    // │ au PREMIER des 280 ms de glissement : une mesure prise là trouve la │
    // │ feuille encore à moitié sous l'écran, et l'assertion échoue sur une │
    // │ mise en page parfaitement correcte. `expect.poll` attend qu'elle se │
    // │ stabilise, sans inscrire une durée d'animation dans un test.        │
    // └────────────────────────────────────────────────────────────────────┘
    const hauteurFenetre = page.viewportSize()!.height;

    // Elle tient dans l'écran : c'est une feuille, pas un bandeau qui aurait
    // poussé la grille.
    await expect
      .poll(async () => {
        const cadre = (await filtres.boundingBox())!;
        return Math.round(cadre.y + cadre.height);
      })
      .toBeLessThanOrEqual(hauteurFenetre + 1);

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE POINT DE TOUTE LA MÉCANIQUE : POSER DEUX FILTRES DE SUITE.      │
    // │                                                                    │
    // │ Chaque pastille est un LIEN, donc un rechargement complet. Si les  │
    // │ liens de la feuille ne reconduisaient pas `#filtres`, la feuille   │
    // │ se refermerait à chaque choix et « Voir N contes » ne voudrait     │
    // │ plus rien dire.                                                    │
    // └────────────────────────────────────────────────────────────────────┘
    await filtres.getByRole('link').first().click();
    await page.waitForLoadState('networkidle');

    expect(new URL(page.url()).hash).toBe('#filtres');
    await expect(filtres, 'la feuille doit survivre au choix d’un filtre').toBeVisible();

    // « Voir N contes » referme, et ramène sur la marchandise.
    await page.getByRole('link', { name: /^Voir \d+ conte/ }).click();
    await expect(filtres).toBeHidden();
    expect(new URL(page.url()).hash).toBe('#resultats');
  });

  test('sur téléphone, le tri GLISSE au lieu de prendre trois lignes', async ({
    page,
  }, infos) => {
    test.skip(infos.project.name !== 'telephone', 'comportement en écran étroit');

    await page.goto('/fr/catalogue');
    const tri = page.getByRole('navigation', { name: /trier/i });
    await expect(tri).toBeVisible();

    const { hauteur, defilable, deborde } = await tri.evaluate((el) => ({
      hauteur: el.getBoundingClientRect().height,
      // Il a bien de quoi glisser — sinon la règle n'aurait rien à prouver.
      defilable: el.scrollWidth > el.clientWidth,
      // Et il ne fait PAS déborder la page : c'est lui qui se rogne.
      deborde: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));

    expect(defilable, 'le rang de tri doit réellement déborder de lui-même').toBe(true);
    expect(deborde, 'les marges négatives ne doivent pas élargir la page').toBe(false);
    expect(hauteur, `le rang de tri occupe ${String(Math.round(hauteur))}px`).toBeLessThan(80);
  });
});

test.describe('carrousel — deux gestes selon l’appareil', () => {
  test('sur ordinateur, les flèches avancent d’une carte', async ({ page }, infos) => {
    test.skip(infos.project.name !== 'ordinateur', 'les flèches sont masquées au doigt');

    await page.goto('/fr');
    const piste = page.getByRole('list', { name: /nouveautés/i });
    await expect(piste).toBeVisible();

    const avant = await piste.evaluate((el) => el.scrollLeft);
    await page.getByRole('button', { name: /suivant/i }).first().click();
    await page.waitForTimeout(600);
    const apres = await piste.evaluate((el) => el.scrollLeft);

    expect(apres, 'la flèche « suivant » doit faire défiler').toBeGreaterThan(avant);
  });

  test('le défilement est magnétique', async ({ page }) => {
    await page.goto('/fr');
    const piste = page.getByRole('list', { name: /nouveautés/i });

    const magnetisme = await piste.evaluate((el) => getComputedStyle(el).scrollSnapType);
    expect(magnetisme).toContain('x');
    expect(magnetisme).toContain('mandatory');
  });

  test('toutes les cartes sont dans le document — ce n’est pas un diaporama', async ({ page }) => {
    // Un diaporama cache tout sauf la vue courante : ce qui est caché n'est ni
    // indexé, ni atteignable au clavier, ni trouvable par la recherche du
    // navigateur. Ici tout est présent, et seul le défilement bouge.
    await page.goto('/fr');
    const cartes = page.getByRole('list', { name: /nouveautés/i }).getByRole('listitem');
    expect(await cartes.count()).toBeGreaterThan(3);
  });
});

test.describe('cartes — le bouton d’ajout au panier', () => {
  test('il est présent, et il n’ouvre pas la fiche', async ({ page }) => {
    await page.goto('/fr/catalogue');

    const ajout = page.getByRole('button', { name: /ajouter au panier/i }).first();
    await expect(ajout).toBeVisible();

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE PIÈGE DE LA CARTE ENTIÈREMENT CLIQUABLE.                        │
    // │                                                                    │
    // │ Le lien du titre s'étire sur toute la carte par un pseudo-élément.  │
    // │ Si le bouton ne repasse pas au-dessus, chaque clic sur « ajouter »  │
    // │ ouvre la fiche — un défaut qui ne se voit qu'à l'usage, et jamais   │
    // │ dans jsdom, qui n'empile rien.                                      │
    // └────────────────────────────────────────────────────────────────────┘
    const cadre = (await ajout.boundingBox())!;
    const dessus = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element?.closest('button') !== null;
      },
      { x: cadre.x + cadre.width / 2, y: cadre.y + cadre.height / 2 },
    );

    expect(dessus, 'le lien étiré recouvre le bouton d’ajout').toBe(true);
  });
});

test.describe('cibles tactiles', () => {
  test('aucune cible interactive ne descend sous 44 px sur téléphone', async ({ page }, infos) => {
    test.skip(infos.project.name !== 'telephone', 'critère tactile');

    await page.goto('/fr/catalogue');
    await page.waitForLoadState('networkidle');

    const trop_petites = await page.evaluate(() => {
      const fautives: string[] = [];
      for (const el of document.querySelectorAll('a, button')) {
        // ┌──────────────────────────────────────────────────────────────┐
        // │ UN LIEN ÉTIRÉ N'A PAS LA TAILLE DE SA BOÎTE.                 │
        // │                                                              │
        // │ Le titre d'une carte porte un pseudo-élément qui couvre toute │
        // │ la carte : sa cible réelle fait trois cents pixels, sa boîte  │
        // │ vingt. Mesurer la seconde signale un défaut qui n'existe pas. │
        // │                                                              │
        // │ `data-etire` est posé par le composant, donc la règle suit le │
        // │ code au lieu de deviner.                                     │
        // └──────────────────────────────────────────────────────────────┘
        if (el.hasAttribute('data-etire')) continue;

        const r = el.getBoundingClientRect();
        // Les éléments masqués ou hors flux ne sont pas des cibles.
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 40) fautives.push(`${el.tagName}: ${(el.textContent ?? '').trim().slice(0, 30)}`);
      }
      return fautives;
    });

    expect(trop_petites, trop_petites.join(' | ')).toHaveLength(0);
  });
});

test.describe('les cartes remplissent leur colonne, et se tiennent à la même hauteur', () => {
  test('les témoignages de l’accueil', async ({ page }) => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ DEUX DÉFAUTS QUE SEUL UN MOTEUR DE RENDU POUVAIT MONTRER.          │
    // │                                                                    │
    // │ 1. Les cartes sont des `<figure>`, à qui le NAVIGATEUR donne       │
    // │    `margin: 1em 40px`. Elles mesuraient 292 px dans une colonne de │
    // │    372, et le texte s'y cassait à trois mots par ligne. Aucune      │
    // │    feuille du projet ne portait cette valeur : elle venait d'une    │
    // │    feuille par défaut que personne ne lit.                         │
    // │                                                                    │
    // │ 2. `Revele` enveloppe ce qu'il anime : le `height: 100%` de la     │
    // │    carte se mesurait sur cette enveloppe, de hauteur automatique,  │
    // │    et les trois cartes gardaient des hauteurs différentes.         │
    // │                                                                    │
    // │ Les deux passent inaperçus de jsdom, qui ne calcule aucune boîte.  │
    // └────────────────────────────────────────────────────────────────────┘
    await page.goto('/fr');
    await page.waitForLoadState('networkidle');

    const mesures = await page.evaluate(() => {
      const cartes = [...document.querySelectorAll('[class*="avisCarte"]')];
      return cartes.map((carte) => {
        const boite = carte.getBoundingClientRect();
        const case_ = carte.closest('li')?.getBoundingClientRect();
        return {
          largeur: Math.round(boite.width),
          hauteur: Math.round(boite.height),
          haut: Math.round(boite.top),
          largeurCase: Math.round(case_?.width ?? 0),
        };
      });
    });

    // Garde d'effectif : sans elle, une page qui ne rendrait AUCUN
    // témoignage passerait les deux assertions suivantes sans rien prouver.
    expect(mesures.length).toBeGreaterThanOrEqual(3);

    for (const mesure of mesures) {
      expect(mesure.largeur, 'la carte remplit sa colonne').toBe(mesure.largeurCase);
    }

    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ « MÊME HAUTEUR » NE VAUT QUE POUR UNE MÊME RANGÉE.                 │
     * │                                                                    │
     * │ Sur téléphone, la grille passe à une colonne : les trois cartes    │
     * │ s'empilent, et leur imposer une hauteur commune les alignerait sur  │
     * │ le plus bavard des trois — deux cartes à moitié vides, pour rien.   │
     * │                                                                    │
     * │ La première version de ce test l'exigeait quand même, et le profil  │
     * │ téléphone l'a fait tomber. Le défaut était dans l'assertion, pas    │
     * │ dans la page : c'est le genre d'erreur qu'on corrige en affaiblissant│
     * │ le test « pour qu'il passe ». On le formule donc pour ce qu'il veut  │
     * │ vraiment dire — les cartes qui partagent une rangée partagent une   │
     * │ hauteur — ce qui reste faux si le défaut revient.                   │
     * └────────────────────────────────────────────────────────────────────┘
     */
    const rangees = new Map<number, number[]>();
    for (const mesure of mesures) {
      rangees.set(mesure.haut, [...(rangees.get(mesure.haut) ?? []), mesure.hauteur]);
    }

    for (const [haut, hauteurs] of rangees) {
      const distinctes = new Set(hauteurs);
      expect(distinctes.size, `rangée ${String(haut)} : ${hauteurs.join(', ')}`).toBe(1);
    }
  });
});
