import JSZip from 'jszip';

import { echapperXml } from '@/domain/ingestion/epub';
import { mentionFiligrane, type DemandeCopie } from './copie';
import type { MetadonneesCopie } from './watermark-pdf';

/**
 * Filigrane d'un EPUB — §9.4, §10.2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'EPUB EST FILIGRANÉ AUSSI, ET CE N'EST PAS ACCESSOIRE.                 │
 * │                                                                          │
 * │ L'étape s'intitule « téléchargement filigrané », mais un achat livre     │
 * │ DEUX formats (§16.1). Un EPUB nu rendrait le filigrane du PDF purement   │
 * │ décoratif : qui veut partager le livre partage le fichier qui ne porte   │
 * │ pas son adresse. Filigraner un format sur deux, c'est n'en filigraner    │
 * │ aucun.                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : des octets entrent, des octets sortent.
 *
 * Deux couches, comme pour le PDF :
 *   * VISIBLE — un pied de page discret dans chaque document XHTML ;
 *   * INVISIBLE — l'identifiant de la copie dans le manifeste OPF.
 */

/**
 * Style du pied de page.
 *
 * Volontairement inséré dans le document plutôt que dans la feuille de style :
 * effacer un fichier CSS est plus simple que de reprendre chaque page, et le
 * pied de page doit survivre au geste le plus évident.
 */
const STYLE_PIED =
  'margin:0;padding:0.35em 0.6em;font-size:0.6em;line-height:1.2;' +
  'color:#666;opacity:0.7;text-align:center;font-family:sans-serif;';

/**
 * Applique le filigrane à un EPUB.
 *
 * @throws si l'archive est illisible ou ne porte pas de manifeste. L'appelant
 *         ne doit JAMAIS retomber sur le fichier d'origine.
 */
export async function filigranerEpub(
  epub: Buffer,
  meta: MetadonneesCopie,
  demande: Pick<DemandeCopie, 'langue'>,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(epub);

  const cheminOpf = await localiserOpf(zip);
  const opf = await lire(zip, cheminOpf);
  zip.file(cheminOpf, marquerOpf(opf, meta));

  const mention = mentionFiligrane(meta.email, meta.copieId);
  const racine = cheminOpf.includes('/') ? cheminOpf.slice(0, cheminOpf.lastIndexOf('/') + 1) : '';

  let marquees = 0;
  for (const chemin of Object.keys(zip.files)) {
    // Le sommaire de navigation est exclu : il n'est pas une page du livre, et
    // y ajouter un pied de page le ferait apparaître dans la table des
    // matières de certains lecteurs.
    if (!chemin.startsWith(racine) || !chemin.endsWith('.xhtml')) continue;
    if (chemin.endsWith('nav.xhtml')) continue;

    zip.file(chemin, marquerXhtml(await lire(zip, chemin), mention, demande.langue));
    marquees += 1;
  }

  if (marquees === 0) {
    // Un EPUB sans aucune page marquée serait un EPUB non filigrané servi comme
    // s'il l'était. Mieux vaut échouer : l'appelant refusera la livraison.
    throw new Error('EPUB filigrané sans effet : aucun document XHTML marqué.');
  }

  // `mimetype` doit rester la PREMIÈRE entrée et non compressée (OCF). JSZip
  // conserve l'ordre d'insertion, et le fichier chargé l'avait en tête ; le
  // réécrire ici garantit qu'il le reste après modification des autres entrées.
  const mimetype = zip.file('mimetype');
  if (mimetype) {
    const contenu = await mimetype.async('string');
    zip.remove('mimetype');
    const reconstruit = new JSZip();
    reconstruit.file('mimetype', contenu, { compression: 'STORE' });
    for (const [nom, fichier] of Object.entries(zip.files)) {
      if (fichier.dir) continue;
      reconstruit.file(nom, await fichier.async('nodebuffer'));
    }
    return Buffer.from(
      await reconstruit.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      }),
    );
  }

  throw new Error('EPUB invalide : entrée `mimetype` absente.');
}

/** Chemin du manifeste, lu dans `META-INF/container.xml`. */
async function localiserOpf(zip: JSZip): Promise<string> {
  const container = zip.file('META-INF/container.xml');
  if (!container) throw new Error('EPUB invalide : `META-INF/container.xml` absent.');

  const xml = await container.async('string');
  const chemin = /full-path="([^"]+)"/.exec(xml)?.[1];
  if (!chemin) throw new Error('EPUB invalide : aucun manifeste déclaré.');

  return chemin;
}

async function lire(zip: JSZip, chemin: string): Promise<string> {
  const fichier = zip.file(chemin);
  if (!fichier) throw new Error(`EPUB invalide : ${chemin} absent.`);
  return await fichier.async('string');
}

/**
 * Inscrit la copie dans le manifeste.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `dc:identifier` DE COPIE, EN PLUS de celui de l'œuvre.                  │
 * │                                                                          │
 * │ L'identifiant d'origine n'est PAS remplacé : il désigne le livre, et le  │
 * │ remplacer casserait le rattachement de l'exemplaire à l'œuvre chez les   │
 * │ distributeurs et les bibliothèques. Le nôtre s'ajoute, avec son propre   │
 * │ `id`.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function marquerOpf(opf: string, meta: MetadonneesCopie): string {
  const ajout =
    `\n    <dc:identifier id="copie-id">urn:uuid:${echapperXml(meta.copieId)}</dc:identifier>` +
    `\n    <dc:rights>Exemplaire personnel de ${echapperXml(meta.email)} — réf. ${echapperXml(meta.copieId)}</dc:rights>` +
    `\n    <meta property="dcterms:provenance">${echapperXml(mentionFiligrane(meta.email, meta.copieId))}</meta>`;

  const fermeture = opf.indexOf('</metadata>');
  if (fermeture < 0) {
    throw new Error('EPUB invalide : manifeste sans bloc `metadata`.');
  }

  return opf.slice(0, fermeture) + ajout + '\n  ' + opf.slice(fermeture);
}

/**
 * Ajoute le pied de page à un document XHTML.
 *
 * Inséré juste avant `</body>` : après le contenu, donc en bas de page, et
 * dans le FLUX du document — pas en superposition, qu'un lecteur pourrait
 * ignorer.
 */
function marquerXhtml(xhtml: string, mention: string, langue: string): string {
  const fermeture = xhtml.lastIndexOf('</body>');
  if (fermeture < 0) return xhtml;

  const pied =
    `  <p class="filigrane" style="${STYLE_PIED}" xml:lang="${langue}" lang="${langue}">` +
    `${echapperXml(mention)}</p>\n`;

  return xhtml.slice(0, fermeture) + pied + xhtml.slice(fermeture);
}
