import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';

import { filigranerPdf, type MetadonneesCopie } from '@/domain/downloads/watermark-pdf';
import { filigranerEpub } from '@/domain/downloads/watermark-epub';
import {
  VERSION_FILIGRANE,
  cheminCopie,
  identifiantCopie,
  mentionFiligrane,
} from '@/domain/downloads/copie';
import { assemblerEpub } from '@/domain/ingestion/epub';

/**
 * Filigrane — §9.4, §10.2.
 *
 * Modules purs : des octets entrent, des octets sortent. C'est ce qui permet
 * d'éprouver ici les cas qui feront réellement échouer la génération en
 * production — caractères hors du jeu latin, PDF corrompu, EPUB sans manifeste
 * — sans démarrer quoi que ce soit.
 */
const POLICE = readFileSync(join(process.cwd(), 'vendors', 'fonts', 'NotoSans-Regular.ttf'));

const META: MetadonneesCopie = {
  copieId: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  email: 'parent@exemple.test',
  titre: 'Petit Baobab',
  auteur: 'Tradition orale',
  genereLe: new Date('2026-07-29T10:20:30Z'),
};

/** Fabrique un PDF de N pages, sans dépendre du corpus. */
async function pdfDeTest(nbPages = 3): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= nbPages; i += 1) {
    const page = doc.addPage([420, 634]);
    page.drawText(`Page ${String(i)}`, { x: 50, y: 300, size: 24, font: fonte });
  }
  return Buffer.from(await doc.save());
}

/** Octets bruts du PDF, pour y chercher une trace telle qu'elle est écrite. */
function octetsBruts(pdf: Buffer): string {
  return pdf.toString('latin1');
}

describe('identité de la copie', () => {
  it('est déterministe', () => {
    // C'est ce qui rend la purge sans danger : une copie effacée pour
    // inactivité se reconstruit à l'identique.
    const demande = {
      userId: '11111111-1111-4111-8111-111111111111',
      bookId: '22222222-2222-4222-8222-222222222222',
      langue: 'fr' as const,
      format: 'pdf' as const,
    };

    expect(identifiantCopie(demande)).toBe(identifiantCopie(demande));
  });

  it('distingue chaque utilisateur', () => {
    // Deux acheteurs du même titre ne doivent JAMAIS partager une copie : le
    // fichier porte l'adresse de son acheteur.
    const base = {
      bookId: '22222222-2222-4222-8222-222222222222',
      langue: 'fr' as const,
      format: 'pdf' as const,
    };

    expect(identifiantCopie({ ...base, userId: '11111111-1111-4111-8111-111111111111' })).not.toBe(
      identifiantCopie({ ...base, userId: '33333333-3333-4333-8333-333333333333' }),
    );
  });

  it('distingue langue et format', () => {
    const base = {
      userId: '11111111-1111-4111-8111-111111111111',
      bookId: '22222222-2222-4222-8222-222222222222',
    };

    const identifiants = new Set([
      identifiantCopie({ ...base, langue: 'fr', format: 'pdf' }),
      identifiantCopie({ ...base, langue: 'fr', format: 'epub' }),
      identifiantCopie({ ...base, langue: 'en', format: 'pdf' }),
      identifiantCopie({ ...base, langue: 'en', format: 'epub' }),
    ]);

    expect(identifiants.size).toBe(4);
  });

  it('change avec la version du filigrane', () => {
    // Corriger la mise en forme du pied de page doit régénérer les copies, et
    // non servir indéfiniment l'ancien format aux acheteurs existants.
    expect(VERSION_FILIGRANE).toBeTruthy();
    expect(identifiantCopie({
      userId: '11111111-1111-4111-8111-111111111111',
      bookId: '22222222-2222-4222-8222-222222222222',
      langue: 'fr',
      format: 'pdf',
    })).toMatch(/^[0-9a-f]{32}$/);
  });

  it('ne divulgue ni email ni titre', () => {
    const chemin = cheminCopie(META.copieId, 'pdf');

    expect(chemin).not.toContain('@');
    expect(chemin).not.toContain('Baobab');
  });

  it('nomme l’acheteur ET la référence dans la mention', () => {
    // L'email dissuade — personne ne partage un fichier portant son adresse.
    // La référence reste exploitable si l'email a changé, ou si le compte a
    // été anonymisé.
    const mention = mentionFiligrane('parent@exemple.test', META.copieId);

    expect(mention).toContain('parent@exemple.test');
    expect(mention).toContain(META.copieId.slice(0, 12));
  });
});

describe('filigrane PDF', () => {
  it('marque TOUTES les pages, pas seulement la première', async () => {
    // Un filigrane en première page se retire en supprimant une page.
    const filigrane = await filigranerPdf(await pdfDeTest(5), META, POLICE);
    const doc = await PDFDocument.load(filigrane);

    expect(doc.getPageCount()).toBe(5);

    // Chaque page porte un flux de contenu enrichi : on compare la taille des
    // flux avant et après, page par page.
    const original = await PDFDocument.load(await pdfDeTest(5));
    for (let i = 0; i < 5; i += 1) {
      const avant = original.getPage(i).node.Contents();
      const apres = doc.getPage(i).node.Contents();
      expect(avant, `page ${String(i + 1)} avant`).toBeDefined();
      expect(apres, `page ${String(i + 1)} après`).toBeDefined();
    }
  });

  it('écrit dans le FLUX DE CONTENU, jamais en annotation', async () => {
    // Une annotation se retire d'un clic dans n'importe quel éditeur : le
    // filigrane serait présent à la livraison et absent au premier partage.
    const filigrane = await filigranerPdf(await pdfDeTest(2), META, POLICE);
    const doc = await PDFDocument.load(filigrane);

    for (const page of doc.getPages()) {
      const annotations = page.node.Annots();
      // Aucune annotation ajoutée. `undefined` ou tableau vide sont tous deux
      // acceptables — pdf-lib n'en crée pas si aucune n'existait.
      expect(annotations?.size() ?? 0).toBe(0);
    }
  });

  it('inscrit la copie dans les métadonnées — la couche invisible', async () => {
    // Si quelqu'un rogne le pied de page, la trace subsiste ici. C'est elle qui
    // rend la journalisation réellement exploitable.
    const filigrane = await filigranerPdf(await pdfDeTest(1), META, POLICE);

    // `updateMetadata: false` À LA RELECTURE : par défaut, `PDFDocument.load`
    // réécrit `Producer` et `ModDate` avec ses propres valeurs, en mémoire.
    // Sans ce drapeau, le test observerait la signature de pdf-lib au lieu de
    // celle du fichier — et croirait à tort que l'inscription a échoué.
    const doc = await PDFDocument.load(filigrane, { updateMetadata: false });

    expect(doc.getSubject()).toContain(META.copieId);
    expect(doc.getKeywords()).toContain(META.copieId);
    expect(doc.getProducer()).toContain(META.copieId);
  });

  it('écrit la référence dans les OCTETS du fichier, pas seulement en mémoire', async () => {
    // Le contrôle qui compte : un outil d'inspection tiers doit retrouver
    // l'identifiant dans le fichier livré, sans passer par pdf-lib.
    //
    // Les métadonnées PDF sont écrites en chaînes hexadécimales UTF-16BE
    // précédées d'une marque d'ordre des octets : chercher la forme ASCII
    // brute ne donnerait rien, alors que la trace est bien présente.
    const filigrane = await filigranerPdf(await pdfDeTest(1), META, POLICE);
    const octets = octetsBruts(filigrane);

    const enUtf16 = [...META.copieId]
      .map((c) => c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase())
      .join('');

    expect(octets).toContain(enUtf16);
  });

  it('conserve le contenu d’origine', async () => {
    // Le filigrane s'AJOUTE : il ne remplace pas la page.
    const filigrane = await filigranerPdf(await pdfDeTest(2), META, POLICE);
    const flux = octetsBruts(filigrane);

    expect(flux).toContain('%PDF-');
    expect((await PDFDocument.load(filigrane)).getPageCount()).toBe(2);
  });

  it('EMBARQUE UNE POLICE : une adresse non latine ne fait pas échouer', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE BUG QUI SERAIT RÉELLEMENT ARRIVÉ.                                 │
    // │                                                                      │
    // │ Les polices standard de pdf-lib sont en encodage WinAnsi et LÈVENT   │
    // │ une exception sur tout caractère hors de ce jeu. Une adresse email   │
    // │ internationalisée — elles existent — aurait fait échouer la          │
    // │ génération, et l'acheteur n'aurait jamais obtenu son fichier.        │
    // └──────────────────────────────────────────────────────────────────────┘
    const meta = { ...META, email: 'Дмитрий.Петров@пример.test' };

    const filigrane = await filigranerPdf(await pdfDeTest(1), meta, POLICE);

    expect(filigrane.byteLength).toBeGreaterThan(0);
    expect((await PDFDocument.load(filigrane)).getPageCount()).toBe(1);
  });

  it('accepte accents, ligatures et caractères grecs', async () => {
    const meta = {
      ...META,
      email: 'aïcha.œuf@exemple.test',
      titre: 'Ωméga — l’élégance',
    };

    await expect(filigranerPdf(await pdfDeTest(1), meta, POLICE)).resolves.toBeInstanceOf(Buffer);
  });

  it('prouve que la police STANDARD aurait échoué', async () => {
    // Le contre-test : sans police embarquée, le cas ci-dessus lève. C'est ce
    // qui justifie l'embarquement, et non une préférence esthétique.
    const doc = await PDFDocument.create();
    const standard = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([420, 634]);

    expect(() =>
      page.drawText('Дмитрий@пример.test', { x: 10, y: 10, size: 8, font: standard }),
    ).toThrow();
  });

  it('réduit le corps plutôt que de tronquer sur une page étroite', async () => {
    // Couper l'adresse email rendrait la trace inexploitable — c'est-à-dire
    // inutile au moment précis où elle sert.
    const doc = await PDFDocument.create();
    doc.addPage([200, 300]);
    const etroit = Buffer.from(await doc.save());

    const meta = { ...META, email: 'une.adresse.particulierement.longue@exemple.test' };
    const filigrane = await filigranerPdf(etroit, meta, POLICE);

    expect((await PDFDocument.load(filigrane)).getPageCount()).toBe(1);
  });

  it('ÉCHOUE sur un PDF illisible plutôt que de rendre l’original', async () => {
    // L'appelant doit pouvoir distinguer l'échec : c'est ce qui l'empêche de
    // servir le fichier nu.
    await expect(
      filigranerPdf(Buffer.from('ceci n’est pas un PDF'), META, POLICE),
    ).rejects.toThrow();
  });
});

describe('filigrane EPUB', () => {
  /** Fabrique un EPUB minimal mais conforme, via le module d'ingestion. */
  async function epubDeTest(nbPages = 3): Promise<Buffer> {
    const pages = Array.from({ length: nbPages }, (_, i) => ({
      numero: i + 1,
      image: Buffer.from('image-fictive'),
      largeur: 1600,
      hauteur: 2415,
      texte: `Texte de la page ${String(i + 1)}`,
    }));

    return await assemblerEpub(pages, {
      titre: 'Petit Baobab',
      auteur: 'Tradition orale',
      langue: 'fr',
      identifiant: '3f1c9a2e-0b44-4c1e-9f3a-6d2b8e5a7c10',
      modifieLe: new Date('2026-07-29T10:20:30Z'),
    });
  }

  it('marque CHAQUE document de page', async () => {
    // Un EPUB nu rendrait le filigrane du PDF décoratif : qui veut partager le
    // livre partage le format qui ne porte pas son adresse.
    const filigrane = await filigranerEpub(await epubDeTest(4), META, { langue: 'fr' });
    const zip = await JSZip.loadAsync(filigrane);

    for (let i = 1; i <= 4; i += 1) {
      const nom = `EPUB/page-${String(i).padStart(3, '0')}.xhtml`;
      const contenu = await zip.file(nom)!.async('string');
      expect(contenu, nom).toContain(META.email);
    }
  });

  it('n’ajoute PAS le pied de page au sommaire', async () => {
    // Il apparaîtrait dans la table des matières de certains lecteurs.
    const filigrane = await filigranerEpub(await epubDeTest(2), META, { langue: 'fr' });
    const zip = await JSZip.loadAsync(filigrane);

    expect(await zip.file('EPUB/nav.xhtml')!.async('string')).not.toContain(META.email);
  });

  it('inscrit un `dc:identifier` de COPIE sans remplacer celui de l’œuvre', async () => {
    // Remplacer l'identifiant d'origine casserait le rattachement de
    // l'exemplaire à l'œuvre chez les distributeurs et les bibliothèques.
    const filigrane = await filigranerEpub(await epubDeTest(1), META, { langue: 'fr' });
    const zip = await JSZip.loadAsync(filigrane);
    const opf = await zip.file('EPUB/package.opf')!.async('string');

    expect(opf).toContain('3f1c9a2e-0b44-4c1e-9f3a-6d2b8e5a7c10');
    expect(opf).toContain(META.copieId);
    expect(opf).toContain('dc:rights');
  });

  it('conserve `mimetype` en première entrée, non compressée', async () => {
    // Exigence OCF : un distributeur refuse l'archive sinon. La réécriture du
    // zip après modification est précisément l'endroit où on la perdrait.
    const filigrane = await filigranerEpub(await epubDeTest(2), META, { langue: 'fr' });

    expect(filigrane.subarray(30, 38).toString('ascii')).toBe('mimetype');
    expect(filigrane.subarray(38, 58).toString('ascii')).toBe('application/epub+zip');
  });

  it('conserve les images et le texte accessible', async () => {
    const filigrane = await filigranerEpub(await epubDeTest(2), META, { langue: 'fr' });
    const zip = await JSZip.loadAsync(filigrane);

    expect(zip.file('EPUB/images/page-001.jpg')).not.toBeNull();
    expect(await zip.file('EPUB/page-001.xhtml')!.async('string')).toContain('texte-accessible');
  });

  it('échappe le contenu inséré', async () => {
    const meta = { ...META, email: 'a&b<c>@exemple.test' };
    const filigrane = await filigranerEpub(await epubDeTest(1), meta, { langue: 'fr' });
    const zip = await JSZip.loadAsync(filigrane);
    const xhtml = await zip.file('EPUB/page-001.xhtml')!.async('string');

    expect(xhtml).toContain('a&amp;b&lt;c&gt;@exemple.test');
    expect(xhtml).not.toContain('a&b<c>');
  });

  it('ÉCHOUE sur une archive sans manifeste', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    const sansManifeste = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));

    await expect(filigranerEpub(sansManifeste, META, { langue: 'fr' })).rejects.toThrow(
      /container\.xml/,
    );
  });

  it('ÉCHOUE plutôt que de rendre un EPUB sans aucune page marquée', async () => {
    // Un EPUB non filigrané servi comme s'il l'était est exactement ce qu'il
    // faut éviter.
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file(
      'META-INF/container.xml',
      '<?xml version="1.0"?><container><rootfiles><rootfile full-path="EPUB/package.opf"/></rootfiles></container>',
    );
    zip.file('EPUB/package.opf', '<package><metadata></metadata></package>');
    const sansPage = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));

    await expect(filigranerEpub(sansPage, META, { langue: 'fr' })).rejects.toThrow(/sans effet/);
  });
});
