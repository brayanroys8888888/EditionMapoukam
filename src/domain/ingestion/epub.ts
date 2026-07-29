import JSZip from 'jszip';

/**
 * EPUB à mise en page fixe — §7.4.2 voie B, §7.4.3 étape 4.
 *
 * Module PUR : il reçoit des images déjà rendues et un texte déjà normalisé, et
 * rend un fichier en mémoire. Aucun accès disque, aucun sous-processus, aucune
 * base — donc testable sans rien démarrer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ASSEMBLÉ À LA MAIN, ET C'EST UNE CONTRAINTE DE LICENCE.                  │
 * │                                                                          │
 * │ CLAUDE.md : « Ne jamais introduire PyMuPDF ni ebooklib : elles sont sous │
 * │ AGPL, ce qui contaminerait une application exposée en réseau. » Les      │
 * │ bibliothèques EPUB courantes tombent sous cette interdiction. La         │
 * │ structure est donc écrite ici, à partir de la spécification EPUB 3, avec │
 * │ pour seule dépendance JSZip (MIT) — qui ne fait que du zip.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * §7.4.2 énonce la limite de la voie B et son correctif, qui est la raison
 * d'être de la moitié de ce module : « un EPUB à mise en page fixe ne permet ni
 * synthèse vocale ni agrandissement libre du texte. Correctif technique appliqué
 * systématiquement lorsque le PDF source contient une couche texte : le texte de
 * chaque page est extrait et inséré dans un bloc masqué visuellement mais
 * accessible aux lecteurs d'écran et à la recherche. »
 */

/**
 * Format des images embarquées.
 *
 * JPEG, et non WebP — alors que les pages servies en ligne sont en WebP.
 *
 * Le choix n'est pas une incohérence : les deux sorties n'ont pas le même
 * lecteur. En ligne, c'est un navigateur récent, et WebP y pèse nettement moins
 * lourd sur les connexions lentes visées par §5.1. L'EPUB, lui, est décrit par
 * §7.4.2 comme « redistribuable » et « accepté par les principaux distributeurs
 * de livres numériques » : il doit s'ouvrir partout, y compris sur les
 * liseuses et les chaînes de distribution anciennes. WebP n'est un type
 * autorisé que depuis EPUB 3.3, et reste mal pris en charge en dehors des
 * lecteurs récents. JPEG l'est depuis toujours.
 */
export const IMAGE_EPUB = {
  mediaType: 'image/jpeg',
  extension: 'jpg',
} as const;

export interface PageEpub {
  numero: number;
  /** Image de la page, encodée selon `IMAGE_EPUB`. */
  image: Buffer;
  largeur: number;
  hauteur: number;
  /** Couche texte normalisée. Vide si le PDF source n'en avait pas (§7.4.4). */
  texte: string;
}

export interface MetadonneesEpub {
  titre: string;
  auteur: string;
  langue: 'fr' | 'en';
  /** Identifiant stable du livre. Sert d'`dc:identifier` sous forme d'URN. */
  identifiant: string;
  /**
   * Instant de modification, au format `dcterms:modified`.
   *
   * Fourni par l'appelant, jamais lu ici : la lecture directe de l'heure est
   * interdite dans `src/domain`, et vérifiée par un test qui parcourt les
   * sources. Le temps passe par l'horloge injectable, pour que la console de
   * simulation puisse le déplacer et que les tests soient déterministes.
   */
  modifieLe: Date;
}

/**
 * Échappement XML.
 *
 * Indispensable, et pas théorique : les titres du corpus contiennent des
 * apostrophes (« Anansi l'araignée maligne ») et le texte des contes contient
 * des guillemets. Un `&` non échappé rend le fichier non conforme, et un
 * lecteur strict refuse alors d'ouvrir le livre entier.
 *
 * L'ordre compte : `&` en premier, sans quoi on échapperait les `&` que l'on
 * vient soi-même d'introduire.
 */
export function echapperXml(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Horodatage au format exigé par `dcterms:modified`.
 *
 * EPUB 3 impose `AAAA-MM-JJTHH:MM:SSZ`, à la seconde, sans millisecondes.
 * `toISOString()` en produit, et un validateur les refuse.
 */
export function horodatageEpub(instant: Date): string {
  return `${instant.toISOString().slice(0, 19)}Z`;
}

/** Nom de fichier d'une page, numéroté sur trois chiffres. */
function nomDePage(numero: number): string {
  return `page-${String(numero).padStart(3, '0')}`;
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

/**
 * Feuille de style.
 *
 * Deux rôles, et le second est celui qui compte.
 *
 * La règle `.texte-accessible` est le correctif d'accessibilité de §7.4.2. Le
 * texte est retiré de l'affichage sans être retiré du document : il reste dans
 * l'arbre d'accessibilité, donc lisible par une synthèse vocale, et trouvable
 * par la recherche du lecteur. `display: none` aurait été plus simple et
 * AURAIT TOUT CASSÉ — cette propriété retire l'élément de l'arbre
 * d'accessibilité, et le lecteur d'écran ne le voit plus du tout. C'est
 * exactement le piège que ce module doit éviter.
 */
const STYLE = `@charset "utf-8";

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
}

img.page {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.texte-accessible {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: normal;
  border: 0;
}
`;

/** Bloc de texte masqué mais accessible, ou rien si la page est muette. */
function blocAccessible(texte: string): string {
  const paragraphes = texte
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphes.length === 0) return '';

  const corps = paragraphes
    .map((p) => `      <p>${echapperXml(p)}</p>`)
    .join('\n');

  return `\n    <div class="texte-accessible">\n${corps}\n    </div>`;
}

/**
 * Document XHTML d'une page.
 *
 * La balise `viewport` porte les dimensions en pixels de l'image : c'est elle
 * qui donne son sens à la mise en page fixe. Sans elle, un lecteur ne sait pas
 * à quelle échelle composer la page et retombe sur un rendu redistribué, ce qui
 * annule tout l'intérêt de la voie B.
 */
function xhtmlPage(page: PageEpub, langue: string): string {
  const nom = nomDePage(page.numero);
  const etiquette = langue === 'en' ? `Page ${String(page.numero)}` : `Page ${String(page.numero)}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${langue}" lang="${langue}">
  <head>
    <meta charset="utf-8"/>
    <title>${echapperXml(etiquette)}</title>
    <meta name="viewport" content="width=${String(page.largeur)}, height=${String(page.hauteur)}"/>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <img class="page" src="images/${nom}.${IMAGE_EPUB.extension}" alt="${echapperXml(etiquette)}" width="${String(page.largeur)}" height="${String(page.hauteur)}"/>${blocAccessible(page.texte)}
  </body>
</html>
`;
}

/** Sommaire de navigation, obligatoire en EPUB 3. */
function navigation(pages: readonly PageEpub[], meta: MetadonneesEpub): string {
  const entrees = pages
    .map(
      (page) =>
        `        <li><a href="${nomDePage(page.numero)}.xhtml">Page ${String(page.numero)}</a></li>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${meta.langue}" lang="${meta.langue}">
  <head>
    <meta charset="utf-8"/>
    <title>${echapperXml(meta.titre)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>${echapperXml(meta.titre)}</h1>
      <ol>
${entrees}
      </ol>
    </nav>
  </body>
</html>
`;
}

/**
 * Métadonnées d'accessibilité.
 *
 * Elles décrivent le livre TEL QU'IL EST, et changent donc selon que le PDF
 * source portait une couche texte ou non (§7.4.4). Annoncer `textual` sur un
 * album muet serait une fausse déclaration : un lecteur malvoyant choisirait le
 * titre sur cette foi et n'y trouverait rien à écouter.
 */
function accessibilite(avecTexte: boolean): string {
  if (!avecTexte) {
    return `    <meta property="schema:accessMode">visual</meta>
    <meta property="schema:accessModeSufficient">visual</meta>
    <meta property="schema:accessibilityHazard">none</meta>
    <meta property="schema:accessibilitySummary">Livre à mise en page fixe composé d’images de pages. Le PDF source ne comportait pas de couche texte : aucun texte n’est disponible pour la synthèse vocale.</meta>`;
  }

  return `    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessMode">visual</meta>
    <meta property="schema:accessModeSufficient">textual</meta>
    <meta property="schema:accessModeSufficient">visual</meta>
    <meta property="schema:accessibilityFeature">alternativeText</meta>
    <meta property="schema:accessibilityFeature">readingOrder</meta>
    <meta property="schema:accessibilityHazard">none</meta>
    <meta property="schema:accessibilitySummary">Livre à mise en page fixe. Le texte de chaque page est intégré sous forme accessible aux lecteurs d’écran et à la recherche.</meta>`;
}

/**
 * Manifeste du paquet.
 *
 * `rendition:layout = pre-paginated` est la déclaration qui fait de ce fichier
 * un EPUB à mise en page fixe plutôt qu'un EPUB redistribué. C'est la voie B de
 * §7.4.2 en une ligne.
 */
function packageOpf(pages: readonly PageEpub[], meta: MetadonneesEpub): string {
  const images = pages
    .map(
      (page) =>
        `    <item id="img-${nomDePage(page.numero)}" href="images/${nomDePage(page.numero)}.${IMAGE_EPUB.extension}" media-type="${IMAGE_EPUB.mediaType}"${page.numero === 1 ? ' properties="cover-image"' : ''}/>`,
    )
    .join('\n');

  const documents = pages
    .map(
      (page) =>
        `    <item id="${nomDePage(page.numero)}" href="${nomDePage(page.numero)}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('\n');

  const dos = pages
    .map((page) => `    <itemref idref="${nomDePage(page.numero)}"/>`)
    .join('\n');

  const avecTexte = pages.some((page) => page.texte.trim().length > 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${meta.langue}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:${echapperXml(meta.identifiant)}</dc:identifier>
    <dc:title>${echapperXml(meta.titre)}</dc:title>
    <dc:language>${meta.langue}</dc:language>
    <dc:creator>${echapperXml(meta.auteur)}</dc:creator>
    <meta property="dcterms:modified">${horodatageEpub(meta.modifieLe)}</meta>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">auto</meta>
${accessibilite(avecTexte)}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style.css" media-type="text/css"/>
${images}
${documents}
  </manifest>
  <spine>
${dos}
  </spine>
</package>
`;
}

/**
 * Assemble l'EPUB.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `mimetype` DOIT ÊTRE LA PREMIÈRE ENTRÉE DU ZIP, ET NON COMPRESSÉE.       │
 * │                                                                          │
 * │ La spécification OCF l'exige. C'est ce qui permet de reconnaître un EPUB │
 * │ en lisant les trente premiers octets du fichier, sans le décompresser.   │
 * │ Compressée, ou placée ailleurs, l'archive reste un zip valide et         │
 * │ s'ouvrira très bien à la main — mais un lecteur strict la rejettera, et  │
 * │ un distributeur la refusera. C'est une erreur silencieuse à la           │
 * │ fabrication, bruyante à la publication.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function assemblerEpub(
  pages: readonly PageEpub[],
  meta: MetadonneesEpub,
): Promise<Buffer> {
  if (pages.length === 0) {
    throw new Error('EPUB refusé : aucune page à assembler.');
  }

  const zip = new JSZip();

  // Première entrée, et sans compression. JSZip conserve l'ordre d'insertion.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', CONTAINER);
  zip.file('EPUB/package.opf', packageOpf(pages, meta));
  zip.file('EPUB/nav.xhtml', navigation(pages, meta));
  zip.file('EPUB/style.css', STYLE);

  for (const page of pages) {
    const nom = nomDePage(page.numero);
    zip.file(`EPUB/${nom}.xhtml`, xhtmlPage(page, meta.langue));
    zip.file(`EPUB/images/${nom}.${IMAGE_EPUB.extension}`, page.image);
  }

  return await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
