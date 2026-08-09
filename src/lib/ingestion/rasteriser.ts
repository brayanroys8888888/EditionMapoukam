import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import { logger } from '@/lib/logger';

/**
 * RASTERISATION D'UN PDF SANS POPPLER — le chemin des environnements serverless.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS MOTEURS ESSAYÉS, ET POURQUOI C'EST LE TROISIÈME QUI TIENT.        │
 * │                                                                          │
 * │ 1. `sharp` — ne lit PAS le PDF. libvips n'a le support PDF que compilé   │
 * │    avec poppler ou pdfium, ce que les binaires npm ne sont pas :         │
 * │    `sharp.format.pdf.input` vaut `{ file: false, buffer: false }`.       │
 * │    Le repli d'origine ne pouvait donc pas fonctionner.                   │
 * │                                                                          │
 * │ 2. `pdf.js` + `@napi-rs/canvas` — fonctionne en local, échoue en ligne.  │
 * │    `@napi-rs/canvas` est un module NATIF dont le `requireNative()`       │
 * │    choisit son binaire À L'EXÉCUTION, dans des branches sur              │
 * │    `process.platform`, et lance `ldd --version` pour distinguer glibc de │
 * │    musl. Aucune analyse statique ne suit cela : le traceur de fichiers   │
 * │    laissait le binaire hors du paquet. `outputFileTracingIncludes` n'y a │
 * │    rien changé — mesuré en production, deux fois.                        │
 * │                                                                          │
 * │ 3. `@hyzyla/pdfium` — WebAssembly. **Aucun binaire natif, donc aucune    │
 * │    résolution de plateforme.** Le même `.wasm` tourne sur Windows, sur   │
 * │    Linux, en x64 comme en arm64. Il n'y a plus rien à embarquer          │
 * │    correctement, donc plus rien à embarquer de travers.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA LICENCE A ÉCARTÉ LE CANDIDAT LE PLUS ÉVIDENT.                        │
 * │                                                                          │
 * │ `mupdf` rasterise très bien, et il est sous **AGPL-3.0** : exactement ce │
 * │ qui vaut à PyMuPDF et ebooklib leur interdiction dans ce projet, parce   │
 * │ qu'elle contaminerait une application exposée en réseau.                 │
 * │                                                                          │
 * │ `@hyzyla/pdfium` est sous **MIT**, et PDFium lui-même sous BSD. Rien à   │
 * │ arbitrer.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE N'EST PAS LE CHEMIN PRINCIPAL.                                │
 * │                                                                          │
 * │ poppler reste préféré partout où il existe : rendu natif, plus rapide.   │
 * │ Ceci est la roue de secours — celle qu'on emprunte quand le binaire est  │
 * │ absent, c'est-à-dire en serverless.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le peu de l'interface de `@hyzyla/pdfium` dont ce module se sert. */
interface Bibliotheque {
  loadDocument: (donnees: Buffer) => Promise<Document>;
  destroy: () => void;
}

interface Document {
  getPageCount: () => number;
  getPage: (index: number) => Page;
  destroy: () => void;
}

interface Page {
  getOriginalSize: () => { originalWidth: number; originalHeight: number };
  render: (options: { scale: number; render: 'bitmap' }) => Promise<{
    data: Uint8Array;
    width: number;
    height: number;
  }>;
}

/**
 * Charge le moteur, en distinguant « absent » de « en panne ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CETTE DISTINCTION MÉRITE DU CODE.                              │
 * │                                                                          │
 * │ Un moteur ABSENT et un moteur qui ÉCHOUE demandent deux gestes opposés.  │
 * │ Le premier est un défaut de déploiement, et aucun changement de PDF n'y  │
 * │ fera rien. Le second est un document que le moteur ne sait pas dessiner. │
 * │                                                                          │
 * │ Confondus, ils rendaient le même « rendu impossible », et l'éditeur      │
 * │ redéposait indéfiniment un fichier parfaitement valide. C'est ce qui     │
 * │ s'est produit, et c'est ce que ce message a fini par trancher.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function chargerMoteur(): Promise<Bibliotheque> {
  try {
    // Le paquet porte ses propres types : aucune assertion à poser ici.
    const { PDFiumLibrary } = await import('@hyzyla/pdfium');
    return await PDFiumLibrary.init();
  } catch (cause) {
    throw new Error(
      `moteur_de_rendu_absent : @hyzyla/pdfium n'a pas pu être chargé.`,
      { cause },
    );
  }
}

/** Vrai si la rasterisation logicielle est utilisable dans cet environnement. */
export async function rasteriseurDisponible(): Promise<boolean> {
  try {
    (await chargerMoteur()).destroy();
    return true;
  } catch {
    return false;
  }
}

/**
 * Convertit un rendu brut en PNG.
 *
 * PDFium rend une image BRUTE en RGBA — pas un fichier, une nappe d'octets.
 * `sharp` sait la lire à condition qu'on lui dise ses dimensions et son nombre
 * de canaux, puisque rien dans les octets ne les porte.
 */
async function enPng(rendu: { data: Uint8Array; width: number; height: number }): Promise<Buffer> {
  return await sharp(Buffer.from(rendu.data), {
    raw: { width: rendu.width, height: rendu.height, channels: 4 },
  })
    /*
     * Fond BLANC aplati sous l'image.
     *
     * PDFium rend avec un canal alpha, et un PDF ne peint pas son propre fond :
     * les blancs de la page seraient donc des TROUS. Invisible sur un
     * visualiseur à fond clair, béant dès que la page est posée sur autre
     * chose. Le papier est blanc ; on le dessine.
     */
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
}

/**
 * L'échelle qui amène une page à la largeur voulue.
 *
 * Calculée depuis la largeur cible plutôt que fixée en points par pouce : c'est
 * la largeur en pixels qui fait la qualité de lecture à l'écran, et elle doit
 * être la même quel que soit le format du papier d'origine — un album à
 * l'italienne et un format portrait doivent produire des images comparables.
 */
function echellePour(page: Page, largeurCible: number): number {
  const { originalWidth } = page.getOriginalSize();
  if (!originalWidth || originalWidth <= 0) return 1;
  return largeurCible / originalWidth;
}

/** Rend une page en PNG, à la largeur demandée. */
export async function rasteriserPage(
  cheminPdf: string,
  numero: number,
  largeurCible: number,
): Promise<Buffer> {
  const bibliotheque = await chargerMoteur();
  const donnees = await readFile(cheminPdf);

  let document: Document | null = null;
  try {
    document = await bibliotheque.loadDocument(donnees);

    const page = document.getPage(numero - 1);
    const rendu = await page.render({ scale: echellePour(page, largeurCible), render: 'bitmap' });

    return await enPng(rendu);
  } finally {
    // Le WASM tient sa propre mémoire : sans libération, un serveur de longue
    // durée la garde pour chaque document ouvert.
    document?.destroy();
    bibliotheque.destroy();
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
  const bibliotheque = await chargerMoteur();
  const donnees = await readFile(cheminPdf);

  let document: Document | null = null;
  try {
    document = await bibliotheque.loadDocument(donnees);

    const reel = document.getPageCount();
    if (reel !== nbPages) {
      logger.warn('Nombre de pages divergent entre analyse et rendu', {
        analyse: nbPages,
        rendu: reel,
      });
    }

    // La borne est celle du DOCUMENT, pas celle qu'on nous annonce : rendre une
    // page inexistante lèverait, et l'analyse a pu être faite par un autre
    // outil que celui qui dessine.
    const total = Math.min(nbPages, reel);

    for (let numero = 1; numero <= total; numero += 1) {
      const page = document.getPage(numero - 1);
      const rendu = await page.render({ scale: echellePour(page, largeurCible), render: 'bitmap' });
      await traiter(numero, await enPng(rendu));
    }
  } finally {
    document?.destroy();
    bibliotheque.destroy();
  }
}
