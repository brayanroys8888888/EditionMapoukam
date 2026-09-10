#!/usr/bin/env node
/**
 * CAPTURE DE TOUS LES ÉCRANS, EN TROIS PASSES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE N'EST PAS UN TEST. Rien n'est asserté, rien n'échoue.                 │
 * │                                                                          │
 * │ `npm run rendu` éprouve des mises en page et doit tomber quand elles     │
 * │ sont fausses. Ceci traverse, photographie et rapporte : un écran en      │
 * │ erreur est photographié comme les autres — une page cassée est une       │
 * │ information, pas une raison de s'arrêter à la treizième sur trente.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Trois passes, parce qu'un écran ne se voit pas de partout :
 *   1. visiteur anonyme — la vitrine et les pages éditoriales ;
 *   2. parent connecté — l'espace personnel, ET le tunnel d'achat joué pour
 *      de bon, sans quoi la bibliothèque et le reçu seraient vides ;
 *   3. administrateur — le back-office et la console de simulation.
 *
 *   node scripts/captures-ecrans.mjs           # → captures/
 *   SORTIE=/tmp/x node scripts/captures-ecrans.mjs
 *
 * Le serveur de développement doit tourner, et Docker avec lui.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SORTIE = process.env.SORTIE ?? 'captures';

/*
 * Les identifiants sont ceux des comptes de démonstration de la base LOCALE,
 * documentés dans REPRISE.md §6. Le garde-fou ci-dessous les empêche de
 * partir ailleurs que sur cette machine : ce script ne doit jamais tenter une
 * connexion sur autre chose que localhost.
 */
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
  console.error(`BASE_URL doit rester locale. Reçu : ${BASE}`);
  process.exit(1);
}

const ADMIN = {
  email: process.env.CAPTURE_ADMIN_EMAIL ?? 'admin@editionmapoukam.test',
  mdp: process.env.CAPTURE_ADMIN_MDP ?? 'Adm-JL8HLFGBbdoS-7',
};
const PARENT = {
  email: process.env.CAPTURE_PARENT_EMAIL ?? 'parent.demo@editionmapoukam.test',
  mdp: process.env.CAPTURE_PARENT_MDP ?? 'Demo-Parent-2026-x9',
};

const journal = [];
let compteur = 0;

mkdirSync(SORTIE, { recursive: true });

/** Photographie la page telle qu'elle est, sans y naviguer. */
async function poser(page, nom) {
  compteur += 1;
  const fichier = join(SORTIE, `${String(compteur).padStart(2, '0')}-${nom}.png`);
  try {
    await page.waitForLoadState('networkidle', { timeout: 12000 });
  } catch {
    /* Un flux qui ne se tait jamais ne doit pas empêcher la photo. */
  }
  // Les images décodées, sans quoi une couverture à moitié peinte passe pour
  // un défaut de mise en page.
  await page
    .waitForFunction(() => Array.from(document.images).every((i) => i.complete), { timeout: 15000 })
    .catch(() => {});

  // La pastille du serveur de développement — et son « Compiling… » — n'est
  // pas le site : elle flotte au-dessus de chaque capture sans lui appartenir.
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: fichier, fullPage: true });
  return fichier;
}

async function capturer(page, chemin, nom) {
  let statut = 'ok';
  /*
   * DEUX ESSAIS, PARCE QUE LE PREMIER MENT PARFOIS.
   *
   * Le serveur de développement compile à la demande, et une navigation
   * lancée pendant qu'il compile revient en `net::ERR_ABORTED` sur une page
   * qui, reprise seule, rend 200. Trois écrans sains ont été rapportés en
   * panne pour cette raison. Un second essai les départage : ce qui échoue
   * deux fois est un vrai défaut.
   */
  for (const essai of [1, 2]) {
    statut = 'ok';
    try {
      const reponse = await page.goto(BASE + chemin, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      const code = reponse?.status() ?? 0;
      if (code >= 400) statut = `HTTP ${code}`;
      break;
    } catch (erreur) {
      statut = `échec de navigation : ${erreur.message.split('\n')[0]}`;
      if (essai === 1) await page.waitForTimeout(1500);
    }
  }

  const fichier = await poser(page, nom);
  const url = new URL(page.url());
  const arrivee = url.pathname + url.search;
  if (statut === 'ok' && arrivee !== chemin) statut = `redirigé vers ${arrivee}`;

  journal.push({ fichier, chemin, nom, statut });
  console.log(`  ${statut === 'ok' ? '✓' : '⚠'} ${nom.padEnd(30)} ${chemin} ${statut === 'ok' ? '' : `— ${statut}`}`);
  return fichier;
}

async function connecter(page, compte) {
  // Deux essais, pour la même raison que `capturer` : la première soumission
  // peut tomber pendant une compilation à la demande, et échouer sur des
  // identifiants parfaitement valides.
  for (const essai of [1, 2, 3]) {
    try {
      await page.goto(`${BASE}/fr/connexion`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.fill('#connexion-email', compte.email);
      await page.fill('#connexion-motdepasse', compte.mdp);
      await page.click('button[type="submit"]');
      await page
        .waitForURL((u) => !u.pathname.includes('/connexion'), { timeout: 45000 })
        .catch(() => {});
      await page.waitForTimeout(1500);

      if (!page.url().includes('/connexion')) {
        console.log(`  ✓ connexion ${compte.email} → ${new URL(page.url()).pathname}`);
        return true;
      }
    } catch (erreur) {
      console.log(`  … essai ${essai} : ${erreur.message.split('\n')[0]}`);
    }
    if (essai < 3) await page.waitForTimeout(5000);
  }

  console.log(`  ✗ connexion ${compte.email} — restée sur l'écran de connexion`);
  return false;
}

function contexteBureau(navigateur) {
  return navigateur.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
    deviceScaleFactor: 1,
  });
}

const navigateur = await chromium.launch();

/* ─────────────────────────── 1. Visiteur anonyme ─────────────────────────── */
console.log('\n── Visiteur anonyme ──');
const pageA = await (await contexteBureau(navigateur)).newPage();

const PUBLIQUES = [
  ['/fr', 'accueil'],
  ['/fr/catalogue', 'catalogue'],
  ['/fr/contes', 'contes'],
  ['/fr/livrets', 'livrets'],
  ['/fr/contes/anansi-l-araignee-maligne', 'fiche-conte'],
  ['/fr/contes/zaku', 'fiche-livret'],
  ['/fr/offres', 'offres'],
  ['/fr/association', 'association'],
  ['/fr/association/sur-le-terrain-avec-l-association-dave', 'association-article'],
  ['/fr/expertise', 'expertise'],
  ['/fr/a-propos', 'a-propos'],
  ['/fr/contact', 'contact'],
  ['/fr/questions-frequentes', 'questions-frequentes'],
  ['/fr/conditions-generales', 'conditions-generales'],
  ['/fr/confidentialite', 'confidentialite'],
  ['/fr/connexion', 'connexion'],
  ['/fr/inscription', 'inscription'],
  ['/fr/mot-de-passe-oublie', 'mot-de-passe-oublie'],
  ['/fr/nouveau-mot-de-passe', 'nouveau-mot-de-passe'],
  ['/fr/confirmation', 'confirmation-inscription'],
  ['/fr/page-qui-nexiste-pas', 'page-introuvable-404'],
  ['/en', 'accueil-anglais'],
  ['/en/catalogue', 'catalogue-anglais'],
];
for (const [chemin, nom] of PUBLIQUES) await capturer(pageA, chemin, nom);

/* ──────────────────── 2. Parent connecté, et son tunnel ──────────────────── */
console.log('\n── Parent connecté ──');
const pageP = await (await contexteBureau(navigateur)).newPage();

if (await connecter(pageP, PARENT)) {
  await capturer(pageP, '/fr/compte', 'compte-tableau-de-bord');
  await capturer(pageP, '/fr/panier', 'panier-vide');

  /*
   * Les deux tunnels sont JOUÉS, pas simulés de l'extérieur : ce sont eux qui
   * garnissent le panier, produisent la page de règlement et remplissent la
   * bibliothèque. Photographier ces écrans sans passer par là donnerait des
   * pages vides — c'est-à-dire des captures qui ne montrent rien.
   */

  /** Photographie l'écran courant, hors de toute navigation. */
  async function poserCourant(nom) {
    const url = new URL(pageP.url());
    const chemin = url.pathname + url.search;
    journal.push({ fichier: await poser(pageP, nom), chemin, nom, statut: 'ok' });
    console.log(`  ✓ ${nom.padEnd(30)} ${chemin}`);
  }

  /*
   * Ces clics-ci franchissent une ÉTAPE, et une étape passe par le serveur —
   * action de serveur ou redirection. Une attente en secondes fixes photo-
   * graphiait l'écran précédent dès que le serveur de développement compilait :
   * on attend donc que l'adresse ait changé, pas qu'un délai soit écoulé.
   */
  async function franchir(locator, versUrl) {
    await locator.click();
    await pageP.waitForURL(versUrl, { timeout: 60000 });
    await pageP.waitForLoadState('domcontentloaded');
  }

  /*
   * LES COORDONNÉES SONT EXIGÉES, ET LEUR ABSENCE NE DIT RIEN.
   *
   * `verifierCoordonnees` renvoie au même écran avec `?champs=nom` : sans le
   * remplir, le règlement repart en arrière sur une page qui ressemble trait
   * pour trait à celle qu'on vient de quitter. Deux tunnels ont ainsi été
   * photographiés comme réglés alors qu'aucun ne l'était.
   */
  async function remplirCoordonnees() {
    const nom = pageP.locator('input[name="nom"]');
    if (await nom.count()) await nom.first().fill('Awa Demo');

    // Le Mobile Money demande un numéro ; la carte, non.
    const telephone = pageP.locator('input[name="telephone"]');
    if (await telephone.count()) await telephone.first().fill('+237 6 99 00 11 22');
  }

  /*
   * PRÉCHAUFFAGE, ET LA RAISON EST UNE COURSE, PAS UNE LENTEUR.
   *
   * Le serveur de développement compile chaque route au premier accès. Quand
   * cette compilation tombe pendant l'action qui crée la commande, la
   * redirection vers `/fr/paiement/<id>` n'aboutit pas et l'écran de
   * récapitulatif — dont le panier vient d'être vidé — renvoie au panier. Le
   * tunnel s'arrête alors sur une page parfaitement normale, ce qui rend le
   * défaut illisible. Visiter les deux routes AVANT les compile pour de bon ;
   * l'identifiant nul n'existe pas, et la page 404 qu'il produit suffit.
   */
  for (const route of [
    '/fr/panier/confirmation',
    '/fr/paiement/00000000-0000-0000-0000-000000000000',
  ]) {
    await pageP.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  }

  // ── Tunnel d'achat ────────────────────────────────────────────────────
  try {
    /*
     * LE TITRE EST CHOISI DANS LE CATALOGUE, PAS ÉCRIT ICI.
     *
     * Un achat est perpétuel : la deuxième exécution du script trouverait le
     * titre codé en dur déjà possédé, et son bouton remplacé par « Lire ».
     * Prendre le premier « Ajouter au panier » du catalogue rend le script
     * rejouable — les titres déjà acquis n'en portent plus.
     */
    await pageP.goto(`${BASE}/fr/catalogue`, { waitUntil: 'networkidle' });

    /*
     * Attendre le BOUTON, pas la page. `domcontentloaded` revient avant que le
     * serveur de développement ait fini de rendre l'écran : le clic partait
     * alors dans le vide et le panier restait vide, sans erreur nulle part.
     */
    const ajouter = pageP.getByRole('button', { name: /Ajouter au panier/i }).first();
    await ajouter.waitFor({ state: 'visible', timeout: 30000 });
    await franchir(ajouter, /ajoute=1/);
    await capturer(pageP, '/fr/panier', 'panier-garni');

    // Les étapes de ce tunnel sont des LIENS autant que des boutons — le
    // récapitulatif et le choix du moyen ne créent rien, ce sont des lectures.
    // On les vise par leur `href`, pas par leur libellé : le libellé visible
    // d'une carte cliquable entière n'est pas son nom accessible.
    await franchir(pageP.locator('a[href*="/panier/confirmation"]').first(), /\/panier\/confirmation/);
    await poserCourant('recapitulatif-commande');

    await franchir(pageP.getByRole('button', { name: /Confirmer et payer/i }).first(), /\/paiement\//);
    await poserCourant('paiement-choix-moyen');

    // Le moyen se choisit AVANT le règlement : sans lui, aucun bouton
    // « Payer » n'existe sur la page.
    await franchir(pageP.locator('a[href*="moyen="]').last(), /moyen=/);
    await remplirCoordonnees();
    await poserCourant('paiement-achat');

    // Le règlement accepté renvoie sur la MÊME adresse, débarrassée de son
    // `moyen` : c'est la disparition du paramètre qui signale le succès, et
    // un échec de saisie ramènerait au contraire un `champs=`.
    await franchir(
      pageP.getByRole('button', { name: /^Payer /i }).first(),
      (u) => u.pathname.includes('/paiement/') && !u.search.includes('moyen='),
    );
    await poserCourant('paiement-achat-confirme');
  } catch (erreur) {
    console.log(`  ⚠ tunnel d'achat, arrêté sur ${new URL(pageP.url()).pathname} : ${erreur.message.split('\n')[0]}`);
  }

  // ── Tunnel d'abonnement, et son jumeau associatif ─────────────────────
  await capturer(pageP, '/fr/abonnement/souscrire', 'abonnement-choix-formule');
  await capturer(pageP, '/fr/abonnement/souscrire?domaine=association', 'adhesion-choix-formule');
  await capturer(pageP, '/fr/abonnement/souscrire?offre=lecture-annuel', 'abonnement-choix-moyen');

  try {
    await franchir(pageP.locator('a[href*="moyen="]').last(), /moyen=/);
    await remplirCoordonnees();
    await poserCourant('abonnement-paiement');

    await franchir(pageP.getByRole('button', { name: /^(Souscrire|Adhérer)$/i }).first(), /fait=/);
    await poserCourant('abonnement-confirme');
  } catch (erreur) {
    console.log(`  ⚠ souscription, arrêtée sur ${new URL(pageP.url()).pathname} : ${erreur.message.split('\n')[0]}`);
  }

  // Repris APRÈS les deux tunnels : c'est l'espace personnel garni qui vaut
  // d'être montré, pas celui d'un compte qui vient de naître.
  await capturer(pageP, '/fr/compte', 'compte-tableau-de-bord-garni');
  await capturer(pageP, '/fr/compte/bibliotheque', 'compte-bibliotheque');
  await capturer(pageP, '/fr/compte/abonnement', 'compte-abonnement');
  /*
   * LE LECTEUR SE PHOTOGRAPHIE SUR UN TITRE DONT LES PAGES SONT DE VRAIES
   * IMAGES.
   *
   * Les contes du jeu de démonstration portent des pages de 44 octets — un
   * pixel transparent. Le lecteur les affiche correctement : le cadre est
   * vide parce que l'image l'est, et la capture ressemble alors à une panne
   * de rendu qui n'existe pas. `zaku`, ingéré pour de bon, porte ses planches
   * ; il est de surcroît `gratuit`, donc lisible sans droit particulier.
   */
  try {
    await pageP.goto(`${BASE}/fr/lire/${process.env.CAPTURE_SLUG_LECTURE ?? 'la-riviere-qui-parlait'}`, {
      waitUntil: 'networkidle',
    });
    await pageP.locator('article img').first().waitFor({ state: 'visible', timeout: 45000 });
    // L'image arrive derrière une URL signée, bien après que le réseau s'est tu.
    await pageP
      .waitForFunction(
        () => {
          const image = document.querySelector('article img');
          return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 1;
        },
        { timeout: 45000 },
      )
      .catch(() => {});
    await poserCourant('lecteur-en-ligne');
  } catch (erreur) {
    console.log(`  ⚠ lecteur : ${erreur.message.split('\n')[0]}`);
  }
}

/* ───────────────────── 3. Administration et console /dev ───────────────────── */
console.log('\n── Administration ──');
const pageAd = await (await contexteBureau(navigateur)).newPage();

if (await connecter(pageAd, ADMIN)) {
  const ID_CONTE = process.env.CAPTURE_ID_CONTE ?? '501696e5-7525-4303-be36-fb8331d8731f';
  const ID_LIVRET = process.env.CAPTURE_ID_LIVRET ?? '61e58571-ead2-4a60-b1d9-a2d31d3fa886';

  const ADMINISTRATION = [
    ['/fr/admin', 'admin-accueil'],
    ['/fr/admin/contes', 'admin-contes'],
    [`/fr/admin/contes/${ID_CONTE}`, 'admin-conte-detail'],
    ['/fr/admin/contes/nouveau', 'admin-conte-nouveau'],
    ['/fr/admin/livrets', 'admin-livrets'],
    [`/fr/admin/contes/${ID_LIVRET}`, 'admin-livret-detail'],
    ['/fr/admin/livrets/nouveau', 'admin-livret-nouveau'],
    ['/fr/admin/commandes', 'admin-commandes'],
    ['/fr/admin/abonnements', 'admin-abonnements'],
    ['/fr/admin/offres', 'admin-offres'],
    ['/fr/admin/promos', 'admin-promos'],
    ['/fr/admin/avis', 'admin-avis'],
    ['/fr/admin/temoignages', 'admin-temoignages'],
    ['/fr/admin/utilisateurs', 'admin-utilisateurs'],
    ['/fr/admin/association', 'admin-association'],
  ];
  for (const [chemin, nom] of ADMINISTRATION) await capturer(pageAd, chemin, nom);

  /*
   * La console de simulation se remplit APRÈS le rendu, par deux `fetch`.
   * `networkidle` revient avant eux : photographiée trop tôt, elle montre six
   * sections vides et une horloge à « … », ce qui ressemble à une console en
   * panne alors qu'elle est seulement en train de se peupler.
   */
  await pageAd.goto(`${BASE}/dev`, { waitUntil: 'networkidle' }).catch(() => {});
  await pageAd
    .waitForFunction(() => !(document.body.textContent ?? '').includes('métier : …'), {
      timeout: 30000,
    })
    .catch(() => {});
  journal.push({
    fichier: await poser(pageAd, 'console-simulation'),
    chemin: '/dev',
    nom: 'console-simulation',
    statut: 'ok',
  });
  console.log('  ✓ console-simulation             /dev');
}

await navigateur.close().catch(() => {});

writeFileSync(join(SORTIE, 'inventaire.json'), `${JSON.stringify(journal, null, 2)}\n`);

const soucis = journal.filter((e) => e.statut !== 'ok');
console.log(`\n${journal.length} captures dans ${SORTIE}/`);
console.log(soucis.length ? `${soucis.length} écran(s) à regarder :` : 'Aucun écran en défaut.');
for (const s of soucis) console.log(`  ${s.nom} — ${s.statut}`);
