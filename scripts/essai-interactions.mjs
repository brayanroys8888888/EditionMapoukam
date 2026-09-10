/**
 * ESSAI MANUEL DES INTERACTIONS — script d'atelier, pas un test.
 *
 * Il joue les gestes que le dossier décrit comme « vivants » et imprime ce
 * qu'il observe : ajout au panier sans rechargement, pastille optimiste,
 * toast nommant le titre, tiroir, recherche, feuille mobile.
 *
 *   node scripts/essai-interactions.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync(resolve('.captures'), { recursive: true });

const APP = 'http://localhost:3000';
const COMPTE = { email: 'utilisateur@mapoukam.fr', motDePasse: 'User123456!' };

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 1000 } });

/* ── Connexion ─────────────────────────────────────────────────────────── */
/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES SÉLECTEURS SONT PORTÉS PAR LE FORMULAIRE, ET NON PAR LA PAGE.       │
 * │                                                                          │
 * │ Sous Organic, l'authentification reçoit le chrome ENTIER — pied compris, │
 * │ donc le champ d'infolettre. Il y a dès lors DEUX `input[name="email"]`   │
 * │ dans le document, et remplir « le » champ de courriel ne veut plus rien  │
 * │ dire.                                                                    │
 * │                                                                          │
 * │ Le symptôme était trompeur au possible : la connexion échouait en        │
 * │ silence, l'essai continuait en VISITEUR, `POST /api/cart` rendait 401,   │
 * │ le composant redirigeait vers la connexion — et l'essai concluait que    │
 * │ l'ajout au panier rechargeait la page. Deux navigations, aucune          │
 * │ pastille, aucun toast : tous les symptômes d'un défaut de produit, pour  │
 * │ un défaut d'essai.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const connexion = await contexte.newPage();
await connexion.goto(`${APP}/fr/connexion`, { waitUntil: 'load' });
await connexion.waitForTimeout(1200);

const formulaire = connexion
  .locator('form')
  .filter({ has: connexion.locator('input[name="password"]') });
await formulaire.locator('input[name="email"]').fill(COMPTE.email);
await formulaire.locator('input[name="password"]').fill(COMPTE.motDePasse);

await Promise.all([
  connexion.waitForURL((u) => !u.pathname.includes('connexion'), { timeout: 30000 }),
  formulaire.locator('button[type="submit"]').click(),
]);

// La connexion DOIT avoir abouti : sans elle, tout ce qui suit mesure autre
// chose que ce qu'il annonce.
// Le CHEMIN, et non l'URL entière : la redirection de succès porte
// `?toast=connexion`, et la chercher dans la requête ferait échouer l'essai
// sur la preuve même que la connexion a réussi.
if (new URL(connexion.url()).pathname.includes('connexion')) {
  throw new Error(`Connexion refusée — ${connexion.url()}`);
}
await connexion.close();

/* Panier vidé, pour partir d'un état connu. */
await contexte.request.delete(`${APP}/api/cart`);

const page = await contexte.newPage();
await page.goto(`${APP}/fr/catalogue`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

/* Une navigation ferait échouer l'essai : on la surveille. */
let navigations = 0;
const adressesVisitees = [];
page.on('framenavigated', (frame) => {
  if (frame !== page.mainFrame()) return;
  navigations += 1;
  adressesVisitees.push(frame.url());
});

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ COMPTER LES NAVIGATIONS NE SUFFIT PAS : IL FAUT LES NOMMER.             │
 * │                                                                          │
 * │ `router.refresh()` redemande l'arbre SERVEUR de la page en place — ni le │
 * │ défilement, ni le focus, ni les champs remplis ne bougent — mais il émet │
 * │ tout de même `framenavigated` vers la MÊME adresse. Un compteur seul     │
 * │ dirait « une navigation » et laisserait croire à un rechargement.        │
 * │                                                                          │
 * │ Ce qui prouve l'absence de rechargement, c'est qu'aucune adresse         │
 * │ visitée ne DIFFÈRE de celle de départ.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const pastille = () =>
  page.evaluate(() => {
    const el = globalThis.document.querySelector('[class*="pastilleNombre"]');
    return el ? el.textContent : null;
  });

const toast = () =>
  page.evaluate(() => {
    const el = globalThis.document.querySelector('[class*="toast_toast"]');
    return el ? el.textContent : null;
  });

console.log('pastille au départ :', await pastille());

const formes = await page.evaluate(() =>
  [...globalThis.document.querySelectorAll('form')].map((x) => x.className),
);
console.log('formulaires trouvés          :', JSON.stringify(formes));

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI `force`, NI LE PREMIER BOUTON VENU.                                  │
 * │                                                                          │
 * │ `click({ force: true })` saute les contrôles d'atteignabilité mais       │
 * │ frappe quand même le point : si un élément RECOUVRE le bouton, c'est lui │
 * │ qui reçoit le clic. Ici la carte porte un lien étiré et la page un       │
 * │ en-tête collant — et `scrollIntoViewIfNeeded` place volontiers le        │
 * │ premier bouton SOUS cet en-tête. On cliquait donc le lien du titre, on   │
 * │ partait sur la fiche, et l'essai comptait une navigation.                │
 * │                                                                          │
 * │ Sans `force`, Playwright refuse un bouton couvert au lieu de mentir.     │
 * │ La carte visée est prise au MILIEU de la grille, loin de l'en-tête.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const boutons = page.locator('form[class*="formAjout"] button');
const nombreBoutons = await boutons.count();
if (nombreBoutons === 0) throw new Error('Aucun bouton d’ajout sur le catalogue.');

const ajout = boutons.nth(Math.min(3, nombreBoutons - 1));
await ajout.scrollIntoViewIfNeeded();
// Une carte tout juste amenée sous l'en-tête collant : on redescend un peu.
await page.mouse.wheel(0, -140);
await page.waitForTimeout(300);
await ajout.click();

// Sur la MÊME image que le clic : on regarde tout de suite.
await page.waitForTimeout(120);
console.log('pastille juste après le clic :', await pastille());
console.log('toast juste après le clic    :', await toast());

await page.waitForTimeout(2500);
console.log('pastille après la réponse    :', await pastille());
console.log('navigations pendant l’ajout  :', navigations);
console.log('adresses visitées            :', JSON.stringify(adressesVisitees));
const depart = `${APP}/fr/catalogue`;
console.log(
  'AUCUN changement d’adresse   :',
  adressesVisitees.every((u) => u.split('?')[0] === depart),
);

await page.screenshot({ path: resolve('.captures/essai-ajout.png') });

/* ── Deuxième clic sur le MÊME titre : le tiroir doit s'ouvrir ─────────── */
await ajout.click();
await page.waitForTimeout(2500);
const tiroirOuvert = await page.evaluate(
  () => globalThis.document.querySelector('[class*="tiroir-panier_tiroir"]') !== null,
);
console.log('tiroir ouvert au doublon     :', tiroirOuvert);
console.log('pastille après le doublon    :', await pastille());
await page.screenshot({ path: resolve('.captures/essai-doublon.png') });

await navigateur.close();
