/**
 * RELEVÉ — la maquette et l'application, aux mêmes cotes.
 *
 * Script d'atelier : ni produit, ni porte de validation. Il vit sous
 * `scripts/` pour que `@playwright/test` se résolve.
 *
 *   node scripts/releve-v3.mjs [nom-de-scene…]
 *
 * Sans argument, il joue toutes les scènes. Chaque scène produit deux images
 * dans `.captures/` — `maquette-<nom>.png` et `app-<nom>.png` — et, quand elle
 * déclare des sondes, un tableau d'écarts sur la sortie standard.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SORTIE = resolve('.captures');
mkdirSync(SORTIE, { recursive: true });

const APP = 'http://localhost:3000';
const MAQUETTE_BUREAU = `file:///${resolve('design_handoff_edition_mapoukam/Site EditionMapoukam.dc.html').replace(/\\/g, '/')}`;
const MAQUETTE_MOBILE = `file:///${resolve('design_handoff_edition_mapoukam/Site EditionMapoukam Mobile.dc.html').replace(/\\/g, '/')}`;

const BUREAU = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };

const COMPTE = { email: 'utilisateur@mapoukam.fr', motDePasse: 'User123456!' };
const COMPTE_ADMIN = { email: 'admin@editionmapoukam.test', motDePasse: 'Adm-Mapoukam-2026' };

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PROTOTYPE D'ADMINISTRATION N'EST PAS DANS LE DOSSIER DE PASSATION.   │
 * │                                                                          │
 * │ Les deux prototypes du site public ont été déposés sous                  │
 * │ `design_handoff_edition_mapoukam/` le 5 septembre 2026. Celui de         │
 * │ l'administration est arrivé le 17, et il vit dans le projet Claude       │
 * │ Design — pas sur ce disque.                                             │
 * │                                                                          │
 * │ D'où cette variable : on lui passe une URL servie, valable une heure, et │
 * │ RIEN n'est écrit ici — un jeton de service n'a pas sa place dans un      │
 * │ fichier versionné. Le repli reste le chemin local, pour le jour où le    │
 * │ fichier descendra dans le dossier comme les deux autres.                 │
 * │                                                                          │
 * │   MAQUETTE_ADMIN='<url servie>' node scripts/releve-v3.mjs admin-contes  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const MAQUETTE_ADMIN =
  process.env['MAQUETTE_ADMIN'] ??
  `file:///${resolve('design_handoff_edition_mapoukam/Admin EditionMapoukam v2.dc.html').replace(/\\/g, '/')}`;

/**
 * Ouvre le prototype d'administration sur l'écran voulu.
 *
 * Le prototype démarre sur le tableau de bord ; les autres écrans s'atteignent
 * en cliquant leur entrée de rail, comme le ferait un éditeur.
 */
async function maquetteAdmin(page, entree) {
  await page.goto(MAQUETTE_ADMIN, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  if (entree) {
    await page.getByText(entree, { exact: true }).first().click();
    await page.waitForTimeout(1000);
  }
}

/** Les propriétés relevées sur chaque sonde. */
const PROPRIETES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'color',
  'backgroundColor',
  'borderRadius',
  'padding',
  'gap',
  'borderWidth',
  'borderColor',
  'boxShadow',
  'textTransform',
  /*
   * `stroke` est relevé POUR LES ICÔNES. L'encre d'un tracé SVG ne passe pas
   * par `color` : le prototype la pose en attribut (`stroke="var(--terra)"`),
   * et comparer `color` sur une coche ne comparait que la couleur HÉRITÉE de
   * son panneau — deux valeurs identiques des deux côtés, sur une icône dont
   * la teinte réelle divergeait sans que rien ne le dise.
   *
   * Sur tout ce qui n'est pas un SVG, la propriété vaut `none` de part et
   * d'autre : elle n'ajoute donc aucun bruit.
   */
  'stroke',
];

/**
 * Interroge un élément : boîte + propriétés calculées.
 *
 * Rendu comme une chaîne par propriété pour que la comparaison soit littérale
 * — un écart d'un demi-pixel est un écart.
 */
async function sonder(page, selecteur) {
  return page.evaluate(
    ({ selecteur, proprietes }) => {
      const el = globalThis.document.querySelector(selecteur);
      if (!el) return null;
      const boite = el.getBoundingClientRect();
      const style = globalThis.getComputedStyle(el);
      const releve = {
        x: Math.round(boite.x * 10) / 10,
        y: Math.round(boite.y * 10) / 10,
        w: Math.round(boite.width * 10) / 10,
        h: Math.round(boite.height * 10) / 10,
      };
      for (const p of proprietes) releve[p] = style[p];
      return releve;
    },
    { selecteur, proprietes: PROPRIETES },
  );
}

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS ÉCARTS QUE LE NAVIGATEUR INVENTE, ET QU'IL FAUT NEUTRALISER.      │
 * │                                                                          │
 * │ Sans cette normalisation, chaque sonde rapportait quatre à six écarts    │
 * │ qui ne se voient sur AUCUN écran — et une liste de faux écarts est pire  │
 * │ qu'une absence de relevé : elle noie les vrais, qu'on finit par ne plus  │
 * │ lire. Les trois sont des différences d'ÉCRITURE, jamais de rendu :      │
 * │                                                                          │
 * │  1. `color(srgb …)` contre `rgb(…)`. Le prototype calcule certaines      │
 * │     teintes par `color-mix()`, ce qui fait sortir la notation moderne.   │
 * │     Même couleur, autre écriture — on ramène les deux aux mêmes entiers. │
 * │     Ce qui reste APRÈS conversion est un vrai écart de teinte.           │
 * │                                                                          │
 * │  2. La PILE de repli d'une police. « Caprasimo, system-ui, sans-serif »  │
 * │     contre « Caprasimo, Georgia, serif » : la police rendue est la       │
 * │     même, seule diffère celle qui prendrait le relais si elle manquait.  │
 * │     On compare donc la PREMIÈRE famille, la seule qui se voie.           │
 * │                                                                          │
 * │  3. `borderColor` quand `borderWidth` vaut 0. Le navigateur y recopie    │
 * │     `color` faute de mieux : la comparaison signalait alors DEUX fois    │
 * │     le même écart de couleur de texte, sur une bordure qui n'existe pas. │
 * │                                                                          │
 * │ Rien d'autre n'est neutralisé. En particulier, aucune COTE ne l'est.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function normaliser(cle, valeur) {
  const texte = String(valeur);

  if (cle === 'fontFamily') return texte.split(',')[0].trim().replaceAll('"', '');

  // `color(srgb 0.61 0.35 0.17 / 0.5)` → `rgb(158, 89, 44)` / `rgba(…, 0.5)`.
  return texte.replace(
    /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g,
    (_, r, v, b, a) => {
      const octet = (c) => Math.round(Number(c) * 255);
      const canaux = `${octet(r)}, ${octet(v)}, ${octet(b)}`;
      return a === undefined || Number(a) === 1 ? `rgb(${canaux})` : `rgba(${canaux}, ${a})`;
    },
  );
}

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `relatifA` — MESURER UN ÉCART, ET NON UNE ORDONNÉE.                     │
 * │                                                                          │
 * │ Deux bases ne portent pas les mêmes textes. Sur la fiche, le résumé du   │
 * │ jeu de démonstration tient sur deux lignes là où le prototype en met     │
 * │ une : trente pixels de plus, et TOUT ce qui suit — pastilles, carte      │
 * │ d'achat, preuves — se décale d'autant. Neuf sondes rapportaient alors le │
 * │ même écart, neuf fois, sur une mise en page parfaitement juste.          │
 * │                                                                          │
 * │ Une liste de faux écarts est pire qu'une absence de relevé : on finit    │
 * │ par ne plus la lire, et le vrai écart passe avec les autres.             │
 * │                                                                          │
 * │ `relatifA: 'accroche'` remplace donc `y` par la DISTANCE au bas de la    │
 * │ sonde nommée. C'est la cote que le dessin décide — la marge de 24 px     │
 * │ sous l'accroche — quand l'ordonnée, elle, dépend de la donnée.           │
 * │                                                                          │
 * │ La hauteur d'un bloc reste comparée : seul `y` devient relatif.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function ecartAuBas(sonde, ancre) {
  if (!sonde || !ancre) return null;
  return Math.round((sonde.y - (ancre.y + ancre.h)) * 10) / 10;
}

/*
 * `dansA` — LA MÊME IDÉE, POUR UN ENFANT.
 *
 * `relatifA` mesure l'écart au BAS d'un bloc : c'est la bonne question entre
 * deux frères. Posée sur un enfant, elle rend un nombre négatif qui ne veut
 * rien dire — la distance à un bas qu'on n'a pas encore atteint, et qui dépend
 * de tout ce qui suit dans le parent.
 *
 * Ce que le dessin décide, pour un enfant, c'est son retrait par rapport au
 * HAUT de son parent : le rembourrage d'un panneau, la place d'un titre. C'est
 * cette cote-là que `dansA` compare.
 */
function ecartAuHaut(sonde, ancre) {
  if (!sonde || !ancre) return null;
  return Math.round((sonde.y - ancre.y) * 10) / 10;
}

function comparer(nom, cote, gauche, droite, releves) {
  if (!gauche && !droite) {
    console.log(`   ${nom.padEnd(26)} ABSENT DES DEUX CÔTÉS`);
    return;
  }
  if (!gauche) {
    console.log(`   ${nom.padEnd(26)} ABSENT DE LA MAQUETTE`);
    return;
  }
  if (!droite) {
    console.log(`   ${nom.padEnd(26)} ✗ ABSENT DE L'APPLICATION`);
    return;
  }
  const sansBordure = gauche.borderWidth === '0px' && droite.borderWidth === '0px';
  const ecarts = [];

  if (cote?.dansA) {
    const ancre = releves?.get(cote.dansA);
    const eg = ecartAuHaut(gauche, ancre?.maquette);
    const ed = ecartAuHaut(droite, ancre?.app);
    if (eg === null || ed === null) {
      ecarts.push(`dansA: sonde « ${cote.dansA} » introuvable`);
    } else if (Math.abs(eg - ed) > 0.2) {
      ecarts.push(`retrait dans « ${cote.dansA} » : ${eg}  →  ${ed}`);
    }
  }

  if (cote?.relatifA) {
    const ancre = releves?.get(cote.relatifA);
    const eg = ecartAuBas(gauche, ancre?.maquette);
    const ed = ecartAuBas(droite, ancre?.app);
    if (eg === null || ed === null) {
      ecarts.push(`relatifA: sonde « ${cote.relatifA} » introuvable`);
    } else if (Math.abs(eg - ed) > 0.2) {
      /*
       * 0,2 px de tolérance, et pas un de plus. Un écart RELATIF est la
       * différence de deux cotes déjà arrondies au dixième : quatre arrondis
       * s'y ajoutent, et un dixième de pixel de bruit n'est pas un défaut de
       * dessin. Un demi-pixel, lui, en reste un — c'est le seuil que le reste
       * du relevé applique aux cotes absolues.
       */
      ecarts.push(`écart sous « ${cote.relatifA} » : ${eg}  →  ${ed}`);
    }
  }
  for (const cle of Object.keys(gauche)) {
    if (cote?.ignore?.includes(cle)) continue;
    if (cle === 'y' && (cote?.relatifA || cote?.dansA)) continue;
    if (cle === 'borderColor' && sansBordure) continue;
    const a = normaliser(cle, gauche[cle]);
    const b = normaliser(cle, droite[cle]);
    if (a !== b) ecarts.push(`${cle}: ${gauche[cle]}  →  ${droite[cle]}`);
  }
  if (ecarts.length === 0) {
    console.log(`   ${nom.padEnd(26)} ✓`);
    return;
  }
  console.log(`   ${nom.padEnd(26)} ${ecarts.length} écart(s)`);
  for (const e of ecarts) console.log(`      ${e}`);
}

/* ══ Aides de navigation ══════════════════════════════════════════════════ */

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES SÉLECTEURS SONT PORTÉS PAR LE FORMULAIRE, ET NON PAR LA PAGE.       │
 * │                                                                          │
 * │ Sous Organic, les écrans d'authentification reçoivent le chrome ENTIER — │
 * │ pied de page compris, donc le champ d'infolettre. Il y a dès lors DEUX   │
 * │ `input[name="email"]` dans le document, et remplir « le » champ de       │
 * │ courriel n'est plus une instruction sans ambiguïté.                      │
 * │                                                                          │
 * │ Le symptôme était trompeur : la soumission repartait en                  │
 * │ `?erreur=requete_invalide`, comme si le compte était refusé, alors que   │
 * │ le formulaire partait simplement avec un champ vide.                     │
 * │                                                                          │
 * │ On attend aussi `load` plutôt que `domcontentloaded` : le formulaire est │
 * │ rendu par le serveur, mais son action ne part pas avant l'hydratation.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function connecter(contexte, compte = COMPTE) {
  const page = await contexte.newPage();
  await page.goto(`${APP}/fr/connexion`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const formulaire = page.locator('form').filter({ has: page.locator('input[name="password"]') });
  await formulaire.locator('input[name="email"]').fill(compte.email);
  await formulaire.locator('input[name="password"]').fill(compte.motDePasse);

  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('connexion'), { timeout: 20000 }),
    formulaire.locator('button[type="submit"]').click(),
  ]);
  await page.close();
}

/** Met deux titres payants au panier, par l'API — la session voyage par cookie. */
async function remplirPanier(contexte) {
  const reponse = await contexte.request.get(`${APP}/api/catalog?limite=12`);
  const { entrees } = await reponse.json();
  let poses = 0;
  for (const entree of entrees ?? []) {
    if (poses >= 2) break;
    const r = await contexte.request.post(`${APP}/api/cart`, {
      data: { book_id: entree.id, langue: 'fr' },
    });
    if (r.ok()) poses += 1;
  }
}

/**
 * DÉROULER LA PAGE, PUIS LA LAISSER SE POSER.
 *
 * Deux pannes de mesure, toutes deux payées cash : les images `loading="lazy"`
 * ne réservent leur place qu'une fois demandées, et les blocs `data-reveal`
 * mettent 700 ms à se poser. Un relevé pris avant l'un ou l'autre mesure une
 * page en mouvement — c'est l'origine des écarts « inexplicables » de 18 px.
 */
async function poser(page) {
  await page.evaluate(async () => {
    const pas = 600;
    for (let y = 0; y < globalThis.document.body.scrollHeight; y += pas) {
      globalThis.scrollTo(0, y);
      await new Promise((suite) => globalThis.setTimeout(suite, 90));
    }
    globalThis.scrollTo(0, 0);
  });
  await page.waitForTimeout(3500);
}

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES SONDES DU CHROME D'ADMINISTRATION — les mêmes sur les trois écrans.  │
 * │                                                                          │
 * │ Le prototype porte ses cotes EN CLAIR dans l'attribut `style`. Les       │
 * │ sondes visent donc cet attribut plutôt qu'une classe : le moteur de      │
 * │ rendu du prototype n'en fabrique pas, et viser une position dans l'arbre │
 * │ casserait au premier bloc ajouté.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const SONDES_CHROME_ADMIN = {
  'rail': { maquette: 'div[style*="width: 248px"]', app: '[class*="admin_rail"]' },
  'rail en-tête': {
    maquette: 'div[style*="width: 248px"] > div:first-child',
    app: '[class*="admin_marque"]',
  },
  'sceau': {
    maquette: 'div[style*="width: 36px"][style*="border-radius: 50%"]',
    app: '[class*="admin_logo"]',
    // Le prototype écrit « EM » DANS le disque, faute de disposer du logo ;
    // ici le disque porte le vrai mot-symbole, en masque. Seule la boîte se
    // compare — la typographie d'un texte qui n'existe pas, non.
    ignore: ['fontFamily', 'fontSize', 'lineHeight', 'color'],
  },
  'nom de marque': {
    maquette: 'div[style*="font-size: 16px"][style*="line-height: 1.1"]',
    app: '[class*="admin_marqueNom"]',
    // Le prototype écrit « EditionMapoukam » dans une boîte de 151 px fixée
    // par son frère ; ici le nom prend la largeur restante.
    ignore: ['w'],
  },
  'mention': {
    maquette: 'div[style*="letter-spacing: 0.12em"]',
    app: '[class*="admin_mention"]',
    ignore: ['w'],
  },
  'zone des groupes': {
    maquette: 'div[style*="width: 248px"] > div[style*="flex: 1 1 0%"]',
    app: '[class*="admin_groupes"]',
    // La hauteur dépend du nombre d'entrées rendues, et la nôtre en a onze.
    ignore: ['h'],
  },
  'intertitre de groupe': {
    maquette: 'div[style*="letter-spacing: 0.14em"]',
    app: '[class*="admin_groupeTitre"]',
  },
  'pied du rail': {
    maquette: 'div[style*="width: 248px"] > div:last-child',
    app: '[class*="admin_pied"]',
  },
  'pastille d’identité': {
    maquette: 'div[style*="width: 30px"][style*="border-radius: 50%"]',
    app: '[class*="admin_pastille"]',
  },
  'nom au pied': {
    maquette: 'div[style*="width: 248px"] > div:last-child div[style*="font-size: 13px"]',
    app: '[class*="admin_piedNom"]',
    ignore: ['w'],
  },
  'sortir': {
    maquette: 'div[style*="width: 248px"] > div:last-child a',
    app: '[class*="admin_sortir"]',
    // Un `<a>` dans la maquette, un `<button>` ici — le bouton est requis :
    // une déconnexion change l'état du serveur. La boîte diffère donc.
    ignore: ['x', 'w', 'h', 'backgroundColor'],
  },
  'barre supérieure': {
    maquette: 'div[style*="backdrop-filter: blur(10px)"]',
    app: '[class*="admin_barreSuperieure"]',
  },
  'fil d’Ariane': {
    maquette: 'div[style*="letter-spacing: 0.06em"]',
    app: '[class*="admin_filAriane"]',
    ignore: ['w'],
  },
  'zone de page': {
    maquette: 'div[style*="padding: var(--space-6) var(--space-6) var(--space-8)"]',
    app: '[class*="admin_page"]',
    ignore: ['h'],
  },
  'colonne': {
    maquette: 'div[style*="max-width: 1200px"]',
    app: '[class*="admin_colonne"]',
    ignore: ['h'],
  },
  'titre': { maquette: 'h1', app: '[class*="admin_titre"]', ignore: ['w'] },
};

/* ══ Les scènes ═══════════════════════════════════════════════════════════ */

const SCENES = {
  chrome: {
    largeur: BUREAU,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/catalogue`, { waitUntil: 'load' });
      await p.waitForTimeout(800);
    },
    sondes: {
      'barre utilitaire': {
        maquette: '.site > div:first-child > div',
        app: '[class*="barreUtilitaireInterieur"]',
      },
      'promesse': { maquette: '.site > div:first-child > div > div:first-child', app: '[class*="v3_promesse"]' },
      'point': { maquette: '.site > div:first-child span:first-child', app: '[class*="v3_point"]' },
      'commutateur thème': {
        maquette: '.site > div:first-child button',
        app: '[class*="commutateurTheme"]',
      },
      'groupe langue': {
        maquette: '.site > div:first-child > div > div:last-child > div',
        app: '[class*="v2_langues"][data-abrege]',
      },
      'langue active': {
        maquette: '.site > div:first-child > div > div:last-child > div > button:first-child',
        app: '[class*="v2_langues"][data-abrege] [class*="langueActive"]',
      },
      'en-tête': { maquette: 'header', app: 'header' },
      'en-tête intérieur': { maquette: 'header > div', app: '[class*="enteteInterieur"]' },
      'sceau': { maquette: 'header > div > button:first-child > span:first-child', app: '[class*="marque_sceau"]' },
      'nom de marque': { maquette: 'header > div > button:first-child span span:first-child', app: '[class*="marque_nom"]' },
      'signature': { maquette: 'header > div > button:first-child span span:last-child', app: '[class*="marque_signature"]' },
      'navigation': { maquette: 'header nav', app: '[class*="v2_navigation"]' },
      'bouton loupe': { maquette: 'header button[aria-label="Rechercher"]', app: 'header [aria-label^="Recherch"]' },
      'bouton panier': { maquette: 'header button[aria-label="Panier"]', app: 'header [aria-label*="panier" i]' },
      'pilule connexion': {
        maquette: 'header > div > div:last-child > button:last-child',
        app: '[class*="v2_lienTexte"]',
      },
      'boutique': { maquette: 'header nav .dd button', app: '[class*="rayonsResume"]' },
      'lien Offres': { maquette: 'header nav > button:nth-of-type(1)', app: '[class*="v2_navigation"] > a:nth-of-type(1)' },
      'lien Nous écrire': { maquette: 'header nav > button:nth-of-type(5)', app: '[class*="v2_navigation"] > a:nth-of-type(5)' },
      'pied': { maquette: 'footer', app: 'footer' },
      'pied haut': { maquette: 'footer > div > div:first-child', app: '[class*="piedHaut"]' },
      'pied identité': { maquette: 'footer > div > div:first-child > div:first-child', app: '[class*="piedIdentite"]' },
      'pied baseline': { maquette: 'footer > div > div:first-child > div:first-child > p:first-of-type', app: '[class*="piedBaseline"]' },
      'lettre titre': { maquette: 'footer > div > div:first-child > div:first-child > p:nth-of-type(2)', app: '[class*="lettreTitre"]' },
      'lettre champ': { maquette: 'footer input', app: '[class*="lettreChamp"]' },
      'lettre bouton': { maquette: 'footer input + button', app: '[class*="lettreAction"]' },
      'pied colonne 1': { maquette: 'footer > div > div:first-child > div:nth-child(2)', app: '[class*="piedColonne"]:nth-of-type(1)' },
      'pied barre': { maquette: 'footer > div > div:last-child', app: '[class*="piedBarreInterieur"]' },
    },
  },

  auth: {
    largeur: BUREAU,
    pleinePage: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.getByRole('button', { name: 'Se connecter' }).first().click();
      await p.waitForTimeout(600);
    },
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ CINQ SONDES SONT COMPARÉES SANS LEUR TEXTE NI LEUR RÔLE.          │
     * │                                                                    │
     * │ Le prototype et l'application ne portent pas partout la même       │
     * │ BALISE, et c'est délibéré — les trois arbitrages d'accessibilité   │
     * │ écrits dans `panneau.tsx` et `mot-de-passe.tsx` :                  │
     * │                                                                    │
     * │  · la promesse est un `<p>` chez nous, un `<h2>` dans le prototype;│
     * │  · la bascule est deux `<a>`, non deux `<button>` ;                │
     * │  · les preuves sont une `<ul>`/`<li>`, non des `<span>` ;          │
     * │  · le lien d'oubli est un `<a>`, non un `<button>`.                │
     * │                                                                    │
     * │ Le RELEVÉ, lui, ne compare que des cotes et des styles calculés :  │
     * │ il est donc exactement l'outil qui prouve que ces substitutions    │
     * │ ne coûtent pas un pixel. Rien n'est ignoré ici pour ce motif.      │
     * └────────────────────────────────────────────────────────────────────┘
     */
    sondes: (() => {
      const M = 'main > div:nth-of-type(1)';
      const PANNEAU = `${M} > div:nth-of-type(1)`;
      const COLONNE = `${M} > div:nth-of-type(2)`;
      const CHAMPS = `${COLONNE} > div:nth-of-type(2)`;
      const FORMULAIRE = '[class*="auth_formulaire"]';
      return {
        'cadre': { maquette: M, app: '[class*="auth_cadreAuth"]' },

        /* Le panneau de promesse, à gauche. */
        'panneau': { maquette: PANNEAU, app: '[class*="auth_illustration"]' },
        // Le monogramme « EM » du prototype a cédé la place au logo officiel
        // recadré, sur instruction du propriétaire (REPRISE4 §6) : la boîte
        // est comparée, son contenu ne l'est pas.
        /*
         * Le monogramme « EM » du prototype a cédé la place au logo officiel
         * recadré, sur instruction du propriétaire (REPRISE4 §6) : la BOÎTE
         * est comparée, son contenu ne l'est pas.
         *
         * Les trois propriétés de police sont ignorées pour une autre raison,
         * de STRUCTURE : le prototype pose la police sur le `<span>` du nom,
         * nous la posons sur la rangée elle-même — le nom y est un nœud de
         * texte direct. Le texte rendu est le même, Caprasimo 19 px ; seule
         * diffère la boîte qui porte la déclaration, et sonder la rangée y
         * lit l'héritage du prototype, non son dessin.
         */
        'marque panneau': {
          maquette: `${PANNEAU} > div:nth-of-type(2)`,
          app: '[class*="auth_marqueAuth"]',
          ignore: ['fontFamily', 'fontSize', 'lineHeight'],
        },
        'promesse titre': { maquette: `${PANNEAU} > h2:nth-of-type(1)`, app: '[class*="auth_promesseTitre"]' },
        'promesse texte': { maquette: `${PANNEAU} > p:nth-of-type(1)`, app: '[class*="auth_promesseTexte"]' },
        'preuves': { maquette: `${PANNEAU} > div:nth-of-type(3)`, app: '[class*="auth_preuves__"]' },
        'preuve 1': {
          maquette: `${PANNEAU} > div:nth-of-type(3) > span:nth-of-type(1)`,
          app: '[class*="auth_preuve__"]:nth-of-type(1)',
        },
        /*
         * `color` est ignoré parce qu'il ne PEINT RIEN sur cette icône.
         *
         * Le prototype pose l'encre du tracé en attribut — `stroke="var(--terra)"`
         * — et laisse `color` hériter du panneau, donc la crème. Nous posons
         * `color` sur le SVG et le tracé le suit par `currentColor`. Les deux
         * chemins aboutissent au même trait terre cuite, mais `color` lit
         * l'héritage d'un côté et le dessin de l'autre.
         *
         * `stroke`, lui, EST comparé, et c'est la propriété qui se voit : une
         * dérive de la teinte de la coche y apparaîtrait, des deux côtés.
         */
        'coche preuve': {
          maquette: `${PANNEAU} > div:nth-of-type(3) > span:nth-of-type(1) > svg`,
          app: '[class*="auth_preuveCoche"]',
          ignore: ['color'],
        },

        /* La colonne du formulaire, à droite. */
        'colonne': { maquette: COLONNE, app: '[class*="auth_contenu"]' },
        'bascule': { maquette: `${COLONNE} > div:nth-of-type(1)`, app: '[class*="auth_bascule"]' },
        'onglet actif': {
          maquette: `${COLONNE} > div:nth-of-type(1) > button:nth-of-type(1)`,
          app: '[class*="auth_ongletActif"]',
        },
        'onglet inactif': {
          maquette: `${COLONNE} > div:nth-of-type(1) > button:nth-of-type(2)`,
          app: '[class*="auth_onglet__"]:not([class*="auth_ongletActif"])',
        },
        'titre': { maquette: `${COLONNE} > h1:nth-of-type(1)`, app: `h1[class*="auth_titre"]` },
        'intro': { maquette: `${COLONNE} > p:nth-of-type(1)`, app: '[class*="auth_intro"]' },
        'formulaire': { maquette: CHAMPS, app: FORMULAIRE },

        /* Les champs. */
        'étiquette email': {
          maquette: `${CHAMPS} > label:nth-of-type(1) > span:nth-of-type(1)`,
          app: 'label[for="connexion-email"]',
        },
        'champ email': { maquette: `${CHAMPS} input[type="email"]`, app: 'input[name="email"]' },
        'champ mot de passe': {
          maquette: `${CHAMPS} input[type="password"]`,
          app: 'input[name="password"]',
        },
        /*
         * L'œil ne contient qu'un SVG : ses propriétés de POLICE ne peignent
         * rien. Le prototype laisse au bouton les valeurs propres du
         * navigateur (Arial 13,33 px), nous lui laissons l'héritage de la
         * page — invisible dans les deux cas. La boîte, la teinte et le tracé
         * restent comparés.
         */
        'œil': {
          maquette: `${CHAMPS} button[aria-label="Afficher le mot de passe"]`,
          app: '[class*="auth_oeil"]',
          ignore: ['fontFamily', 'fontSize', 'lineHeight'],
        },

        /* Le bas du formulaire. */
        'rangée options': {
          maquette: `${CHAMPS} > div:nth-of-type(1)`,
          app: '[class*="auth_rangeeOptions"]',
        },
        /*
         * ÉCART ASSUMÉ, LAISSÉ VISIBLE — la teinte du lien.
         *
         * Le prototype rend rgb(158, 89, 44). Ce n'est pas la valeur du
         * dossier : `01-design-tokens.md` fixe `--terra-d: #8c491a` et le
         * qualifie de « contrast-safe », puis décrit sous « Accent override
         * (prototype-only feature) » un accent réglable d'où le prototype
         * DÉRIVE sa teinte par `color-mix(in srgb, <accent> 74%, #2b1608)`.
         * Le dossier conclut : « otherwise hard-code the terracotta pair
         * above ». C'est ce que fait `--action-texte`.
         *
         * L'écart n'est donc pas corrigé, et il n'est pas non plus masqué :
         * l'ignorer rendrait invisible une VRAIE dérive de cette teinte, qui
         * porte aussi les prix et tous les liens d'action du site.
         */
        'lien oubli': {
          maquette: `${CHAMPS} > div:nth-of-type(1) > button:nth-of-type(1)`,
          app: '[class*="auth_lienOubli"]',
        },
        /*
         * ÉCART ASSUMÉ, LAISSÉ VISIBLE — l'encre du bouton.
         *
         * Le prototype écrit `color:#fff` sur la terre cuite #c67139 : 3,4:1,
         * sous les 4,5:1 qu'exige WCAG 1.4.3 pour un texte de 16,5 px non
         * gras. L'encre sombre de `--action-encre` passe à 6,2:1, et c'est le
         * choix que `tokens.css` porte pour tout le site.
         *
         * Laissé visible pour la même raison que le lien d'oubli : c'est une
         * décision, et une décision se relit.
         */
        'bouton envoyer': {
          maquette: `${CHAMPS} > button:nth-of-type(1)`,
          app: `${FORMULAIRE} button[type="submit"]`,
        },
        'note': { maquette: `${CHAMPS} > p:nth-of-type(1)`, app: '[class*="auth_note"]' },
      };
    })(),
    app: async (p) => {
      await p.goto(`${APP}/fr/connexion`, { waitUntil: 'load' });
      // L'œil n'est rendu qu'APRÈS montage (arbitrage de `mot-de-passe.tsx`) :
      // le sonder au rendu serveur le déclarerait absent de l'application.
      await p.waitForTimeout(1200);
    },
  },

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ L'INSCRIPTION — LE SECOND ÉCRAN QUE LE PROTOTYPE DESSINE.           │
   * │                                                                      │
   * │ Le prototype ne change pas de page : il bascule `authMode` sur       │
   * │ `signup`, ce qui ajoute « Nom complet » en tête des champs, remplace  │
   * │ « Rester connecté » par « J'accepte les conditions » et RETIRE le    │
   * │ lien d'oubli. Chez nous ce sont deux ROUTES — c'est l'arbitrage de   │
   * │ `BasculeAuth` — d'où deux scènes plutôt qu'un état.                  │
   * │                                                                      │
   * │ Les champs sont donc décalés d'un rang par rapport à la connexion :  │
   * │ email est le DEUXIÈME label, mot de passe le troisième.              │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  'auth-inscription': {
    largeur: BUREAU,
    pleinePage: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.getByRole('button', { name: 'Se connecter' }).first().click();
      await p.waitForTimeout(600);
      await p.getByRole('button', { name: 'Créer un compte' }).first().click();
      await p.waitForTimeout(600);
    },
    sondes: (() => {
      const M = 'main > div:nth-of-type(1)';
      const PANNEAU = `${M} > div:nth-of-type(1)`;
      const COLONNE = `${M} > div:nth-of-type(2)`;
      const CHAMPS = `${COLONNE} > div:nth-of-type(2)`;
      const FORMULAIRE = '[class*="auth_formulaire"]';
      return {
        'cadre': { maquette: M, app: '[class*="auth_cadreAuth"]' },
        'panneau': { maquette: PANNEAU, app: '[class*="auth_illustration"]' },
        'promesse titre': { maquette: `${PANNEAU} > h2:nth-of-type(1)`, app: '[class*="auth_promesseTitre"]' },
        'colonne': { maquette: COLONNE, app: '[class*="auth_contenu"]' },
        'bascule': { maquette: `${COLONNE} > div:nth-of-type(1)`, app: '[class*="auth_bascule"]' },
        /* L'onglet ACTIF est ici le second — « Créer un compte ». */
        'onglet actif': {
          maquette: `${COLONNE} > div:nth-of-type(1) > button:nth-of-type(2)`,
          app: '[class*="auth_ongletActif"]',
        },
        'onglet inactif': {
          maquette: `${COLONNE} > div:nth-of-type(1) > button:nth-of-type(1)`,
          app: '[class*="auth_onglet__"]:not([class*="auth_ongletActif"])',
        },
        'titre': { maquette: `${COLONNE} > h1:nth-of-type(1)`, app: 'h1[class*="auth_titre"]' },
        'intro': { maquette: `${COLONNE} > p:nth-of-type(1)`, app: '[class*="auth_intro"]' },
        'formulaire': { maquette: CHAMPS, app: FORMULAIRE },
        'étiquette nom': {
          maquette: `${CHAMPS} > label:nth-of-type(1) > span:nth-of-type(1)`,
          app: 'label[for="inscription-nom"]',
        },
        'champ nom': {
          maquette: `${CHAMPS} > label:nth-of-type(1) input`,
          app: 'input[name="nom_complet"]',
        },
        'champ email': { maquette: `${CHAMPS} input[type="email"]`, app: 'input[name="email"]' },
        'champ mot de passe': {
          maquette: `${CHAMPS} input[type="password"]`,
          app: 'input[name="password"]',
        },
        'œil': {
          maquette: `${CHAMPS} button[aria-label="Afficher le mot de passe"]`,
          app: '[class*="auth_oeil"]',
          ignore: ['fontFamily', 'fontSize', 'lineHeight'],
        },
        'rangée options': {
          maquette: `${CHAMPS} > div:nth-of-type(1)`,
          app: '[class*="auth_rangeeOptions"]',
        },
        'case conditions': {
          maquette: `${CHAMPS} > div:nth-of-type(1) > label:nth-of-type(1)`,
          app: '[class*="auth_caseConditions"]',
        },
        'bouton envoyer': {
          maquette: `${CHAMPS} > button:nth-of-type(1)`,
          app: `${FORMULAIRE} button[type="submit"]`,
        },
        'note': { maquette: `${CHAMPS} > p:nth-of-type(1)`, app: '[class*="auth_note"]' },
      };
    })(),
    app: async (p) => {
      await p.goto(`${APP}/fr/inscription`, { waitUntil: 'load' });
      await p.waitForTimeout(1200);
      /*
       * La case des conditions est COCHÉE avant de mesurer.
       *
       * Le bouton d'envoi reste inerte tant qu'elle ne l'est pas — c'est une
       * aide de saisie, pas une garde (voir REPRISE4 §7.3). Sonder sans la
       * cocher relèverait donc l'état DÉSACTIVÉ du bouton, et le comparerait
       * au bouton actif du prototype : deux fonds, deux encres, et un écart
       * qui ne dit rien du dessin.
       */
      await p.locator('input[name="conditions"]').check();
      await p.waitForTimeout(300);
    },
  },

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LES TROIS ÉCRANS QUE LE PROTOTYPE NE DESSINE PAS.                   │
   * │                                                                      │
   * │ « Mot de passe oublié », « Nouveau mot de passe » et la confirmation  │
   * │ d'inscription n'existent nulle part dans le prototype : il fait       │
   * │ basculer un état, il ne parcourt pas un tunnel de récupération.       │
   * │                                                                      │
   * │ Ils ne sont pas pour autant hors du relevé. Ce sont des écrans de la  │
   * │ MÊME FAMILLE — même cadre, même panneau, même colonne, mêmes champs — │
   * │ et c'est précisément ce qu'on peut vérifier : leur ossature est       │
   * │ comparée à celle de la CONNEXION du prototype. Ce qui leur est propre │
   * │ (le nombre de champs, le libellé du bouton) ne l'est pas.             │
   * │                                                                      │
   * │ Sans cette vérification, un écran sur cinq échapperait à la passe —   │
   * │ et ce serait toujours l'un de ceux qu'on n'ouvre qu'en panne.         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  ...(() => {
    const M = 'main > div:nth-of-type(1)';
    const PANNEAU = `${M} > div:nth-of-type(1)`;
    const COLONNE = `${M} > div:nth-of-type(2)`;
    const CHAMPS = `${COLONNE} > div:nth-of-type(2)`;

    /*
     * L'ossature partagée. La HAUTEUR est ignorée sur les quatre boîtes qui
     * enveloppent le contenu : ces écrans portent un ou deux champs là où la
     * connexion en porte deux plus une rangée d'options, et une hauteur qui
     * diffère y est la conséquence normale d'un contenu qui diffère. Tout le
     * reste — abscisse, ordonnée, largeur, teintes, rayons, rembourrages —
     * est comparé sans indulgence.
     */
    const ossature = (formulaire) => ({
      'cadre': { maquette: M, app: '[class*="auth_cadreAuth"]', ignore: ['h'] },
      'panneau': { maquette: PANNEAU, app: '[class*="auth_illustration"]', ignore: ['h'] },
      'promesse titre': { maquette: `${PANNEAU} > h2:nth-of-type(1)`, app: '[class*="auth_promesseTitre"]' },
      'colonne': { maquette: COLONNE, app: '[class*="auth_contenu"]', ignore: ['h'] },
      /*
       * L'ORDONNÉE est ignorée à partir du titre, et pour une raison précise :
       * ces trois écrans n'ont PAS de bascule.
       *
       * Elle n'aurait aucun sens sur eux — on n'y choisit pas entre se
       * connecter et s'inscrire, on y répare un accès. Son absence remonte
       * tout le contenu de la colonne de 80 px exactement (48 de pastille,
       * 32 de marge). Comparer ces ordonnées à celles de la connexion
       * reviendrait à exiger un décalage que rien ne remplirait.
       *
       * Le CADRE, le PANNEAU et la COLONNE, eux, gardent leur ordonnée
       * comparée : c'est l'ossature, et elle ne bouge pas.
       */
      'titre': {
        maquette: `${COLONNE} > h1:nth-of-type(1)`,
        app: 'h1[class*="auth_titre"]',
        ignore: ['y', 'h'],
      },
      'formulaire': { maquette: CHAMPS, app: '[class*="auth_formulaire"]', ignore: ['y', 'h'] },
      'premier champ': {
        maquette: `${CHAMPS} input[type="email"]`,
        app: formulaire.premierChamp,
        ignore: ['y'],
      },
      'bouton envoyer': {
        maquette: `${CHAMPS} > button:nth-of-type(1)`,
        app: '[class*="auth_formulaire"] button[type="submit"]',
        /* L'ordonnée dépend du nombre de champs au-dessus : voir l'encadré. */
        ignore: ['y'],
      },
    });

    /* La maquette est la même pour les trois : l'écran de connexion. */
    const maquette = async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.getByRole('button', { name: 'Se connecter' }).first().click();
      await p.waitForTimeout(600);
    };

    const ecran = (chemin, premierChamp) => ({
      largeur: BUREAU,
      pleinePage: true,
      maquette,
      sondes: ossature({ premierChamp }),
      app: async (p) => {
        await p.goto(`${APP}/fr/${chemin}`, { waitUntil: 'load' });
        await p.waitForTimeout(1200);
      },
    });

    return {
      'auth-oubli': ecran('mot-de-passe-oublie', 'input[name="email"]'),
      'auth-nouveau-mdp': ecran('nouveau-mot-de-passe', 'input[name="password"]'),
      'auth-confirmation': ecran('confirmation', 'input[name="code"]'),
    };
  })(),

  profil: {
    largeur: BUREAU,
    pleinePage: true,
    connecte: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.getByLabel('Mon compte').first().click();
      await p.waitForTimeout(600);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/compte`, { waitUntil: 'load' });
    },
  },

  panier: {
    largeur: BUREAU,
    connecte: true,
    panier: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      // Un titre au panier, depuis la grille des nouveautés de l'accueil.
      const ajout = p.locator('button[aria-label^="Ajouter"]').first();
      if (await ajout.count()) await ajout.click({ force: true });
      await p.waitForTimeout(400);
      await p.getByLabel('Panier').first().click();
      await p.waitForTimeout(700);
    },
    sondes: {
      /*
       * ┌──────────────────────────────────────────────────────────────────┐
       * │ QUATRE ÉCARTS DE NOTATION, QUI NE PEIGNENT RIEN.                │
       * │                                                                  │
       * │ `gap` — le prototype ne le déclare pas et calcule `normal` ; nous │
       * │ écrivons `0`. Sur une boîte flexible les deux VALENT zéro. Le    │
       * │ `0` est ici délibéré et commenté dans la feuille : à deux enfants │
       * │ l'écart ne se voit pas, à trois — la pastille de compte de la V2  │
       * │ — il se voyait, et il grandissait l'en-tête.                      │
       * │                                                                  │
       * │ Les LARGEURS du titre et du total opposent une boîte de CONTENU   │
       * │ (le `<span>` du prototype) à une boîte de BLOC (notre `<h2>`, et  │
       * │ notre montant aligné à droite). Le texte commence et finit au     │
       * │ même pixel — vérifiable : ni `x` du titre ni la position de la    │
       * │ croix ne bougent.                                                │
       * │                                                                  │
       * │ La POLICE de la croix, enfin : le prototype y pose un SVG dans un │
       * │ bouton resté en Arial ; nous y posons un glyphe. La boîte, elle,  │
       * │ concorde — c'est elle qu'on vise.                                 │
       * └──────────────────────────────────────────────────────────────────┘
       */
      'tiroir': { maquette: '.drawer', app: '[class*="tiroir-panier_tiroir"]' },
      'entête tiroir': {
        maquette: '.drawer > div:first-child',
        app: '[class*="tiroir-panier_entete"]',
        ignore: ['gap'],
      },
      'titre tiroir': {
        maquette: '.drawer > div:first-child > span',
        app: '[class*="tiroir-panier_titre"]',
        ignore: ['w'],
      },
      'fermer': {
        maquette: '.drawer button[aria-label="Fermer"]',
        app: '[class*="tiroir-panier_fermer"]',
        ignore: ['fontFamily', 'fontSize', 'lineHeight'],
      },
      'corps': { maquette: '.drawer > div:nth-child(2)', app: '[class*="tiroir-panier_corps"]' },
      'ligne': { maquette: '.drawer > div:nth-child(2) > div', app: '[class*="tiroir-panier_ligne__"]' },
      'vignette': { maquette: '.drawer img', app: '[class*="tiroir-panier_vignette"]' },
      'titre ligne': { maquette: '.drawer > div:nth-child(2) > div p:nth-of-type(1)', app: '[class*="tiroir-panier_ligneTitre"]' },
      'méta ligne': { maquette: '.drawer > div:nth-child(2) > div p:nth-of-type(2)', app: '[class*="tiroir-panier_ligneMeta"]' },
      'prix ligne': { maquette: '.drawer > div:nth-child(2) > div p:nth-of-type(3)', app: '[class*="tiroir-panier_lignePrix"]' },
      'pied tiroir': { maquette: '.drawer > div:last-child', app: '[class*="tiroir-panier_pied"]' },
      'total': {
        maquette: '.drawer > div:last-child > div > span:last-child',
        app: '[class*="totalFinalMontant"]',
        ignore: ['x', 'w'],
      },
      'mention': {
        maquette: '.drawer > div:last-child > p',
        app: '[class*="tiroir-panier_mention"]',
        ignore: ['gap'],
      },
      /*
       * ÉCART ASSUMÉ, LAISSÉ VISIBLE — l'encre du bouton de paiement, pour la
       * même raison que celle du bouton d'authentification : le blanc du
       * prototype sur la terre cuite ne vaut que 3,4:1.
       */
      'payer': {
        maquette: '.drawer > div:last-child > button',
        app: '[class*="tiroir-panier_payer"]',
        ignore: ['gap'],
      },
    },
    app: async (p) => {
      await p.goto(`${APP}/fr`, { waitUntil: 'load' });
      await p.waitForTimeout(2500);
      await p.getByRole('button', { name: /panier/i }).first().click();
      await p.waitForTimeout(3500);
    },
  },

  recherche: {
    largeur: BUREAU,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.getByLabel('Rechercher').first().click();
      await p.waitForTimeout(600);
    },
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ LA SUPERPOSITION SE SONDE À VIDE, DES DEUX CÔTÉS.                 │
     * │                                                                    │
     * │ Le prototype montre quatre titres tant qu'on n'a rien tapé, et     │
     * │ nous aussi : c'est l'état comparable. Sonder après une frappe      │
     * │ comparerait deux jeux de données — le sien, figé dans le fichier,  │
     * │ et le nôtre, qui vient de la base.                                 │
     * │                                                                    │
     * │ Le VOILE n'est pas sondé : le prototype n'en dessine pas. Il ferme │
     * │ au clic, ce que son état en mémoire ne réclame pas — c'est un      │
     * │ ajout, écrit dans `recherche-globale.module.css`.                  │
     * └────────────────────────────────────────────────────────────────────┘
     */
    sondes: {
      'superposition': { maquette: '.overlay', app: '[class*="recherche-globale_superposition"]' },
      'intérieur': { maquette: '.overlay > div', app: '[class*="recherche-globale_interieur"]' },
      'rangée de saisie': {
        maquette: '.overlay > div > div:nth-of-type(1)',
        app: '[class*="recherche-globale_rangee"]',
      },
      /*
       * `color` est ignoré : il ne PEINT rien ici. Le prototype pose l'encre
       * du tracé en attribut (`stroke="var(--terra)"`) et laisse `color`
       * hériter ; nous posons `color` et le tracé le suit par `currentColor`.
       * `stroke`, lui, est comparé — et il concorde.
       */
      'loupe': {
        maquette: '.overlay > div > div:nth-of-type(1) > svg',
        app: '[class*="recherche-globale_loupe"]',
        ignore: ['color'],
      },
      /*
       * `borderRadius` est ignoré parce que les deux champs ne sont pas dans
       * le même ÉTAT : le nôtre reçoit le focus à l'ouverture, celui du
       * prototype ne l'a pas. Les 4 px relevés sont ceux de l'anneau de focus
       * global (`input:focus-visible`), que le prototype ne dessine nulle
       * part — et qu'on ne retirera pas : un indicateur de focus visible est
       * exigé par WCAG 2.4.7. La cote au repos, elle, vaut bien 0.
       */
      'champ': {
        maquette: '.overlay input',
        app: '[class*="recherche-globale_champ"]',
        ignore: ['borderRadius'],
      },
      'pastille Échap': {
        maquette: '.overlay > div > div:nth-of-type(1) > button',
        app: '[class*="recherche-globale_echap"]',
      },
      'suggestions': {
        maquette: '.overlay > div > div:nth-of-type(2)',
        app: '[class*="recherche-globale_suggestions__"]',
      },
      'libellé suggestions': {
        maquette: '.overlay > div > div:nth-of-type(2) > span',
        app: '[class*="recherche-globale_suggestionsLibelle"]',
      },
      /*
       * La LARGEUR d'une pastille est celle de son mot. Le prototype affiche
       * « ruse », nous « animaux » — nos suggestions viennent des facettes
       * réelles du catalogue, pas de son jeu figé. Le rembourrage, le rayon,
       * la bordure et la taille de texte sont comparés ; la largeur ne peut
       * pas l'être.
       */
      'pastille': {
        maquette: '.overlay > div > div:nth-of-type(2) > button:nth-of-type(1)',
        app: '[class*="recherche-globale_pastille"]',
        ignore: ['w'],
      },
      'grille de résultats': {
        maquette: '.overlay > div > div:nth-of-type(3)',
        app: '[class*="recherche-globale_resultats"]',
      },
      /*
       * ┌──────────────────────────────────────────────────────────────────┐
       * │ LE PROTOTYPE REND SES RÉSULTATS EN ARIAL, ET C'EST UN OUBLI.    │
       * │                                                                  │
       * │ Sa carte de résultat est un `<button>` sans `font: inherit` : le │
       * │ navigateur lui donne donc sa police propre, Arial 13,33 px. Le   │
       * │ TITRE s'en tire — il redéclare Caprasimo — mais la ligne de méta │
       * │ ne pose que sa taille, et sort en Arial sur une page qui n'est   │
       * │ qu'en Figtree et Caprasimo.                                      │
       * │                                                                  │
       * │ Nous rendons une ancre, qui hérite de Figtree. C'est un écart    │
       * │ ASSUMÉ au prototype, et la seule lecture défendable : reproduire │
       * │ l'oubli mettrait une police système au milieu de la charte.      │
       * │                                                                  │
       * │ Sur la carte et sur l'image, la police ne peint rien — elle est  │
       * │ ignorée. Sur la MÉTA elle se voit : `fontFamily` y reste donc    │
       * │ visible, et seules ses conséquences de hauteur sont ignorées.    │
       * │                                                                  │
       * │ Les LARGEURS de texte suivent le titre affiché — le prototype    │
       * │ montre son jeu figé, nous le catalogue réel.                     │
       * └──────────────────────────────────────────────────────────────────┘
       */
      'résultat': {
        maquette: '.overlay > div > div:nth-of-type(3) > button:nth-of-type(1)',
        app: '[class*="recherche-globale_resultat__"]',
        ignore: ['fontFamily', 'fontSize', 'lineHeight'],
      },
      'couverture': {
        maquette: '.overlay > div > div:nth-of-type(3) > button:nth-of-type(1) > img',
        app: '[class*="recherche-globale_couverture"]',
        ignore: ['fontFamily', 'fontSize', 'lineHeight'],
      },
      'titre de résultat': {
        maquette: '.overlay > div > div:nth-of-type(3) > button:nth-of-type(1) span span:nth-of-type(1)',
        app: '[class*="recherche-globale_resultatTitre"]',
        /*
         * `y` suit la hauteur du bloc de texte, que la police décide : la
         * carte centre ses enfants, et notre méta en Figtree est six pixels
         * plus haute que son Arial. Le bloc entier remonte donc de trois
         * pixels. C'est la conséquence arithmétique de l'écart ci-dessus,
         * pas un second écart.
         */
        ignore: ['w', 'y'],
      },
      'méta de résultat': {
        maquette: '.overlay > div > div:nth-of-type(3) > button:nth-of-type(1) span span:nth-of-type(2)',
        app: '[class*="recherche-globale_resultatMeta"]',
        /* `fontFamily` reste VISIBLE : c'est la décision. Le reste en découle. */
        ignore: ['w', 'h', 'y', 'lineHeight'],
      },
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/catalogue`, { waitUntil: 'load' });
      await p.waitForTimeout(2000);
      await p.getByLabel(/recherch/i).first().click();
      // Les facettes ET les quatre titres arrivent par requête.
      await p.waitForTimeout(1800);
    },
  },

  'menu-mobile': {
    largeur: MOBILE,
    maquette: async (p) => {
      await p.goto(MAQUETTE_MOBILE, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      const menu = p.getByLabel(/menu/i).first();
      if (await menu.count()) await menu.click();
      await p.waitForTimeout(700);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr`, { waitUntil: 'load' });
      const menu = p.getByLabel(/menu/i).first();
      if (await menu.count()) await menu.click();
      await p.waitForTimeout(700);
    },
  },

  'auth-mobile': {
    largeur: MOBILE,
    pleinePage: true,
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ LE PROTOTYPE MOBILE DÉMARRE CONNECTÉ — IL FAUT S'EN DÉCONNECTER.   │
     * │                                                                    │
     * │ Son état initial porte `signedIn: true`, et « Mon compte » mène    │
     * │ donc au PROFIL, pas à l'authentification : l'écran d'auth n'est    │
     * │ rendu que sur `page === 'auth'` ou `profil && !signedIn`.          │
     * │                                                                    │
     * │ La version précédente de cette scène cliquait `getByLabel(/compte/)│
     * │ sous un `if (await compte.count())` — un libellé qui ne            │
     * │ correspondait à rien, une condition qui avalait l'échec, et une    │
     * │ capture de la page d'ACCUEIL présentée comme celle de l'auth.      │
     * │ C'est le défaut que ce relevé est censé attraper ; il ne pouvait   │
     * │ pas s'attraper lui-même.                                            │
     * │                                                                    │
     * │ Le chemin réel : menu → « Mon compte » → onglet « Informations » → │
     * │ « Se déconnecter » → menu → « Mon compte ». Les clics ne sont plus │
     * │ gardés : si l'un d'eux ne trouve rien, la scène DOIT échouer.      │
     * └────────────────────────────────────────────────────────────────────┘
     */
    maquette: async (p) => {
      await p.goto(MAQUETTE_MOBILE, { waitUntil: 'load' });
      await p.waitForTimeout(900);

      const ouvrirMenu = async () => {
        await p.getByLabel(/menu/i).first().click();
        await p.waitForTimeout(600);
      };

      await ouvrirMenu();
      await p.getByRole('button', { name: 'Mon compte' }).first().click();
      await p.waitForTimeout(600);
      // « Se déconnecter » vit sous l'onglet « Informations » du profil mobile.
      await p.getByRole('button', { name: 'Informations' }).first().click();
      await p.waitForTimeout(500);
      await p.getByRole('button', { name: /déconnecter/i }).first().click();
      await p.waitForTimeout(700);

      await ouvrirMenu();
      await p.getByRole('button', { name: 'Mon compte' }).first().click();
      await p.waitForTimeout(700);
    },
    /*
     * L'auth mobile n'est PAS l'auth de bureau rétrécie — le prototype la
     * redessine : le panneau devient une carte sombre posée au-dessus du
     * formulaire, les trois preuves disparaissent au profit d'un sur-titre,
     * les champs passent sur `--card` et non `--fond-doux`, et l'œil cesse
     * d'être posé sur le champ pour devenir une case de 44 px dans une
     * rangée. Les sondes qui n'ont pas d'équivalent sont donc informatives :
     * « ABSENT DE L'APPLICATION » est ici un RÉSULTAT, pas une panne.
     */
    sondes: {
      'carte promesse': { maquette: 'main > div:nth-of-type(1)', app: '[class*="auth_illustration"]' },
      'sur-titre': {
        maquette: 'main > div:nth-of-type(1) > p:nth-of-type(1)',
        app: '[class*="auth_promesseSurTitre"]',
      },
      'promesse titre': {
        maquette: 'main > div:nth-of-type(1) > p:nth-of-type(2)',
        app: '[class*="auth_promesseTitre"]',
      },
      'promesse texte': {
        maquette: 'main > div:nth-of-type(1) > p:nth-of-type(3)',
        app: '[class*="auth_promesseTexte"]',
      },
      'bascule': { maquette: 'main > div:nth-of-type(2)', app: '[class*="auth_bascule"]' },
      /*
       * `lineHeight` est ignoré sur les deux onglets mobiles, et la HAUTEUR
       * ne l'est pas — c'est elle qui compte, et elle concorde.
       *
       * Le prototype laisse au bouton son `normal` et loge le texte dans un
       * `<span>` intérieur qui porte les 22 px ; nous les posons sur le
       * bouton, faute d'un span à styler. Deux chemins, une même pastille de
       * 48 px : la propriété diffère, le dessin non.
       */
      'onglet actif': {
        maquette: 'main > div:nth-of-type(2) > button:nth-of-type(1)',
        app: '[class*="auth_ongletActif"]',
        ignore: ['lineHeight'],
      },
      'onglet inactif': {
        maquette: 'main > div:nth-of-type(2) > button:nth-of-type(2)',
        app: '[class*="auth_onglet__"]:not([class*="auth_ongletActif"])',
        ignore: ['lineHeight'],
      },
      'titre': { maquette: 'main > h1:nth-of-type(1)', app: 'h1[class*="auth_titre"]' },
      'intro': { maquette: 'main > p:nth-of-type(1)', app: '[class*="auth_intro"]' },
      'formulaire': { maquette: 'main > div:nth-of-type(3)', app: '[class*="auth_formulaire"]' },
      'étiquette email': {
        maquette: 'main > div:nth-of-type(3) > label:nth-of-type(1) > span:nth-of-type(1)',
        app: 'label[for="connexion-email"]',
      },
      'champ email': { maquette: 'main input[type="email"]', app: 'input[name="email"]' },
      'champ mot de passe': {
        maquette: 'main input[type="password"]',
        app: 'input[name="password"]',
      },
      /* Voir la scène `auth` : un bouton qui ne contient qu'un SVG. */
      'œil': {
        maquette: 'main button[aria-label="Afficher le mot de passe"]',
        app: '[class*="auth_oeil"]',
        ignore: ['fontFamily', 'fontSize', 'lineHeight'],
      },
      'rangée options': {
        maquette: 'main > div:nth-of-type(3) > div:nth-of-type(1)',
        app: '[class*="auth_rangeeOptions"]',
      },
      'lien oubli': {
        maquette: 'main > div:nth-of-type(3) > div:nth-of-type(1) > button:nth-of-type(1)',
        app: '[class*="auth_lienOubli"]',
      },
      'bouton envoyer': {
        maquette: 'main > div:nth-of-type(3) > button:nth-of-type(1)',
        app: '[class*="auth_formulaire"] button[type="submit"]',
      },
      'note': { maquette: 'main > div:nth-of-type(3) > p:nth-of-type(1)', app: '[class*="auth_note"]' },
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/connexion`, { waitUntil: 'load' });
      // L'œil n'est rendu qu'après montage — voir la scène `auth`.
      await p.waitForTimeout(1200);
    },
  },

  /*
   * ── LE RAYON DES LIVRETS ───────────────────────────────────────────────
   *
   * Prototype, lignes 1090 à 1190. Trois blocs y sont propres à cet écran et
   * n'existent nulle part ailleurs : les TROIS cartes de compte, le panneau
   * du kit offert, et la carte de livret COUCHÉE.
   *
   * Deux sondes manquent volontairement :
   *
   *  · le bouton d'ajout d'une carte de livret. Le seul livret publié est
   *    OFFERT, donc `disponible_achat = false`, donc le bouton n'est pas
   *    rendu — c'est la règle du dépôt, pas un défaut : on ne propose pas
   *    d'acheter ce qu'on donne. Le prototype, lui, dessine le bouton sur
   *    toutes ses cartes parce que ses données sont fictives ;
   *  · la pastille de niveau du panneau mis en avant, qui n'existe que dans
   *    la carte de la grille.
   */
  /*
   * ── LE CATALOGUE, POUR LA SEULE BANNIÈRE ───────────────────────────────
   *
   * Prototype, lignes 385 à 400. Cette scène existe surtout comme GARDE : la
   * bannière est partagée par `/catalogue`, `/contes` et `/livrets`, et le
   * rayon des livrets en modifie cinq cotes par attribut. Sans un relevé du
   * cas par défaut, une correction faite pour les livrets se serait payée
   * ailleurs sans que rien ne le dise.
   *
   * Le corps de l'écran n'est pas sondé ici : la barre de filtres de
   * l'application ne porte pas les mêmes contrôles que celle du prototype —
   * voir la note de la scène `livrets`.
   */
  catalogue: {
    largeur: BUREAU,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.locator('header nav .dd button').first().hover();
      await p.waitForTimeout(400);
      // Le menu « Boutique » du prototype : « Tous les contes » mène au rayon.
      await p.getByRole('button', { name: /tous les contes/i }).first().click();
      await p.waitForTimeout(900);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/contes`, { waitUntil: 'load' });
      await p.waitForTimeout(800);
    },
    sondes: (() => {
      const BANDEAU = 'main > section:nth-of-type(1) > div';
      const STATS = `${BANDEAU} > div:nth-of-type(2)`;
      return {
        'bandeau': { maquette: 'main > section:nth-of-type(1)', app: '[class*="boutique_banniere"]' },
        'fil d’Ariane': { maquette: `${BANDEAU} > div:nth-of-type(1) > div`, app: '[class*="filAriane"]' },
        'titre': { maquette: `${BANDEAU} h1`, app: '[class*="banniereTitre"]' },
        'intro': { maquette: `${BANDEAU} > div:nth-of-type(1) > p`, app: '[class*="banniereTexte"]' },
        'cartes de compte': { maquette: STATS, app: '[class*="banniereComptes"]' },
        'compte 1': { maquette: `${STATS} > div:nth-of-type(1)`, app: '[class*="compteCarte"]:nth-of-type(1)' },
        'valeur compte 1': {
          maquette: `${STATS} > div:nth-of-type(1) > span:nth-of-type(1)`,
          app: '[class*="compteCarte"]:nth-of-type(1) [class*="compteValeur"]',
        },
      };
    })(),
  },

  livrets: {
    largeur: BUREAU,
    pleinePage: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      /*
       * Le prototype est une application d'une seule page : on y NAVIGUE, on
       * n'y charge pas une URL. Le rayon se trouve derrière le menu
       * « Boutique » de l'en-tête.
       */
      await p.locator('header nav .dd button').first().hover();
      await p.waitForTimeout(400);
      await p.getByRole('button', { name: /livrets/i }).first().click();
      await p.waitForTimeout(900);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/livrets`, { waitUntil: 'load' });
      /*
       * ┌──────────────────────────────────────────────────────────────────┐
       * │ IL FAUT DÉFILER AVANT DE MESURER — SANS QUOI ON MESURE           │
       * │ L'ANIMATION.                                                     │
       * │                                                                  │
       * │ Les cartes entrent par `Revele`, qui les pose à                  │
       * │ `translateY(18px)` tant que l'observateur ne les a pas vues.     │
       * │ Photographiées en pleine page, elles sont bien à leur place ;    │
       * │ SONDÉES sans défilement, elles rapportent dix-huit pixels de     │
       * │ trop — un écart parfaitement réel, et parfaitement invisible à   │
       * │ l'écran, qui n'existe que dans le relevé.                        │
       * │                                                                  │
       * │ On descend donc la page, on remonte, et on laisse la transition  │
       * │ finir. C'est ce que fait un lecteur, et c'est l'état qu'il faut  │
       * │ comparer.                                                        │
       * └──────────────────────────────────────────────────────────────────┘
       */
      await p.evaluate(() => globalThis.scrollTo(0, globalThis.document.body.scrollHeight));
      await p.waitForTimeout(900);
      await p.evaluate(() => globalThis.scrollTo(0, 0));
      await p.waitForTimeout(900);
    },
    sondes: (() => {
      const BANDEAU = 'main > section:nth-of-type(1) > div';
      const STATS = `${BANDEAU} > div:nth-of-type(2) > div:nth-of-type(2)`;
      const PANNEAU = 'main > section:nth-of-type(2) > article';
      const CORPS = `${PANNEAU} > div`;
      const CARTE = 'main > section:nth-of-type(4) article:nth-of-type(1)';
      const CARTE_CORPS = `${CARTE} > div:nth-of-type(2)`;
      return {
        /* ── La bannière et ses trois cartes de compte ──────────────── */
        /*
         * La bannière est sondée sur sa BOÎTE PLEINE LARGEUR, des deux côtés.
         *
         * Le prototype imbrique une section pleine largeur et un `div` borné à
         * 1240 px ; l'application fusionne les deux et absorbe le centrage dans
         * son rembourrage (voir l'encadré de `.banniere` dans
         * `boutique.module.css`). Sonder le `div` intérieur du prototype contre
         * la colonne de texte de l'application comparait donc deux boîtes qui
         * n'ont jamais eu la même définition — 1240 contre 655, et cinq écarts
         * qui ne disaient rien. Les boîtes extérieures, elles, sont bien la
         * même chose : le bandeau crème d'un bord à l'autre.
         */
        'bandeau': { maquette: 'main > section:nth-of-type(1)', app: '[class*="boutique_banniere"]' },
        'titre du rayon': { maquette: `${BANDEAU} h1`, app: '[class*="banniereTitre"]' },
        'intro': { maquette: `${BANDEAU} p`, app: '[class*="banniereTexte"]' },
        'cartes de compte': { maquette: STATS, app: '[class*="banniereComptes"]' },
        'compte 1': { maquette: `${STATS} > div:nth-of-type(1)`, app: '[class*="compteCarte"]:nth-of-type(1)' },
        'compte 3': { maquette: `${STATS} > div:nth-of-type(3)`, app: '[class*="compteCarte"]:nth-of-type(3)' },
        'valeur compte 3': {
          maquette: `${STATS} > div:nth-of-type(3) > span:nth-of-type(1)`,
          app: '[class*="compteCarte"]:nth-of-type(3) [class*="compteValeur"]',
        },

        /* ── Le panneau du kit offert ───────────────────────────────── */
        'panneau': { maquette: PANNEAU, app: '[class*="livret_panneau"]' },
        /*
         * Le cadre de couverture est un `<button>` dans le prototype et un
         * `<div>` chez nous — la carte entière est déjà cliquable par le lien
         * étiré du titre, et un bouton imbriqué dans une zone cliquable
         * annonce deux fois la même action. Un `<button>` hérite des styles
         * de formulaire du navigateur : Arial 13,3 px, interligne `normal`,
         * encre noire. Aucun de ces quatre réglages ne se voit — le cadre ne
         * porte pas de texte — mais tous les quatre se relèvent.
         */
        'visuel': {
          maquette: `${PANNEAU} > button`,
          app: '[class*="livret_visuel"]',
          ignore: ['fontFamily', 'fontSize', 'lineHeight', 'color'],
        },
        /*
         * Même cause pour la pastille, qui hérite d'Arial de son `<button>`
         * parent : les 5 px de largeur et le pixel et demi de hauteur qui
         * restent sont l'écart entre les métriques d'Arial et de Figtree, pas
         * un écart de mise en page. La COULEUR, elle, n'est pas ignorée : le
         * blanc du prototype sur la sauge est un vrai départ, mesuré à
         * 3,73:1, et il doit continuer de se voir dans le relevé.
         */
        'pastille': {
          maquette: `${PANNEAU} > button > span`,
          app: '[class*="livret_pastille"]',
          ignore: ['fontFamily', 'w', 'h'],
        },
        'corps du panneau': { maquette: CORPS, app: '[class*="livret_corps"]' },
        'niveau du panneau': { maquette: `${CORPS} > span`, app: '[class*="livret_niveau"]' },
        'titre du panneau': { maquette: `${CORPS} > h2`, app: '[class*="livret_titre__"]' },
        'résumé du panneau': { maquette: `${CORPS} > p:nth-of-type(1)`, app: '[class*="livret_resume"]' },
        'objectif 1': { maquette: `${CORPS} > p:nth-of-type(2)`, app: '[class*="livret_objectif__"]' },
        'coche': { maquette: `${CORPS} > p:nth-of-type(2) > svg`, app: '[class*="livret_coche"]' },
        'actions du panneau': { maquette: `${CORPS} > div`, app: '[class*="livret_actions"]' },
        'action principale': {
          maquette: `${CORPS} > div > button:nth-of-type(1)`,
          app: '[class*="livret_actionPrincipale"]',
        },
        'action secondaire': {
          maquette: `${CORPS} > div > button:nth-of-type(2)`,
          app: '[class*="livret_actionSecondaire"]',
        },

        /* ── La grille et sa carte couchée ──────────────────────────── */
        'grille': {
          maquette: 'main > section:nth-of-type(4) > div:nth-of-type(1)',
          app: '[class*="boutique_grille"]',
        },
        'carte': { maquette: CARTE, app: '[class*="v2_carteLivret"]' },
        'cadre de couverture': {
          maquette: `${CARTE} > div:nth-of-type(1)`,
          app: '[class*="v2_carteLivret"] [class*="cadreCouverture"]',
        },
        'pastille de niveau': {
          maquette: `${CARTE} > div:nth-of-type(1) > span:last-child`,
          app: '[class*="niveauLivret"]',
        },
        'corps de carte': { maquette: CARTE_CORPS, app: '[class*="corpsLivret"]' },
        'thème de carte': { maquette: `${CARTE_CORPS} > p:nth-of-type(1)`, app: '[class*="v2_carteLivret"] [class*="v2_origine"]' },
        'titre de carte': { maquette: `${CARTE_CORPS} > h3`, app: '[class*="v2_carteLivret"] [class*="carteTitre"]' },
        'résumé de carte': { maquette: `${CARTE_CORPS} > p:nth-of-type(2)`, app: '[class*="resumeLivret"]' },
        'pied de carte': { maquette: `${CARTE_CORPS} > div`, app: '[class*="piedLivret__"]' },
      };
    })(),
  },

  /*
   * ── LA FICHE D'UN CONTE ────────────────────────────────────────────────
   *
   * Prototype, lignes 500 à 600. Le prototype dessine DEUX fiches — celle
   * d'un conte et celle d'un livret — et elles ne se ressemblent pas : la
   * première met la couverture debout, penchée de deux degrés sur un halo
   * sauge, et range son contenu sous trois onglets ; la seconde couche la
   * planche, y ajoute une bande de vignettes, et déplie tout à plat.
   */
  fiche: {
    largeur: BUREAU,
    pleinePage: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.locator('header nav .dd button').first().hover();
      await p.waitForTimeout(400);
      await p.getByRole('button', { name: /tous les contes/i }).first().click();
      await p.waitForTimeout(800);
      // La première carte de la grille ouvre la fiche.
      await p.locator('.bookcard').first().click();
      await p.waitForTimeout(900);
    },
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ LE MÊME TITRE DES DEUX CÔTÉS — « L'OISEAU DE FEU ».                │
     * │                                                                    │
     * │ La scène visait `petit-baobab`, qui est GRATUIT et non achetable :  │
     * │ sa carte d'achat n'a ni prix ni bouton, et la sonde du prix         │
     * │ rapportait « absent de l'application » sur un écran parfaitement    │
     * │ sain. On mesurait une page qui n'avait pas ce qu'on venait voir.    │
     * │                                                                    │
     * │ Le prototype ouvre « L'oiseau de feu », que le jeu de démonstration │
     * │ porte aussi, payant et achetable. Prendre le même titre rend        │
     * │ comparables les cotes que le CONTENU décide — la hauteur d'un       │
     * │ titre, la largeur d'une pastille d'âge — et non plus seulement      │
     * │ celles que la feuille de style décide.                              │
     * └────────────────────────────────────────────────────────────────────┘
     */
    app: async (p) => {
      await p.goto(`${APP}/fr/contes/l-oiseau-de-feu`, { waitUntil: 'load' });
      await p.waitForTimeout(900);
    },
    sondes: (() => {
      const SECTION = 'main > section:nth-of-type(1)';
      const HAUT = `${SECTION} > div:nth-of-type(2)`;
      const G = `${HAUT} > div:nth-of-type(1)`;
      const D = `${HAUT} > div:nth-of-type(2)`;
      const PASTILLES = `${D} > div:nth-child(4)`;
      const ACHAT = `${D} > div:nth-child(5)`;
      const PRIX = `${ACHAT} > div:nth-child(1)`;
      const ACTIONS = `${ACHAT} > div:nth-child(2)`;
      const PREUVES = `${ACHAT} > div:nth-child(3)`;
      const ONGLETS = 'main > section:nth-of-type(2)';
      const EXTRAIT = `${ONGLETS} > div:nth-child(2)`;

      /*
       * ┌──────────────────────────────────────────────────────────────────┐
       * │ TROIS FAMILLES D'ÉCARTS SONT ATTENDUES, ET AUCUNE N'EST UN DÉFAUT│
       * │                                                                  │
       * │ 1. LA GOUTTIÈRE. Le prototype borne son contenu par un bloc de   │
       * │    1240 px à 28 px de rembourrage ; nous posons le rembourrage   │
       * │    sur le bandeau lui-même. Les deux rendent un contenu de       │
       * │    1184 px à x = 128 — mais la BOÎTE mesurée n'est pas la même.  │
       * │    C'est la formule de toute la passe, déjà écrite pour          │
       * │    l'association et le rayon.                                    │
       * │                                                                  │
       * │ 2. `fontWeight: 400 → 700`. Le dépôt demande partout             │
       * │    `--graisse-forte` et `tokens.css` coupe la synthèse en un     │
       * │    seul point. La valeur calculée diffère, le dessin non :       │
       * │    Caprasimo n'existe qu'au poids 400.                           │
       * │                                                                  │
       * │ 3. LE CONTENU. Deux bases, deux textes : un résumé plus long     │
       * │    fait deux lignes au lieu d'une. Ce n'est pas une cote de      │
       * │    dessin, et l'ignorer évite de « corriger » une hauteur que    │
       * │    seule la donnée décide.                                       │
       * └──────────────────────────────────────────────────────────────────┘
       */
      const GOUTTIERE = ['x', 'w', 'padding'];
      const SYNTHESE = ['fontWeight'];

      return {
        /* ── Le bandeau et son fil ──────────────────────────────────────── */

        /*
         * Le fil d'Ariane du prototype est un bandeau à part, le nôtre vit
         * dans la bannière : c'est la même ligne à la même hauteur, et ce
         * sont ses cotes VERTICALES qu'on compare.
         */
        'fil d’Ariane': {
          maquette: `${SECTION} > div:nth-of-type(1)`,
          app: '[class*="filAriane"]',
          ignore: GOUTTIERE,
        },

        /* ── La grille et la colonne visuelle ───────────────────────────── */

        /*
         * La GRILLE se compare, elle : c'est elle qui porte les deux pistes
         * et l'écart de 60 px. Le prototype la pose sur le bloc de 1240 px à
         * rembourrage, d'où la gouttière ignorée — les PISTES, elles, sont
         * mesurées par les deux colonnes ci-dessous.
         */
        /*
         * `y` est ignoré ici pour la même raison que `x` : la boîte du
         * prototype INCLUT les 34 px de rembourrage haut que nous portons sur
         * le bandeau. Ce sont les deux colonnes ci-dessous qui disent si le
         * contenu tombe au bon endroit — et elles le disent au pixel.
         */
        'grille': { maquette: HAUT, app: '[class*="boutique_fiche__"]', ignore: [...GOUTTIERE, 'y', 'h'] },
        'colonne couverture': { maquette: G, app: '[class*="ficheVisuel"]' },
        'couverture': { maquette: `${G} > img`, app: '[class*="ficheCouverture"]' },
        'pastille feuilleter': { maquette: `${G} > button`, app: '[class*="boutique_feuilleter"]' },

        /* ── La colonne de texte ────────────────────────────────────────── */

        'colonne texte': { maquette: D, app: '[class*="boutique_fiche__"] > div:nth-child(2)', ignore: ['h'] },

        /*
         * Le sur-titre porte « thème · origine » dans le prototype et la
         * seule ORIGINE chez nous — décision écrite dans `fiche.tsx` : le
         * thème est déjà le maillon courant du fil d'Ariane, deux lignes plus
         * haut. Sa largeur est donc décidée par ce choix, pas par le dessin.
         *
         * La COULEUR est l'autre écart attendu : le prototype écrit `--sage`
         * (#7a8a5e), qui vaut 2,94:1 sur la crème — sous le seuil AA du §5.3
         * pour un texte de 11,5 px. `--second-encre` (#56633f) monte à 5,02:1.
         * C'est la même décision de palette que sur l'écran de l'association.
         */
        'sur-titre': { maquette: `${D} > span:nth-child(1)`, app: '[class*="ficheOrigine"]', ignore: [...SYNTHESE, 'w', 'color'] },
        /*
         * La puce n'a pas de texte : `color` et `fontWeight` n'y sont que
         * l'héritage du sur-titre, dont l'écart de teinte est déjà expliqué
         * plus haut. Son APLAT, lui, est comparé — c'est le seul dessin
         * qu'elle porte, et il suit la même décision de palette.
         */
        'puce du sur-titre': {
          maquette: `${D} > span:nth-child(1) > span:nth-child(1)`,
          app: '[class*="fichePuce"]',
          ignore: [...SYNTHESE, 'color', 'backgroundColor'],
        },
        'titre': { maquette: `${D} > h1`, app: 'main h1', ignore: SYNTHESE },
        'accroche': { maquette: `${D} > p:nth-child(3)`, app: '[class*="ficheResume"]', ignore: ['h'] },

        /* ── Les pastilles de caractéristiques ──────────────────────────── */

        /*
         * À partir d'ici, les ordonnées sont RELATIVES — voir l'encadré de
         * `relatifA`. Le résumé du jeu de démonstration tient sur deux lignes
         * là où celui du prototype en tient une : trente pixels que la donnée
         * décide, et qui n'ont rien à dire du dessin.
         */
        'pastilles': {
          maquette: PASTILLES,
          app: '[class*="boutique_reponses"]',
          relatifA: 'accroche',
          ignore: ['w', 'h'],
        },
        'pastille 1': {
          maquette: `${PASTILLES} > div:nth-child(1)`,
          app: '[class*="boutique_reponse__"]:nth-child(1)',
          relatifA: 'accroche',
          ignore: ['w'],
        },
        'pastille 1 intitulé': {
          maquette: `${PASTILLES} > div:nth-child(1) > span:nth-child(1)`,
          app: '[class*="boutique_reponse__"]:nth-child(1) [class*="reponseIntitule"]',
          relatifA: 'pastille 1',
          ignore: [...SYNTHESE, 'w'],
        },
        'pastille 1 valeur': {
          maquette: `${PASTILLES} > div:nth-child(1) > span:nth-child(2)`,
          app: '[class*="boutique_reponse__"]:nth-child(1) [class*="reponseValeur"]',
          relatifA: 'pastille 1 intitulé',
          ignore: [...SYNTHESE, 'w'],
        },

        /* ── La carte d'achat ───────────────────────────────────────────── */

        'carte d’achat': { maquette: ACHAT, app: '[class*="boutique_achat__"]', relatifA: 'pastilles' },
        'ligne du prix': { maquette: PRIX, app: '[class*="achatPrix"]', relatifA: 'pastilles' },
        /*
         * La teinte du prix est `--action-texte`, qui vaut `#8c491a` sous
         * Organic là où le prototype écrit `--terra-d`, `#9e592c`. C'est la
         * terre cuite ASSOMBRIE du dépôt, celle qui est faite pour être lue
         * sur un fond clair, et elle est posée partout — un prix plus clair
         * que le reste des accents en texte ferait une seconde terre cuite.
         */
        'prix': { maquette: `${PRIX} > span:nth-child(1)`, app: '[class*="prixMontant"]', relatifA: 'pastilles', ignore: [...SYNTHESE, 'w', 'color'] },
        'mention du prix': {
          maquette: `${PRIX} > span:nth-child(2)`,
          app: '[class*="prixMention"]',
          relatifA: 'pastilles',
          ignore: ['x', 'w'],
        },
        'rangée des boutons': { maquette: ACTIONS, app: '[class*="achatActions"]', relatifA: 'ligne du prix' },
        'bouton principal': {
          maquette: `${ACTIONS} > button:nth-child(1)`,
          app: '[class*="achatActions"] button',
          relatifA: 'ligne du prix',
          /*
           * `color` — LE BLANC DU PROTOTYPE NE PASSE PAS LE SEUIL.
           *
           * `tokens.css` le dit et le mesure : blanc sur `#c67139` vaut
           * 3,61:1, sous le 4,5:1 du §5.3 ; l'encre du dépôt y vaut 4,60:1.
           * C'est une décision de palette prise pour tout le produit, et
           * éprouvée par `design-tokens.test.ts`.
           *
           * `w` dépend du bouton d'à côté : le principal prend la place qui
           * reste, et « Lire l'extrait » n'a pas la longueur de « Lire en
           * ligne ». C'est le contenu qui décide, pas la feuille de style.
           *
           * `lineHeight` est ÉCRIT différemment pour que la HAUTEUR soit la
           * même : 22 px déclarés chez nous, `normal` dans le prototype, et
           * 58 px rendus des deux côtés. Un nœud de texte nu perd le montant
           * de ligne de son conteneur dès qu'une icône partage sa rangée —
           * voir l'encadré de `boutique.module.css`. C'est la seule propriété
           * du relevé qu'on fait diverger EXPRÈS, et c'est pour faire
           * converger la cote qu'elle décide.
           */
          ignore: [...SYNTHESE, 'w', 'color', 'lineHeight'],
        },
        'bouton second': {
          maquette: `${ACTIONS} > button:nth-child(2)`,
          app: '[class*="achatActions"] > a',
          relatifA: 'ligne du prix',
          ignore: [...SYNTHESE, 'x', 'w'],
        },

        /* ── Les trois preuves ──────────────────────────────────────────── */

        'preuves': { maquette: PREUVES, app: '[class*="boutique_confiance__"]', relatifA: 'rangée des boutons' },
        'preuve 1': {
          maquette: `${PREUVES} > span:nth-child(1)`,
          app: '[class*="confianceLigne"]:nth-child(1)',
          relatifA: 'preuves',
        },
        /*
         * `stroke` est la SEULE propriété qui dise la couleur d'une coche —
         * `color` n'y est que l'héritage de la ligne. C'est précisément ce
         * qu'on vient vérifier ici, et c'est pourquoi elle n'est pas ignorée.
         */
        'coche de preuve': {
          maquette: `${PREUVES} > span:nth-child(1) > svg`,
          app: '[class*="confianceCoche"]',
          relatifA: 'preuves',
          ignore: [...SYNTHESE, 'color', 'lineHeight'],
        },

        /* ── Le bas de fiche : les trois onglets ────────────────────────── */

        /*
         * La colonne de gauche est la plus haute des deux, des deux côtés :
         * c'est donc elle qui fixe le bas du bandeau, et la section des
         * onglets tombe au même endroit malgré des textes différents.
         */
        'section des onglets': { maquette: ONGLETS, app: '[class*="boutique_onglets__"]', ignore: [...GOUTTIERE, 'h'] },
        'barre des onglets': { maquette: `${ONGLETS} > div:nth-child(1)`, app: '[class*="ongletsBarre"]' },
        'onglet actif': {
          maquette: `${ONGLETS} > div:nth-child(1) > button:nth-child(1)`,
          app: '[class*="boutique_onglet__"]:nth-child(1)',
          ignore: [...SYNTHESE, 'w'],
        },
        'onglet inactif': {
          maquette: `${ONGLETS} > div:nth-child(1) > button:nth-child(2)`,
          app: '[class*="boutique_onglet__"]:nth-child(2)',
          ignore: [...SYNTHESE, 'x', 'w'],
        },

        /* ── Le panneau « Extrait » ─────────────────────────────────────── */

        'panneau extrait': { maquette: EXTRAIT, app: '[class*="boutique_extrait__"]', ignore: ['h'] },
        'colonne de texte': {
          maquette: `${EXTRAIT} > div:nth-child(1)`,
          app: '[class*="extraitTexte"]',
          ignore: ['h'],
        },
        'premier paragraphe': {
          maquette: `${EXTRAIT} > div:nth-child(1) > p:nth-child(1)`,
          app: '[class*="extraitPremier"]',
          ignore: ['h'],
        },
        'lettrine': {
          maquette: `${EXTRAIT} > div:nth-child(1) > p:nth-child(1) > span:nth-child(1)`,
          app: '[class*="boutique_lettrine"]',
          ignore: [...SYNTHESE, 'w', 'color'],
        },
        /*
         * Le SECOND paragraphe n'est pas sondé : le prototype en fabrique
         * toujours deux, la description saisie par l'éditeur en compte autant
         * qu'il en a écrit. Une sonde qui rapporte « absent » sur un titre à
         * un seul paragraphe ne mesure pas le dessin, elle mesure la donnée.
         * `.extraitSuite` partage tout avec `.extraitPremier` sauf le corps et
         * la teinte, tous deux écrits dans la feuille.
         */
      };
    })(),
  },

  /*
   * ── LA FICHE D'UN LIVRET ───────────────────────────────────────────────
   *
   * Prototype, lignes 1192 à 1275. Le prototype y arrive par le rayon des
   * livrets ; l'application par le slug du seul livret à quatre planches,
   * celui dont la fiche a quelque chose à montrer.
   */
  'fiche-livret': {
    largeur: BUREAU,
    pleinePage: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.locator('header nav .dd button').first().hover();
      await p.waitForTimeout(400);
      await p.getByRole('button', { name: /livrets pédagogiques/i }).first().click();
      await p.waitForTimeout(800);
      await p.locator('main section:last-of-type article').first().click();
      await p.waitForTimeout(900);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/contes/je-trace-et-j-ecris-les-bases-graphiques`, {
        waitUntil: 'load',
      });
      await p.waitForTimeout(900);
    },
    sondes: (() => {
      const SECTION = 'main > section:nth-of-type(1)';
      const HAUT = `${SECTION} > div:nth-of-type(2)`;
      const G = `${HAUT} > div:nth-of-type(1)`;
      const D = `${HAUT} > div:nth-of-type(2)`;
      const ACHAT = `${D} > div:nth-of-type(1)`;
      const PANNEAUX = 'main > section:nth-of-type(2)';

      /* Mêmes trois familles d'écarts attendus que sur la fiche d'un conte. */
      const GOUTTIERE = ['x', 'w', 'padding'];
      const SYNTHESE = ['fontWeight'];

      return {
        /*
         * Sur la fiche d'un LIVRET, le prototype met le rembourrage du haut
         * sur le bloc qui contient le fil ; nous le mettons sur le bandeau.
         * Les deux boîtes n'ont donc ni la même origine ni la même hauteur —
         * la LIGNE, elle, tombe au même endroit, et c'est ce que dit la
         * grille juste en dessous.
         */
        'fil d’Ariane': {
          maquette: `${SECTION} > div:nth-of-type(1)`,
          app: '[class*="filAriane"]',
          ignore: [...GOUTTIERE, 'y', 'h'],
        },
        'grille': { maquette: HAUT, app: '[class*="boutique_fiche__"]', ignore: [...GOUTTIERE, 'y', 'h'] },

        /* ── La colonne des planches ────────────────────────────────────── */

        'colonne planches': { maquette: G, app: '[class*="boutique_fiche__"] > div:nth-child(1)', ignore: ['h'] },
        'planche': { maquette: `${G} > img`, app: '[class*="boutique_planche__"]' },
        'bande de vignettes': { maquette: `${G} > div:nth-child(2)`, app: '[class*="boutique_vignettes"]' },
        /*
         * Les quatre propriétés de texte sont ignorées parce que ce bouton
         * n'affiche PAS de texte. Le prototype en fait un bouton vide, qui
         * garde donc l'Arial 13,33 px du navigateur ; le nôtre porte un
         * libellé lu et non vu — « Voir l'aperçu 2 » — sans quoi la bande
         * n'annonce que « bouton, bouton, bouton ». Il hérite pour cela la
         * police de la page. Aucun pixel visible ne change.
         */
        'vignette active': {
          maquette: `${G} > div:nth-child(2) > button:nth-child(1)`,
          app: '[class*="boutique_vignette__"]:nth-child(1)',
          ignore: ['fontFamily', 'fontSize', 'lineHeight', 'color'],
        },
        'légende': { maquette: `${G} > p`, app: '[class*="plancheLegende"]', ignore: ['h'] },

        /* ── La colonne de droite ───────────────────────────────────────── */

        'colonne texte': { maquette: D, app: '[class*="boutique_fiche__"] > div:nth-child(2)', ignore: ['h'] },
        'sur-titre': {
          maquette: `${D} > span:nth-child(1)`,
          app: '[class*="ficheOrigine"]',
          ignore: [...SYNTHESE, 'w', 'color'],
        },
        'titre': { maquette: `${D} > h1`, app: 'main h1', ignore: [...SYNTHESE, 'h'] },
        'accroche': { maquette: `${D} > p:nth-child(3)`, app: '[class*="ficheResume"]', ignore: ['h'] },

        'carte d’achat': { maquette: ACHAT, app: '[class*="boutique_achat__"]', ignore: ['y', 'h'] },
        /*
         * ┌─────────────────────────────────────────────────────────────┐
         * │ NI PRIX NI « AJOUTER AU PANIER » : LES QUATRE LIVRETS DU JEU DE│
         * │ DÉMONSTRATION SONT GRATUITS.                                   │
         * │                                                                │
         * │ `gratuit = true`, `disponible_achat = false` sur les quatre.    │
         * │ La carte d'achat n'a donc ni montant ni bouton de panier, et    │
         * │ c'est le rendu JUSTE de cette donnée — pas un défaut de dessin. │
         * │ Sonder un prix ici rapporterait « absent » à chaque exécution,  │
         * │ sur un écran parfaitement sain.                                │
         * │                                                                │
         * │ Les deux sondes reviendront le jour où le catalogue portera un  │
         * │ livret payant. Le dessin du prix est déjà éprouvé sur la fiche  │
         * │ d'un conte, à quelques cotes près écrites dans la feuille.      │
         * └─────────────────────────────────────────────────────────────┘
         */
        'bouton principal': {
          maquette: `${ACHAT} > button:nth-child(3)`,
          app: '[class*="achatActions"] [data-achat="principal"]',
          /*
           * PAS d'ancrage : sur un livret gratuit, la carte n'a ni prix ni
           * note, et le bouton remonte donc de la hauteur de ce bloc absent.
           * Sa PLACE dépend de la donnée ; sa BOÎTE, elle, est du dessin, et
           * c'est elle qu'on compare.
           */
          /*
           * `color` : le blanc du prototype vaut 3,61:1 sur la terre cuite,
           * sous le seuil du §5.3 ; l'encre du dépôt y vaut 4,60:1. Décision
           * de palette, éprouvée par `design-tokens.test.ts`.
           */
          ignore: [...SYNTHESE, 'y', 'color'],
        },
        /*
         * ┌────────────────────────────────────────────────────────────────┐
         * │ PAS DE SECOND BOUTON SUR UN LIVRET GRATUIT — ET C'EST VOULU.   │
         * │                                                                │
         * │ Le prototype en dessine deux parce que son livret est payant :  │
         * │ « Ajouter au panier », puis « Feuilleter ». Les quatre livrets  │
         * │ du jeu de démonstration sont offerts : le premier bouton dit    │
         * │ déjà « Lire en ligne », et le second menait au MÊME écran en    │
         * │ promettant moins — « Lire l'extrait ».                          │
         * │                                                                │
         * │ La carte n'en porte donc qu'un. Le dessin du bouton de contour  │
         * │ est éprouvé sur la fiche d'un conte, où les deux coexistent.    │
         * └────────────────────────────────────────────────────────────────┘
         */
        /*
         * L'ordonnée du pied de carte suit le nombre de boutons au-dessus —
         * un chez nous, deux dans le prototype. Ce que le dessin décide,
         * c'est sa MARGE et son filet, et ils sont comparés.
         */
        'caractéristiques': {
          maquette: `${ACHAT} > div:last-child`,
          app: '[class*="livretSpecs"]',
          ignore: ['y', 'h'],
        },

        /* ── Les panneaux du bas ────────────────────────────────────────── */

        /*
         * L'ordonnée des panneaux dépend de la hauteur du bloc du haut, que le
         * CONTENU décide : notre accroche et nos caractéristiques n'ont pas la
         * longueur de celles du prototype. Ce sont les écarts INTERNES qui
         * disent le dessin, d'où le chaînage qui suit.
         */
        'panneaux': { maquette: PANNEAUX, app: '[class*="boutique_panneaux"]', ignore: [...GOUTTIERE, 'y', 'h'] },
        'panneau 1': {
          maquette: `${PANNEAUX} > div:nth-child(1)`,
          app: '[class*="boutique_panneau__"]',
          dansA: 'panneaux',
          ignore: ['x', 'w', 'h'],
        },
        'titre de panneau': {
          maquette: `${PANNEAUX} > div:nth-child(1) > p:nth-child(1)`,
          app: '[class*="boutique_panneau__"] [class*="panneauTitre"]',
          dansA: 'panneau 1',
          ignore: [...SYNTHESE, 'x', 'w'],
        },
        'ligne de panneau': {
          maquette: `${PANNEAUX} > div:nth-child(1) > p:nth-child(2)`,
          app: '[class*="boutique_panneau__"] [class*="panneauLigne"]',
          relatifA: 'titre de panneau',
          ignore: ['x', 'w', 'h'],
        },
      };
    })(),
  },

  'profil-mobile': {
    largeur: MOBILE,
    pleinePage: true,
    connecte: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_MOBILE, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      const compte = p.getByLabel(/compte/i).first();
      if (await compte.count()) await compte.click();
      await p.waitForTimeout(700);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/compte`, { waitUntil: 'load' });
    },
  },
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ASSOCIATION — soixante sondes, et trois précautions payées cash.     │
   * │                                                                      │
   * │ 1. dérouler TOUTE la page avant de mesurer : les images `lazy` ne     │
   * │    réservent leur place qu'une fois demandées ;                       │
   * │ 2. attendre après le déroulement — les blocs `data-reveal` mettent    │
   * │    700 ms à se poser, et un relevé pris trop tôt mesure une page en   │
   * │    mouvement. C'est l'origine des écarts « inexplicables » de 18 px ; │
   * │ 3. remonter en haut, sans quoi les `y` des deux côtés ne se           │
   * │    comparent plus.                                                    │
   * │                                                                      │
   * │ Quatre écarts sont ATTENDUS et ne sont pas des défauts : les quatre   │
   * │ conteneurs de section mesurent 1440 avec 128 px de rembourrage là où  │
   * │ la maquette mesure 1240 avec 28 px et 100 px de marge. C'est la       │
   * │ formule de gouttière de toute la passe — le contenu, lui, tombe au    │
   * │ même pixel. Le cinquième est la HAUTEUR du bloc des contenus : la     │
   * │ maquette en dessine trois, la base en a huit.                         │
   * │                                                                      │
   * │ Deux familles d'écarts de COULEUR sont attendues elles aussi, et      │
   * │ elles ne sont pas propres à cet écran :                               │
   * │                                                                      │
   * │ • `fontWeight: 400 → 700` sur chaque titre. Le dépôt demande partout  │
   * │   `--graisse-forte`, et `tokens.css` coupe la SYNTHÈSE en un seul     │
   * │   point (`font-synthesis-weight: none`). La valeur calculée diffère,  │
   * │   le dessin non — Caprasimo n'existe qu'au poids 400 ;                │
   * │ • le blanc de la maquette contre les jetons du dépôt : l'encre d'un   │
   * │   aplat terre cuite est `--action-encre`, celle d'un aplat sauge      │
   * │   `--second-contre`, et le sur-titre sur l'olive `--accent-sur-       │
   * │   chrome`. Trois décisions de palette, prises pour le contraste et    │
   * │   éprouvées par `design-tokens.test.ts`.                              │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  association: {
    largeur: BUREAU,
    pleinePage: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.getByText('Association', { exact: true }).first().click();
      await p.waitForTimeout(900);
      await poser(p);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/association`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      await poser(p);
    },
    sondes: {
      'héros section': { maquette: 'main > section:nth-of-type(1)', app: '[class*="association-v3_hero"]' },
      'héros intérieur': { maquette: 'main > section:nth-of-type(1) > .pagehead', app: '[class*="heroInterieur"]' },
      'héros disque': { maquette: 'main > section:nth-of-type(1) > div:first-child', app: '[class*="heroCercle"]' },
      'oeil': { maquette: '.pagehead > div:first-child > span:first-child', app: '[class*="association-v3_oeil__"]' },
      'h1': { maquette: '.pagehead h1', app: '[class*="association-v3_titre__"]' },
      'chapeau': { maquette: '.pagehead > div:first-child > p:nth-of-type(1)', app: '[class*="association-v3_chapeau__"]' },
      'chapeau second': { maquette: '.pagehead > div:first-child > p:nth-of-type(2)', app: '[class*="chapeauSecond"]' },
      'boutons': { maquette: '.pagehead > div:first-child > div:last-child', app: '[class*="heroActions"]' },
      'bouton adhésion': { maquette: '.pagehead > div:first-child > div:last-child > button:nth-of-type(1)', app: '[class*="boutonPrincipal"]' },
      'bouton récits': { maquette: '.pagehead > div:first-child > div:last-child > button:nth-of-type(2)', app: '[class*="boutonSecondaire"]' },
      'collage': { maquette: '.assocCollage', app: '[class*="association-v3_collage"]' },
      'logo': { maquette: '.assocCollage img:nth-of-type(1)', app: '[class*="association-v3_logo"]' },
      'photo 1': { maquette: '.assocCollage img:nth-of-type(2)', app: '[class*="association-v3_photo"]:nth-of-type(2)' },
      'photo 2': { maquette: '.assocCollage img:nth-of-type(3)', app: '[class*="association-v3_photo"]:nth-of-type(3)' },

      'bande olive': { maquette: 'main > section:nth-of-type(2)', app: '[class*="association-v3_bande__"]' },
      'bande intérieur': { maquette: 'main > section:nth-of-type(2) > div', app: '[class*="bandeInterieur"]' },
      'bande entête': { maquette: 'main > section:nth-of-type(2) > div > div:first-child', app: '[class*="bandeEnTete"]' },
      'bande oeil': { maquette: 'main > section:nth-of-type(2) > div > div:first-child > span', app: '[class*="oeilSurChrome"]' },
      'bande h2': { maquette: 'main > section:nth-of-type(2) h2', app: '[class*="bandeTitre"]' },
      'axes grille': { maquette: 'main > section:nth-of-type(2) > div > div:last-child', app: '[class*="association-v3_axes"]' },
      'axe 1': { maquette: 'main > section:nth-of-type(2) > div > div:last-child > div:nth-child(1)', app: '[class*="association-v3_axe__"]:nth-child(1)' },
      'axe numéro': { maquette: 'main > section:nth-of-type(2) > div > div:last-child > div:nth-child(1) > span', app: '[class*="axeNumero"]' },
      'axe titre': { maquette: 'main > section:nth-of-type(2) > div > div:last-child > div:nth-child(1) > p:nth-of-type(1)', app: '[class*="axeTitre"]' },
      'axe corps': { maquette: 'main > section:nth-of-type(2) > div > div:last-child > div:nth-child(1) > p:nth-of-type(2)', app: '[class*="axeCorps"]' },

      'adhérer section': { maquette: 'main > section:nth-of-type(3)', app: '[class*="sectionAdhesion"]' },
      'adhérer grille': { maquette: 'main > section:nth-of-type(3) > div', app: '[class*="association-v3_adhesion__"]' },
      'adhérer h2': { maquette: 'main > section:nth-of-type(3) h2', app: '[class*="adhesionTitre"]' },
      'adhérer p1': { maquette: 'main > section:nth-of-type(3) > div > div:first-child > p:nth-of-type(1)', app: '[class*="adhesionTexte"]:nth-of-type(1)' },
      'adhérer p2': { maquette: 'main > section:nth-of-type(3) > div > div:first-child > p:nth-of-type(2)', app: '[class*="adhesionTexte"]:nth-of-type(2)' },
      'savoir carte': { maquette: 'main > section:nth-of-type(3) > div > div:last-child', app: '[class*="association-v3_notes__"]' },
      'savoir titre': { maquette: 'main > section:nth-of-type(3) > div > div:last-child > p:first-child', app: '[class*="notesTitre"]' },
      'savoir note 1': { maquette: 'main > section:nth-of-type(3) > div > div:last-child > p:nth-of-type(2)', app: '[class*="association-v3_note__"]:nth-child(1)' },
      'savoir tiret': { maquette: 'main > section:nth-of-type(3) > div > div:last-child > p:nth-of-type(2) > span', app: '[class*="association-v3_tiret"]' },

      'soutien section': { maquette: 'main > section:nth-of-type(4)', app: '[class*="sectionSoutien"]' },
      'soutien grille': { maquette: 'main > section:nth-of-type(4) > div:first-child', app: '[class*="association-v3_soutiens"]' },
      'soutien carte 1': { maquette: 'main > section:nth-of-type(4) > div:first-child > div:nth-child(1)', app: '[class*="association-v3_soutien__"]:nth-child(1)' },
      'soutien icône': { maquette: 'main > section:nth-of-type(4) > div:first-child > div:nth-child(1) > span', app: '[class*="soutienIcone"]' },
      'soutien titre': { maquette: 'main > section:nth-of-type(4) > div:first-child > div:nth-child(1) > p:nth-of-type(1)', app: '[class*="soutienTitre"]' },
      'soutien corps': { maquette: 'main > section:nth-of-type(4) > div:first-child > div:nth-child(1) > p:nth-of-type(2)', app: '[class*="soutienCorps"]' },
      'citation panneau': { maquette: 'main > section:nth-of-type(4) > div:last-child', app: '[class*="association-v3_panneau__"]' },
      'citation texte': { maquette: 'main > section:nth-of-type(4) > div:last-child > p:nth-of-type(1)', app: '[class*="association-v3_citation__"]' },
      'citation relance': { maquette: 'main > section:nth-of-type(4) > div:last-child > p:nth-of-type(2)', app: '[class*="citationRelance"]' },
      'citation bouton': { maquette: 'main > section:nth-of-type(4) > div:last-child > button', app: '[class*="panneauAction"]' },

      'articles section': { maquette: '#articles', app: '[class*="sectionArticles"]' },
      'articles entête': { maquette: '#articles > div:first-child', app: '[class*="articlesEnTete"]' },
      'articles oeil': { maquette: '#articles > div:first-child > span', app: '[class*="oeilClair"]' },
      'articles h2': { maquette: '#articles h2', app: '[class*="articlesTitre"]' },
      'articles texte': { maquette: '#articles > div:first-child > p', app: '[class*="articlesTexte"]' },
      'articles grille': { maquette: '#articles > div:last-child', app: '[class*="association-v3_articles__"]' },
      'article principal': { maquette: '#articles article:nth-of-type(1)', app: '[class*="principalLien"]' },
      'article pastille': { maquette: '#articles article:nth-of-type(1) span:first-of-type', app: '[class*="association-v3_etiquette"]' },
      'article titre': { maquette: '#articles article:nth-of-type(1) h3', app: '[class*="principalTitre"]' },
      'article extrait': { maquette: '#articles article:nth-of-type(1) p', app: '[class*="principalExtrait"]' },
      'colonne côté': { maquette: '#articles > div:last-child > div:last-child', app: '[class*="colonneListe"]' },
      'article côté 1': { maquette: '#articles > div:last-child > div:last-child > article:nth-of-type(1)', app: '[class*="secondaireLien"]' },
      'côté image': { maquette: '#articles > div:last-child > div:last-child > article:nth-of-type(1) img', app: '[class*="secondaireImage"]' },
      'côté étiquette': { maquette: '#articles > div:last-child > div:last-child > article:nth-of-type(1) span:first-of-type', app: '[class*="secondaireEtiquette"]' },
      'côté titre': { maquette: '#articles > div:last-child > div:last-child > article:nth-of-type(1) h3', app: '[class*="secondaireTitre"]' },
      'côté méta': { maquette: '#articles > div:last-child > div:last-child > article:nth-of-type(1) div > span:last-of-type', app: '[class*="secondaireMeta"]' },
    },
  },
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ OFFRES — trois cartes, et un bloc de questions.                      │
   * │                                                                      │
   * │ Mêmes précautions et mêmes écarts attendus que la scène              │
   * │ `association` : la gouttière (1440 avec 128 px de rembourrage contre  │
   * │ 1240 avec 28 px), le `fontWeight` synthétique coupé, et les jetons    │
   * │ d'encre du dépôt là où la maquette écrit du blanc.                    │
   * │                                                                      │
   * │ Un écart de plus, propre à cet écran : les PRIX. Ceux de la maquette  │
   * │ sont inventés — 2 000, 4 500, 10 000 FCFA — et ceux de l'application  │
   * │ viennent de `plan_prices`. On compare donc la BOÎTE du prix, jamais   │
   * │ son texte.                                                            │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  offres: {
    largeur: BUREAU,
    pleinePage: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      await p.getByText('Offres', { exact: true }).first().click();
      await p.waitForTimeout(900);
      await poser(p);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/offres`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      await poser(p);
    },
    sondes: {
      'bandeau': { maquette: 'main > section:nth-of-type(1)', app: '[class*="offres-v3_bandeau"]' },
      'bandeau intérieur': { maquette: 'main > section:nth-of-type(1) > div', app: '[class*="bandeauInterieur"]' },
      'oeil': { maquette: 'main > section:nth-of-type(1) span', app: '[class*="offres-v3_oeil__"]' },
      'h1': { maquette: 'main > section:nth-of-type(1) h1', app: '[class*="offres-v3_titre__"]' },
      'chapeau': { maquette: 'main > section:nth-of-type(1) p', app: '[class*="offres-v3_chapeau"]' },

      'section cartes': { maquette: 'main > section:nth-of-type(2)', app: '[class*="sectionFormules"]' },
      'grille': { maquette: 'main > section:nth-of-type(2) > div:first-child', app: '[class*="offres-v3_formules"]' },
      'carte 1': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(1)', app: '[class*="offres-v3_formule__"]:nth-child(1)' },
      'carte 2': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(2)', app: '[class*="offres-v3_formule__"]:nth-child(2)' },
      'carte 3': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(3)', app: '[class*="offres-v3_formule__"]:nth-child(3)' },
      'sur-titre carte': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(1) > span', app: '[class*="offres-v3_formule__"]:nth-child(1) [class*="formuleOeil"]' },
      'titre carte': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(1) h2', app: '[class*="offres-v3_formule__"]:nth-child(1) [class*="formuleTitre"]' },
      'prix': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(1) > p:nth-of-type(1)', app: '[class*="offres-v3_formule__"]:nth-child(1) [class*="offres-v3_prix__"]' },
      'note du prix': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(1) > p:nth-of-type(2)', app: '[class*="offres-v3_formule__"]:nth-child(1) [class*="prixNote"]' },
      'inclus 1': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(1) > p:nth-of-type(3)', app: '[class*="offres-v3_formule__"]:nth-child(1) [class*="offres-v3_inclus__"]' },
      'limite': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(1) > p:last-of-type', app: '[class*="offres-v3_formule__"]:nth-child(1) [class*="offres-v3_limite"]' },
      'bouton carte': { maquette: 'main > section:nth-of-type(2) > div:first-child > div:nth-child(1) > button', app: '[class*="offres-v3_formule__"]:nth-child(1) [class*="formuleAction"]' },

      'questions': { maquette: 'main > section:nth-of-type(2) > div:last-child', app: '[class*="offres-v3_questions__"]' },
      'questions titre': { maquette: 'main > section:nth-of-type(2) > div:last-child > h2', app: '[class*="questionsTitre"]' },
      'questions grille': { maquette: 'main > section:nth-of-type(2) > div:last-child > div', app: '[class*="questionsGrille"]' },
      'question 1': { maquette: 'main > section:nth-of-type(2) > div:last-child > div > div:nth-child(1) > p:nth-of-type(1)', app: '[class*="offres-v3_question__"] [class*="questionIntitule"]' },
      'réponse 1': { maquette: 'main > section:nth-of-type(2) > div:last-child > div > div:nth-child(1) > p:nth-of-type(2)', app: '[class*="offres-v3_question__"] [class*="questionReponse"]' },
    },
  },

  /**
   * BIBLIOTHÈQUE — l'écran `/compte/bibliotheque` sous Organic.
   *
   * L'onglet « Ma bibliothèque » du gabarit V3 : en-tête d'identité, onglets
   * horizontaux, puis la liste des titres achetés avec reprise de lecture.
   * Cet écran existe dans le prototype ET dans le dépôt avec la même structure.
   */
  bibliotheque: {
    largeur: BUREAU,
    pleinePage: true,
    connecte: true,
    maquette: async (p) => {
      await p.goto(MAQUETTE_BUREAU, { waitUntil: 'load' });
      await p.waitForTimeout(900);
      // Cliquer sur l'icône de compte dans l'en-tête
      const compte = p.locator('header button[aria-label*="Compte" i], header button:has-text("Mon compte")').first();
      if (await compte.count()) await compte.click();
      await p.waitForTimeout(700);
      // L'onglet Bibliothèque devrait être actif par défaut
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/compte/bibliotheque`, { waitUntil: 'load' });
      await p.waitForTimeout(800);
    },
    sondes: {
      /* ── L'en-tête d'identité ───────────────────────────────────────── */

      'en-tête': {
        maquette: 'main > div:nth-child(1)',
        app: '[class*="espace-v3_entete"]',
        ignore: ['y'],
      },
      'oeil en-tête': {
        maquette: 'main > div:nth-child(1) > span:nth-child(1)',
        app: '[class*="espace-v3_oeil"]',
      },
      'titre en-tête': {
        maquette: 'main > div:nth-child(1) h1',
        app: '[class*="espace-v3_titre"]',
        ignore: ['h'],
      },
      'email en-tête': {
        maquette: 'main > div:nth-child(1) > div > p',
        app: '[class*="espace-v3_email"]',
      },

      /* ── La navigation par onglets ──────────────────────────────────── */

      'barre onglets': {
        maquette: 'main > div:nth-child(2) > nav',
        app: '[class*="espace-v3_onglets"]',
      },
      'onglet actif': {
        maquette: 'main > div:nth-child(2) > nav button:first-child',
        app: '[class*="espace-v3_ongletActif"]',
        ignore: ['x', 'w'],
      },

      /* ── Le titre de section ────────────────────────────────────────── */

      'section titre': {
        maquette: 'main > div:nth-child(2) > div h2',
        app: '[class*="espace-v3_sousTitre"]',
        ignore: ['y', 'h'],
      },
      'section intro': {
        maquette: 'main > div:nth-child(2) > div > div > div > p',
        app: '[class*="espace-v3_intro"]',
        ignore: ['y', 'h'],
      },

      /* ── Une carte de titre ─────────────────────────────────────────── */

      'carte': {
        maquette: 'main article:first-of-type',
        app: '[class*="espace-v3_carteTitre"]:first-child',
        ignore: ['y'],
      },
      'vignette': {
        maquette: 'main article:first-of-type img',
        app: '[class*="espace-v3_vignette"]',
      },
      'nom titre': {
        maquette: 'main article:first-of-type h3',
        app: '[class*="espace-v3_nom"]',
        ignore: ['h'],
      },
      'note progress': {
        maquette: 'main article:first-of-type > div > p:last-of-type',
        app: '[class*="espace-v3_note"]',
        ignore: ['h'],
      },
      'bouton principal carte': {
        maquette: 'main article:first-of-type button:first-of-type',
        app: '[class*="espace-v3_bouton"]',
        ignore: ['x', 'w'],
      },
    },
  },

  /* ══ ADMINISTRATION — tableau de bord ═════════════════════════════════ */

  'admin-bord': {
    largeur: BUREAU,
    connecte: 'admin',
    pleinePage: true,
    maquette: (p) => maquetteAdmin(p, null),
    app: async (p) => {
      // « Depuis le début » : sur trente jours, le jeu de démonstration n'a
      // aucune recette, et le bandeau de chiffres ne se rend pas du tout.
      await p.goto(`${APP}/fr/admin?periode=tout`, { waitUntil: 'load' });
      await p.waitForTimeout(1200);
    },
    sondes: {
      ...SONDES_CHROME_ADMIN,

      'carte d’alerte': {
        // `.card.elev-md` : le rail porte lui aussi l'olive en fond.
        maquette: '.card.elev-md',
        app: '[class*="admin_bloquant__"]',
        ignore: ['h'],
      },
      'chiffre d’alerte': {
        maquette: '.card.elev-md div[style*="font-size: 56px"]',
        app: '[class*="admin_bloquantChiffre"]',
        ignore: ['w'],
      },
      'titre d’alerte': {
        maquette: '.card.elev-md div[style*="font-size: 21px"]',
        app: '[class*="admin_bloquantTitre"]',
        ignore: ['w', 'h'],
      },
      'filet des secondaires': {
        maquette: '.card.elev-md div[style*="border-left: 1px solid"]',
        app: '[class*="admin_bloquantSecondaires"]',
        ignore: ['x', 'w'],
      },
      'bandeau': {
        maquette: 'div[style*="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))"]',
        app: '[class*="admin_bandeauGrille"]',
        ignore: ['y', 'h'],
      },
      'cellule de bandeau': {
        maquette:
          'div[style*="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))"] > div:first-child',
        app: '[class*="admin_bandeauCellule"]',
        ignore: ['y', 'h'],
      },
      'sur-titre de cellule': {
        maquette: 'div[style*="letter-spacing: 0.12em"][style*="font-size: 10px"]',
        app: '[class*="admin_bandeauIntitule"]',
        ignore: ['x', 'y', 'w'],
      },
      'valeur de cellule': {
        maquette: 'div[style*="font-size: 30px"]',
        app: '[class*="admin_bandeauValeur"]',
        ignore: ['y', 'w'],
      },
      'grille des panneaux': {
        maquette: 'div[style*="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))"]',
        app: '[class*="admin_panneaux"]',
        ignore: ['y', 'h'],
      },
      'ligne du calme': {
        maquette: 'div[style*="border-top: 1px solid var(--color-divider)"]',
        app: '[class*="admin_calme"]',
        ignore: ['y', 'h'],
      },
    },
  },

  /* ══ ADMINISTRATION — contes ══════════════════════════════════════════ */

  'admin-contes': {
    largeur: BUREAU,
    connecte: 'admin',
    pleinePage: true,
    maquette: (p) => maquetteAdmin(p, 'Contes'),
    app: async (p) => {
      await p.goto(`${APP}/fr/admin/contes`, { waitUntil: 'load' });
      await p.waitForTimeout(1200);
    },
    sondes: {
      ...SONDES_CHROME_ADMIN,

      'bouton principal': {
        maquette: 'div[style*="backdrop-filter: blur(10px)"] button',
        app: '[class*="admin_barreActions"] a',
      },
      'carte de filtres': {
        maquette: 'div[style*="padding: var(--space-3) var(--space-4)"]',
        app: '[class*="admin_filtresCarte"]',
      },
      'champ de recherche': {
        maquette: 'input[class*="input"]',
        app: '[class*="admin_rechercheSaisieOrganic"]',
      },
      'décompte': {
        maquette: 'div[style*="padding: var(--space-3) var(--space-4)"] div[style*="white-space: nowrap"]',
        app: '[class*="admin_decompte"]',
        // Aligné à droite d'un champ souple : sa position suit la largeur.
        ignore: ['x', 'w'],
      },
      'segmenté': { maquette: '.seg', app: '[class*="admin_seg"]', ignore: ['w'] },
      'segment': { maquette: '.seg-opt', app: '[class*="admin_segOpt"]', ignore: ['w'] },
      'cadre du tableau': {
        maquette: 'div[style*="overflow-x: auto"]',
        app: '[class*="admin_grilleCadre"]',
        // `gap` : la maquette empile en flex, nous en bloc — même résultat.
        ignore: ['h', 'gap'],
      },
      'en-tête de colonnes': {
        maquette: 'div[style*="min-width: 700px"]:first-of-type',
        app: '[class*="admin_grilleEntete"]',
      },
      'première rangée': {
        maquette: 'div[style*="min-width: 700px"][style*="cursor: pointer"]',
        app: '[class*="admin_grilleRangee"]',
        // La hauteur suit le contenu : 76 px avec des manques, 72 sans.
        ignore: ['h'],
      },
    },
  },

  /* ══ ADMINISTRATION — livrets pédagogiques ════════════════════════════ */

  'admin-livrets': {
    largeur: BUREAU,
    connecte: 'admin',
    pleinePage: true,
    maquette: (p) => maquetteAdmin(p, 'Livrets pédagogiques'),
    app: async (p) => {
      await p.goto(`${APP}/fr/admin/livrets`, { waitUntil: 'load' });
      await p.waitForTimeout(1200);
    },
    sondes: {
      ...SONDES_CHROME_ADMIN,

      'carte de filtres': {
        maquette: 'div[style*="padding: var(--space-3) var(--space-4)"]',
        app: '[class*="admin_filtresCarte"]',
      },
      'champ de recherche': {
        maquette: 'input[class*="input"]',
        app: '[class*="admin_rechercheSaisieOrganic"]',
      },
      'segmenté': { maquette: '.seg', app: '[class*="admin_seg"]', ignore: ['w'] },
      'cadre du tableau': {
        maquette: 'div[style*="overflow-x: auto"]',
        app: '[class*="admin_grilleCadre"]',
        // `gap` : la maquette empile en flex, nous en bloc — même résultat.
        ignore: ['h', 'gap'],
      },
      'en-tête de colonnes': {
        maquette: 'div[style*="min-width: 660px"]:first-of-type',
        app: '[class*="admin_grilleEntete"]',
      },
      'première rangée': {
        maquette: 'div[style*="min-width: 660px"][style*="cursor: pointer"]',
        app: '[class*="admin_grilleRangee"]',
        ignore: ['h'],
      },
    },
  },

  /* ══ ADMINISTRATION — la fiche d'un titre ═════════════════════════════ */

  'admin-fiche': {
    largeur: BUREAU,
    connecte: 'admin',
    /*
     * PAS de pleine page ici, à la différence des autres scènes : la capture
     * pleine page défile le document, et la maquette reste au point où elle
     * s'est arrêtée. Toutes les ordonnées se lisaient alors avec sept cents
     * pixels d'écart — un relevé faux, et faux de façon crédible.
     */
    pleinePage: false,
    maquette: async (p) => {
      await maquetteAdmin(p, 'Contes');
      // Une rangée du tableau ouvre le détail — c'est le geste de l'éditeur.
      await p.getByText('le-prince-qui-voulait-etre-gentil', { exact: true }).first().click();
      await p.waitForTimeout(1200);
      /*
       * Playwright FAIT DÉFILER pour cliquer, et la maquette reste où elle
       * s'est arrêtée : sept cents pixels plus bas. Toutes les ordonnées se
       * lisaient alors faussées — et faussées de façon crédible, ce qui est
       * le pire cas. On remonte avant de sonder.
       */
      await p.evaluate(() => { globalThis.scrollTo(0, 0); });
      await p.waitForTimeout(400);
    },
    app: async (p) => {
      await p.goto(`${APP}/fr/admin/contes?statut=brouillon`, { waitUntil: 'load' });
      await p.waitForTimeout(1000);
      await p.locator('[class*="grilleTitre"]').first().click();
      await p.waitForTimeout(1500);
    },
    sondes: {
      ...SONDES_CHROME_ADMIN,

      'lien de retour': {
        maquette: 'div[style*="max-width: 1200px"] > a:first-child',
        app: '[class*="admin_retourFiche"]',
      },
      'carte d’identité': {
        maquette: 'div[style*="max-width: 1200px"] > div.card:first-of-type',
        app: '[class*="admin_ficheEntete"]',
        ignore: ['h'],
      },
      'emplacement de couverture': {
        maquette: 'image-slot',
        app: '[class*="admin_ficheCouverture__"]',
        /*
         * Seule la BOÎTE se compare. `image-slot` est un élément sur mesure du
         * prototype qui peint à l'intérieur de lui-même : son cadre extérieur
         * n'a ni fond, ni rayon, ni trait, alors que le dessin en a. Comparer
         * la peinture ici opposerait deux couches différentes.
         */
        ignore: ['fontFamily', 'fontSize', 'lineHeight', 'backgroundColor',
                 'borderRadius', 'borderWidth', 'borderColor', 'color'],
      },
      'légende de couverture': {
        maquette: 'div[style*="width: 148px"] > div:last-child',
        app: '[class*="admin_ficheCouvertureLegende"]',
      },
      'titre de fiche': {
        maquette: 'h1[style*="font-size: 34px"]',
        app: '[class*="admin_ficheTitre__"]',
        ignore: ['w'],
      },
      'ligne des repères': {
        maquette: 'div[style*="border-top: 1px solid var(--color-divider)"][style*="gap: var(--space-6)"]',
        app: '[class*="admin_ficheReperes"]',
        ignore: ['w'],
      },
      'grille des deux colonnes': {
        maquette: 'div[style*="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))"][style*="gap: var(--space-6)"]',
        app: '[class*="admin_ficheColonnes"]',
        ignore: ['h'],
      },
      'colonne latérale': {
        maquette: 'div[style*="position: sticky"][style*="max-width: 360px"]',
        app: '[class*="admin_ficheLaterale"]',
        ignore: ['h'],
      },
      'titre de section': {
        maquette: 'h3',
        app: '[class*="admin_sectionTitre"]',
        ignore: ['w'],
      },
      'carte de champs': {
        maquette: 'h3 + div.card',
        app: '[class*="admin_ficheColonnePrincipale"] [class*="admin_cadre"]',
        ignore: ['h'],
      },
      'étiquette de champ': {
        maquette: '.field > label',
        app: '[class*="admin_libelle"]',
        ignore: ['w'],
      },
      'saisie': {
        maquette: '.field input.input',
        app: '[class*="admin_saisie"]',
        ignore: ['w'],
      },
      'rangée d’accès': {
        maquette: 'div[style*="border-radius: var(--radius-md)"][style*="padding: 11px 13px"]',
        app: '[class*="admin_levier__"]',
        ignore: ['w'],
      },
      'case d’accès': {
        maquette: 'span[style*="width: 19px"]',
        app: '[class*="admin_levierCase__"]',
      },
      'carte de publication': {
        maquette: 'div[style*="position: sticky"] div.card.elev-md',
        app: '[class*="admin_ficheLaterale"] [class*="admin_cadre"]',
        ignore: ['h'],
      },
    },
  },
};

/* ══ Exécution ════════════════════════════════════════════════════════════ */

const demandees = process.argv.slice(2);
const noms = demandees.length > 0 ? demandees : Object.keys(SCENES);

const navigateur = await chromium.launch();

for (const nom of noms) {
  const scene = SCENES[nom];
  if (!scene) {
    console.error(`Scène inconnue : ${nom}`);
    continue;
  }
  console.log(`\n── ${nom} ──────────────────────────────────`);

  // Maquette.
  const cm = await navigateur.newContext({ viewport: scene.largeur, deviceScaleFactor: 1 });
  const pm = await cm.newPage();
  try {
    await scene.maquette(pm);
    await pm.screenshot({ path: resolve(SORTIE, `maquette-${nom}.png`), fullPage: scene.pleinePage === true });
    console.log('   maquette capturée');
  } catch (e) {
    console.log(`   maquette : ${e.message}`);
  }

  // Application.
  const ca = await navigateur.newContext({ viewport: scene.largeur, deviceScaleFactor: 1 });
  if (scene.connecte) await connecter(ca, scene.connecte === 'admin' ? COMPTE_ADMIN : COMPTE);
  if (scene.panier) await remplirPanier(ca);
  const pa = await ca.newPage();
  try {
    await scene.app(pa);
    await pa.screenshot({ path: resolve(SORTIE, `app-${nom}.png`), fullPage: scene.pleinePage === true });
    console.log('   application capturée');
  } catch (e) {
    console.log(`   application : ${e.message}`);
  }

  if (scene.sondes) {
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ ON RELÈVE TOUT, PUIS ON COMPARE — pour que `relatifA` ait de quoi.    │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    const releves = new Map();
    for (const [libelle, cote] of Object.entries(scene.sondes)) {
      releves.set(libelle, {
        maquette: await sonder(pm, cote.maquette),
        app: await sonder(pa, cote.app),
      });
    }

    for (const [libelle, cote] of Object.entries(scene.sondes)) {
      const { maquette: g, app: d } = releves.get(libelle);
      comparer(libelle, cote, g, d, releves);
    }
  }

  await cm.close();
  await ca.close();
}

await navigateur.close();
