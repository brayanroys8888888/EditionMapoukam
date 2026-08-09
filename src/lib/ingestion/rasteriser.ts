import { readFile } from 'node:fs/promises';

import { logger } from '@/lib/logger';

/**
 * RASTERISATION D'UN PDF SANS POPPLER — le chemin des environnements serverless.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉFAUT QUE CE MODULE CORRIGE, ET POURQUOI IL ÉTAIT INVISIBLE.        │
 * │                                                                          │
 * │ Le repli précédent appelait `sharp(cheminPdf, { page })`. sharp s'appuie  │
 * │ sur libvips, et libvips NE LIT LE PDF QUE s'il a été compilé avec poppler │
 * │ ou pdfium — ce qui n'est pas le cas des binaires distribués par npm.      │
 * │                                                                          │
 * │ Vérifiable en une ligne, et sans appel réseau :                          │
 * │                                                                          │
 * │     sharp.format.pdf.input → { file: false, buffer: false, stream: false }│
 * │                                                                          │
 * │ Le repli ne pouvait donc PAS fonctionner. En local il ne s'exécutait      │
 * │ jamais — poppler est installé, la branche n'était pas prise — et en ligne │
 * │ il levait à chaque conte. Un repli qu'aucun environnement de              │
 * │ développement n'emprunte est un repli que personne n'éprouve.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI pdf.js, ET SOUS QUELLE LICENCE.                                │
 * │                                                                          │
 * │ Rasteriser un PDF demande un interpréteur complet : polices, chemins      │
 * │ vectoriels, transparence, espaces colorimétriques. `pdf-lib` sait lire la │
 * │ STRUCTURE d'un document — compter ses pages, lire ses métadonnées — mais  │
 * │ ne dessine rien. C'est ce malentendu qui a produit le repli cassé.        │
 * │                                                                          │
 * │ `pdfjs-dist` est sous **Apache-2.0** et `@napi-rs/canvas` sous **MIT** :  │
 * │ deux licences permissives, conformes à la règle du projet. Ni l'une ni    │
 * │ l'autre n'est copyleft, et aucune ne s'approche de l'AGPL qui vaut à      │
 * │ PyMuPDF et ebooklib leur interdiction — c'est précisément la raison pour  │
 * │ laquelle ces deux-là sont écartées alors qu'elles feraient le même        │
 * │ travail.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE N'EST PAS LE CHEMIN PRINCIPAL, ET NE DOIT PAS LE DEVENIR.     │
 * │                                                                          │
 * │ poppler reste préféré partout où il existe : c'est un rendu natif, plus   │
 * │ rapide et de meilleure fidélité typographique. Ceci est la roue de        │
 * │ secours — celle qu'on emprunte quand le binaire est absent, c'est-à-dire  │
 * │ en serverless.                                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Vrai si la rasterisation logicielle est utilisable dans cet environnement. */
export async function rasteriseurDisponible(): Promise<boolean> {
  try {
    await import('pdfjs-dist/legacy/build/pdf.mjs');
    await import('@napi-rs/canvas');
    return true;
  } catch {
    return false;
  }
}

/**
 * Charge un document une seule fois, pour en rendre plusieurs pages.
 *
 * Rouvrir le PDF à chaque page ferait réanalyser la table des polices et des
 * objets à chaque fois — sur un album de quarante pages, c'est quarante fois le
 * même travail.
 */
async function ouvrir(cheminPdf: string): Promise<TacheChargement> {
  /*
   * La construction `legacy` et non la moderne : elle vise Node et n'exige ni
   * `DOMMatrix`, ni `Path2D`, ni les autres objets que pdf.js attend d'un
   * navigateur. La construction moderne échoue au chargement sous Node, avec
   * un message qui ne dit pas qu'il s'agit d'un problème d'environnement.
   */
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const donnees = new Uint8Array(await readFile(cheminPdf));

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA VERSION EST LA PROTECTION, ET IL N'Y A PAS DE DRAPEAU À POSER.    │
   * │                                                                      │
   * │ pdf.js a porté un avis de sécurité HAUTE : exécution de JavaScript    │
   * │ arbitraire à l'ouverture d'un PDF forgé (GHSA-hq66-cqwq-w95j,         │
   * │ >= 5.6.83 et < 6.2.108). Ce projet ingère des fichiers déposés — la   │
   * │ surface la moins fiable du produit — donc la version corrigée n'est   │
   * │ pas négociable. `package.json` exige >= 6.2.108.                      │
   * │                                                                      │
   * │ Le réflexe serait d'ajouter `isEvalSupported: false` par précaution.  │
   * │ L'option N'EXISTE PLUS en 6 : le chemin fondé sur `eval` a été retiré │
   * │ purement et simplement, et c'est justement en quoi consiste le        │
   * │ correctif. L'écrire ne protégerait de rien et laisserait croire que   │
   * │ la sécurité tient à un réglage plutôt qu'à la version.                │
   * │                                                                      │
   * │ `useSystemFonts: false`, lui, existe et sert : il interdit d'aller    │
   * │ chercher une police sur le système ou le réseau. Un serveur qui       │
   * │ télécharge une ressource pour dessiner un conte est une dépendance    │
   * │ réseau invisible, et une fuite sur ce qu'il traite.                   │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  return pdfjs.getDocument({
    data: donnees,
    useSystemFonts: false,
  }) as unknown as TacheChargement;
}

/**
 * Rend une page en PNG, à la largeur demandée.
 *
 * L'échelle est calculée depuis la largeur voulue plutôt que fixée en points
 * par pouce : c'est la largeur en pixels qui fait la qualité de lecture à
 * l'écran, et elle doit être la même quelle que soit la taille du papier
 * d'origine — un album à l'italienne et un format portrait doivent produire des
 * images comparables.
 */
export async function rasteriserPage(
  cheminPdf: string,
  numero: number,
  largeurCible: number,
): Promise<Buffer> {
  const tache = await ouvrir(cheminPdf);
  try {
    return await dessiner(await tache.promise, numero, largeurCible);
  } finally {
    /*
     * `destroy()` vit sur la TÂCHE DE CHARGEMENT, pas sur le document.
     *
     * Le document rendu par `tache.promise` n'expose que `cleanup()`, qui vide
     * les caches sans libérer le contexte de travail. Appeler `destroy()` sur
     * lui lève « is not a function » — vérifié sur pdf.js 6. Sans cette
     * libération, un serveur de longue durée accumule un contexte par document
     * ouvert, et l'ingestion est justement ce qui en ouvre le plus.
     */
    await tache.destroy();
  }
}

/**
 * Rend toutes les pages, en ne gardant qu'une image en mémoire à la fois.
 *
 * Le rappel reçoit chaque page dès qu'elle est prête, exactement comme le
 * chemin poppler : un album de quarante pages en deux résolutions ne tient pas
 * en mémoire, et c'est ce qui a déjà fait tomber le processus de rendu.
 */
export async function rasteriserToutesLesPages(
  cheminPdf: string,
  nbPages: number,
  largeurCible: number,
  traiter: (numero: number, png: Buffer) => Promise<void>,
): Promise<void> {
  const tache = await ouvrir(cheminPdf);

  try {
    const document = await tache.promise;

    if (document.numPages !== nbPages) {
      logger.warn('Nombre de pages divergent entre analyse et rendu', {
        analyse: nbPages,
        rendu: document.numPages,
      });
    }

    // La borne est celle du DOCUMENT, pas celle qu'on nous annonce : rendre une
    // page inexistante lèverait, et l'analyse a pu être faite par un autre
    // outil que celui qui dessine.
    const total = Math.min(nbPages, document.numPages);

    for (let numero = 1; numero <= total; numero += 1) {
      await traiter(numero, await dessiner(document, numero, largeurCible));
    }
  } finally {
    await tache.destroy();
  }
}

/** Dessine une page d'un document déjà ouvert. */
async function dessiner(
  document: DocumentPdf,
  numero: number,
  largeurCible: number,
): Promise<Buffer> {
  const { createCanvas } = await import('@napi-rs/canvas');

  const page = await document.getPage(numero);

  // L'échelle 1 donne la taille en points typographiques ; on en déduit le
  // facteur qui amène la page à la largeur voulue en pixels.
  const naturelle = page.getViewport({ scale: 1 });
  const echelle = largeurCible / naturelle.width;
  const vue = page.getViewport({ scale: echelle });

  const canvas = createCanvas(Math.ceil(vue.width), Math.ceil(vue.height));
  const contexte = canvas.getContext('2d');

  /*
   * FOND BLANC POSÉ EXPLICITEMENT.
   *
   * Un canvas neuf est TRANSPARENT, et un PDF ne peint pas son propre fond. En
   * PNG le résultat serait donc une page dont les blancs sont des trous — ce
   * qui ne se voit pas sur un visualiseur à fond clair, et saute aux yeux dès
   * que la page est posée sur autre chose. Le papier est blanc ; on le dessine.
   */
  contexte.fillStyle = '#ffffff';
  contexte.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    // Le contexte de `@napi-rs/canvas` implémente la même interface que celui
    // d'un navigateur ; pdf.js ne fait pas la différence. Le typage, lui, ne
    // peut pas l'exprimer sans faire dépendre l'un de l'autre.
    canvasContext: contexte,
    viewport: vue,
    // pdf.js 6 veut aussi la surface elle-même, et pas seulement son contexte.
    canvas,
  }).promise;

  // La page est rendue : ses ressources n'ont plus de raison d'être retenues.
  page.cleanup();

  return canvas.toBuffer('image/png');
}

/*
 * Le peu de l'interface de pdf.js dont ce module se sert.
 *
 * Déclaré ici plutôt qu'importé de `pdfjs-dist` : le module est chargé par
 * `await import()` — il ne doit pas peser sur le démarrage, ni sur les
 * environnements qui n'en ont pas besoin — et un `import type` depuis un paquet
 * à exports conditionnels ne se résout pas de la même façon selon la cible.
 * Ces trois signatures suffisent, et un changement d'API les casserait ici,
 * franchement, plutôt qu'à l'exécution.
 */
interface TacheChargement {
  promise: Promise<DocumentPdf>;
  destroy: () => Promise<void>;
}

interface DocumentPdf {
  numPages: number;
  getPage: (n: number) => Promise<PagePdf>;
}

interface PagePdf {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: unknown;
    viewport: unknown;
    canvas: unknown;
  }) => { promise: Promise<void> };
  cleanup: () => void;
}
