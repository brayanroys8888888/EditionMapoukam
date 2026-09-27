#!/usr/bin/env node
/**
 * LE MOTEUR PDF DU NAVIGATEUR, COPIÉ SOUS `public/`.
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UNE COPIE, ET POURQUOI ELLE N'EST PAS VERSIONNÉE.                │
 * │                                                                            │
 * │ L'aperçu de couverture de l'écran d'ajout rend la première page du PDF     │
 * │ choisi, dans le navigateur, avec `@hyzyla/pdfium`. Son WebAssembly pèse    │
 * │ quatre mégaoctets et doit être SERVI par l'application : un module chargé  │
 * │ depuis `node_modules` n'est pas atteignable par le navigateur.             │
 * │                                                                            │
 * │ Le versionner ferait entrer quatre mégaoctets de binaire dans l'histoire   │
 * │ du dépôt — définitivement, et à chaque montée de version du paquet. Il est │
 * │ donc ignoré par git et recopié ici, ce qui a un second effet : la copie ne │
 * │ peut plus diverger du JavaScript qui la pilote.                            │
 * │                                                                            │
 * │ `tests/unit/apercu-couverture.test.ts` compare les deux empreintes : si    │
 * │ cette copie cessait d'être faite, l'aperçu dirait « fichier illisible »    │
 * │ d'un PDF parfaitement valable, et rien d'autre ne le signalerait.          │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Branché sur `postinstall` ET sur `prebuild` : le premier sert au poste de
 * développement, le second au déploiement, où l'on croise des installations
 * lancées avec `--ignore-scripts`.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SOURCE = resolve('node_modules/@hyzyla/pdfium/dist/pdfium.wasm');
const CIBLE = resolve('public/wasm/pdfium.wasm');

if (!existsSync(SOURCE)) {
  /*
   * Pas une erreur fatale : `postinstall` tourne aussi dans des contextes où
   * les dépendances optionnelles n'ont pas été installées. Faire échouer
   * l'installation entière pour un aperçu serait disproportionné — le test,
   * lui, échouera et dira quoi faire.
   */
  console.warn('copier-wasm : @hyzyla/pdfium introuvable, copie ignorée.');
  process.exit(0);
}

if (existsSync(CIBLE) && statSync(CIBLE).size === statSync(SOURCE).size) {
  process.exit(0);
}

mkdirSync(dirname(CIBLE), { recursive: true });
copyFileSync(SOURCE, CIBLE);
console.log(`copier-wasm : pdfium.wasm copié (${String(statSync(CIBLE).size)} octets).`);
