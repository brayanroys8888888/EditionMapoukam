/**
 * Capture l'accueil réel ET la maquette, à la même largeur, pour comparaison.
 *
 * Script d'atelier : il ne fait partie ni du produit ni de la porte de
 * validation. Il vit sous `scripts/` pour que `@playwright/test` se résolve.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SORTIE = resolve('.captures');
mkdirSync(SORTIE, { recursive: true });

const LARGEUR = 1440;

const navigateur = await chromium.launch();

async function capturer(nom, aller, { theme, defilement = 0 } = {}) {
  const contexte = await navigateur.newContext({
    viewport: { width: LARGEUR, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await contexte.newPage();
  if (theme) {
    await contexte.addCookies([
      { name: 'em_theme', value: theme, url: 'http://localhost:3000' },
    ]);
  }
  await aller(page);
  await page.waitForTimeout(1200);
  if (defilement > 0) {
    await page.evaluate((y) => {
      globalThis.scrollTo(0, y);
    }, defilement);
    // Les révélations au défilement ont 700 ms : on les laisse finir.
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: resolve(SORTIE, `${nom}.png`), fullPage: false });
  await contexte.close();
  console.log('→', nom);
}

await capturer('app-accueil-clair', (p) =>
  p.goto('http://localhost:3000/fr', { waitUntil: 'networkidle' }),
);

await capturer(
  'app-accueil-sombre',
  (p) => p.goto('http://localhost:3000/fr', { waitUntil: 'networkidle' }),
  { theme: 'dark' },
);

const MAQUETTE = `file:///${resolve('design_handoff_edition_mapoukam/Site EditionMapoukam.dc.html').replace(/\\/g, '/')}`;

await capturer('maquette-accueil', (p) => p.goto(MAQUETTE, { waitUntil: 'load' }));

/* Les sections suivantes de l'accueil, des deux côtés, à la même hauteur. */
for (const y of [1000, 1900, 2800]) {
  await capturer(`app-accueil-${String(y)}`, (p) =>
    p.goto('http://localhost:3000/fr', { waitUntil: 'networkidle' }),
    { defilement: y },
  );
  await capturer(`maquette-accueil-${String(y)}`, (p) => p.goto(MAQUETTE, { waitUntil: 'load' }), {
    defilement: y,
  });
}

await navigateur.close();
