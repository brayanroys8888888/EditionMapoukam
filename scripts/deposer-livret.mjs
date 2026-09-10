/**
 * DÉPÔT D'UN LIVRET PÉDAGOGIQUE — atelier local, jamais la production.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL PASSE PAR LA ROUTE, PAS PAR LA BASE.                                  │
 * │                                                                          │
 * │ Insérer une ligne dans `books` à la main donnerait un titre sans          │
 * │ couverture, sans pages rendues et sans EPUB : la carte afficherait un    │
 * │ substitut et le lecteur ne s'ouvrirait pas. C'est `POST                  │
 * │ /api/admin/books/ingest` qui fabrique tout cela, et c'est lui qui décide │
 * │ du support et de l'orientation.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const BASE = process.env.URL_BASE ?? 'http://localhost:3000';
const [chemin, ...reste] = process.argv.slice(2);
if (!chemin) {
  console.error(
    'usage : ORIENTATION=paysage|portrait node scripts/deposer-livret.mjs <fichier.pdf> [titre]',
  );
  process.exit(1);
}
const titre = reste.join(' ').trim();

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ORIENTATION SE DÉCLARE, ELLE NE SE DÉDUIT PAS DU FICHIER.             │
 * │                                                                          │
 * │ La tentation est forte : `pdfinfo` donne la taille de page, 842 × 595    │
 * │ dit « paysage » et 595 × 842 dit « portrait ». C'est refusé pour la      │
 * │ raison écrite dans `src/lib/admin/service.ts` — un livret porte souvent  │
 * │ une COUVERTURE portrait devant des planches paysage, et la déduction se  │
 * │ tromperait sans le dire, sur le champ qui décide de la mise en page du   │
 * │ lecteur.                                                                 │
 * │                                                                          │
 * │ Le défaut reste `paysage` : c'est la forme du cahier d'activités, celle  │
 * │ du premier livret déposé.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const orientation = process.env.ORIENTATION ?? 'paysage';
if (orientation !== 'paysage' && orientation !== 'portrait') {
  console.error(`ORIENTATION doit valoir « paysage » ou « portrait » — reçu « ${orientation} ».`);
  process.exit(1);
}

const identifiants = {
  email: process.env.ADMIN_EMAIL ?? 'admin@editionmapoukam.test',
  password: process.env.ADMIN_MOT_DE_PASSE ?? 'Adm-JL8HLFGBbdoS-7',
};

/** Les cookies de session, tels que le navigateur les renverrait. */
function cookiesDe(reponse) {
  return reponse.headers
    .getSetCookie()
    .map((brut) => brut.split(';', 1)[0])
    .join('; ');
}

const connexion = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(identifiants),
});

if (!connexion.ok) {
  console.error('connexion refusée :', connexion.status, await connexion.text());
  process.exit(1);
}

const cookie = cookiesDe(connexion);
console.log('connecté.');

/*
 * `globalThis.FormData` et `globalThis.Blob` — ce ne sont pas des precautions
 * inutiles. Ce sont des globales de Node 20, mais la configuration eslint du
 * depot ne les declare pas pour `scripts/` : ecrites nues, elles font echouer
 * `npm run lint`, donc la porte de validation entiere.
 */
const formulaire = new globalThis.FormData();
formulaire.set(
  'fichier',
  new globalThis.Blob([readFileSync(chemin)], { type: 'application/pdf' }),
  basename(chemin),
);
formulaire.set('langue', 'fr');
formulaire.set('type_document', 'livret_pedagogique');
formulaire.set('orientation', orientation);
if (titre) formulaire.set('titre', titre);

console.log('dépôt en cours — la conversion des pages prend un moment…');
const depot = await fetch(`${BASE}/api/admin/books/ingest`, {
  method: 'POST',
  headers: { cookie },
  body: formulaire,
});

const corps = await depot.text();
console.log(depot.status, corps.slice(0, 600));
