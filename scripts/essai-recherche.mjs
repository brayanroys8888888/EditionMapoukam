/**
 * ESSAI DE BOUT EN BOUT — la superposition de recherche.
 *
 * Script d'atelier, comme `essai-interactions.mjs` : il ne remplace aucun test,
 * il PROUVE le comportement dans un vrai navigateur, sur le vrai serveur.
 *
 *   node scripts/essai-recherche.mjs
 *
 * Il compte les navigations : la recherche doit répondre SANS recharger la
 * page, et c'est le seul moyen honnête de le vérifier.
 *
 * Piège Playwright déjà payé : `waitUntil: 'networkidle'` expire sur ce site.
 * On attend `'load'`, puis des délais explicites.
 */
import { chromium } from '@playwright/test';

const APP = 'http://localhost:3000';

const nav = await chromium.launch();
const page = await nav.newPage({ viewport: { width: 1440, height: 1000 } });

let navigations = 0;
page.on('framenavigated', (cadre) => {
  if (cadre === page.mainFrame()) navigations += 1;
});

function dire(etiquette, valeur) {
  console.log(`   ${String(etiquette).padEnd(38)} ${valeur}`);
}

await page.goto(`${APP}/fr`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const navApresChargement = navigations;

console.log('\n── 1. La loupe ouvre la superposition ───────────────────');
await page.getByLabel(/recherch/i).first().click();
await page.waitForTimeout(500);

const panneau = page.locator('[role="dialog"]');
dire('panneau visible', await panneau.isVisible());

const boite = await panneau.boundingBox();
dire('ancré en haut de FENÊTRE (y = 0)', boite ? boite.y : '(absent)');
dire('largeur = toute la fenêtre', boite ? boite.width : '(absent)');

const champ = page.locator('[role="dialog"] input');
dire('focus au champ', await champ.evaluate((el) => el === globalThis.document.activeElement));

console.log('\n── 2. Les suggestions viennent des VRAIES facettes ───────');
const pastilles = page.locator('[role="dialog"] a[href*="themes="]');
// Les facettes arrivent par une requête : on ATTEND la première pastille avant
// de compter, sans quoi on mesure l'état d'avant la réponse — et l'on conclut
// à zéro suggestion sur un écran qui en porte six.
await pastilles.first().waitFor({ timeout: 5000 }).catch(() => {});
dire('nombre de pastilles', await pastilles.count());
dire('première', (await pastilles.first().textContent().catch(() => '(aucune)'))?.trim());

console.log('\n── 3. Les résultats arrivent pendant la frappe ───────────');
const aVide = await page.locator('[role="dialog"] a[href*="/contes/"]').count();
dire('résultats à vide', aVide);

await champ.fill('lion');
await page.waitForTimeout(900);
const resultats = page.locator('[role="dialog"] a[href*="/contes/"]');
dire('résultats pour « lion »', await resultats.count());
dire('premier titre', (await resultats.first().textContent().catch(() => '(aucun)'))?.trim().slice(0, 60));

console.log('\n── 4. Une recherche sans réponse le dit ──────────────────');
await champ.fill('zzzzzzzz');
await page.waitForTimeout(900);
dire('résultats', await page.locator('[role="dialog"] a[href*="/contes/"]').count());
const aucun = page.locator('[role="dialog"] p');
dire('message affiché', (await aucun.first().textContent().catch(() => '(aucun)'))?.trim().slice(0, 60));

console.log('\n── 5. Échap ferme, et rend le focus à la loupe ───────────');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
dire('panneau fermé', (await page.locator('[role="dialog"]').count()) === 0);
dire(
  'focus rendu à la loupe',
  await page.evaluate(() => globalThis.document.activeElement?.getAttribute('aria-label') ?? '(aucun)'),
);

console.log('\n── 6. Le raccourci ⌘K / Ctrl+K ouvre ─────────────────────');
await page.keyboard.press('Control+k');
await page.waitForTimeout(500);
dire('panneau rouvert', (await page.locator('[role="dialog"]').count()) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('\n── 7. LA PREUVE : aucun rechargement de page ─────────────');
dire('navigations pendant tout l’essai', navigations - navApresChargement);

console.log('\n── 8. Sans JavaScript, la loupe MÈNE au catalogue ────────');
const sansJs = await nav.newContext({ javaScriptEnabled: false });
const page2 = await sansJs.newPage();
await page2.goto(`${APP}/fr`, { waitUntil: 'load' });
await page2.waitForTimeout(1200);
await page2.getByLabel(/recherch/i).first().click();
await page2.waitForTimeout(1800);
dire('adresse atteinte', new URL(page2.url()).pathname);

await nav.close();
console.log('');
