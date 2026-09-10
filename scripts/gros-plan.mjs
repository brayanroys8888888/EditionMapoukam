/**
 * GROS PLAN — la même bande de page, des deux côtés, à deux fois l'échelle.
 *
 * Script d'atelier.  `node scripts/gros-plan.mjs <nom> <cheminApp> [hauteur] [largeur]`
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync(resolve('.captures'), { recursive: true });

const [nom, cheminApp, hauteur = '200', largeur = '1440', mobile = ''] = process.argv.slice(2);
const fichier = mobile
  ? 'design_handoff_edition_mapoukam/Site EditionMapoukam Mobile.dc.html'
  : 'design_handoff_edition_mapoukam/Site EditionMapoukam.dc.html';
const maquette = `file:///${resolve(fichier).split('\\').join('/')}`;

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({
  viewport: { width: Number(largeur), height: Number(hauteur) },
  deviceScaleFactor: 2,
});

const app = await contexte.newPage();
await app.goto(`http://localhost:3000/${cheminApp}`, { waitUntil: 'load' });
await app.waitForTimeout(1000);
await app.screenshot({ path: resolve('.captures', `app-${nom}.png`) });

const proto = await contexte.newPage();
await proto.goto(maquette, { waitUntil: 'load' });
await proto.waitForTimeout(1000);
await proto.screenshot({ path: resolve('.captures', `maquette-${nom}.png`) });

await navigateur.close();
console.log('→', nom);
