import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import {
  IMAGE_EPUB,
  assemblerEpub,
  echapperXml,
  horodatageEpub,
  type MetadonneesEpub,
  type PageEpub,
} from '@/domain/ingestion/epub';

/**
 * Structure de l'EPUB à mise en page fixe (§7.4.2 voie B).
 *
 * Module pur : il reçoit des images déjà rendues et rend un fichier en
 * mémoire. Ces tests portent sur la STRUCTURE. La validation par un validateur
 * EPUB réel, sur un conte réellement rendu, est dans le test d'intégration.
 */
const IMAGE = Buffer.from('image-fictive');

const META: MetadonneesEpub = {
  titre: "Anansi l'araignée maligne",
  auteur: "Collection Contes d'Afrique",
  langue: 'fr',
  identifiant: '3f1c9a2e-0b44-4c1e-9f3a-6d2b8e5a7c10',
  // Instant fixe : `src/domain` n'a pas le droit de lire l'heure, et un test
  // qui dépendrait de l'heure réelle ne serait pas déterministe.
  modifieLe: new Date('2026-07-29T10:20:30.456Z'),
};

function page(numero: number, texte: string): PageEpub {
  return { numero, image: IMAGE, largeur: 1600, hauteur: 2415, texte };
}

async function ouvrir(epub: Buffer): Promise<JSZip> {
  return await JSZip.loadAsync(epub);
}

async function lire(zip: JSZip, chemin: string): Promise<string> {
  const fichier = zip.file(chemin);
  expect(fichier, `entrée absente de l’EPUB : ${chemin}`).not.toBeNull();
  return await (fichier as NonNullable<typeof fichier>).async('string');
}

describe('conformité OCF de l’archive', () => {
  it('place `mimetype` en première entrée', async () => {
    // La spécification OCF l'exige : c'est ce qui permet de reconnaître un EPUB
    // en lisant les premiers octets, sans décompresser. Placée ailleurs,
    // l'archive reste un zip valide — et un distributeur la refuse.
    const zip = await ouvrir(await assemblerEpub([page(1, 'Il y a très longtemps')], META));

    expect(Object.keys(zip.files)[0]).toBe('mimetype');
  });

  it('déclare le bon type', async () => {
    const zip = await ouvrir(await assemblerEpub([page(1, 'texte')], META));

    expect(await lire(zip, 'mimetype')).toBe('application/epub+zip');
  });

  it('ne compresse pas `mimetype`', async () => {
    // Vérifié sur les octets du fichier produit, et non sur l'intention : la
    // signature `application/epub+zip` doit se lire en clair à l'octet 38, là
    // où un lecteur strict va la chercher.
    const epub = await assemblerEpub([page(1, 'texte')], META);

    expect(epub.subarray(30, 38).toString('ascii')).toBe('mimetype');
    expect(epub.subarray(38, 58).toString('ascii')).toBe('application/epub+zip');
  });

  it('porte le fichier de rattachement à l’emplacement normalisé', async () => {
    const zip = await ouvrir(await assemblerEpub([page(1, 'texte')], META));
    const container = await lire(zip, 'META-INF/container.xml');

    expect(container).toContain('full-path="EPUB/package.opf"');
  });

  it('refuse d’assembler un livre sans page', async () => {
    await expect(assemblerEpub([], META)).rejects.toThrow(/aucune page/);
  });
});

describe('mise en page fixe', () => {
  it('déclare `pre-paginated`', async () => {
    // C'est cette ligne qui fait la voie B de §7.4.2. Sans elle, le lecteur
    // redistribue le contenu et la mise en page d'origine est perdue.
    const zip = await ouvrir(await assemblerEpub([page(1, 'texte')], META));

    expect(await lire(zip, 'EPUB/package.opf')).toContain(
      '<meta property="rendition:layout">pre-paginated</meta>',
    );
  });

  it('donne à chaque page les dimensions de son image', async () => {
    // Sans `viewport`, un lecteur ne sait pas à quelle échelle composer la page
    // et retombe sur un rendu redistribué.
    const zip = await ouvrir(await assemblerEpub([page(1, 'texte')], META));

    expect(await lire(zip, 'EPUB/page-001.xhtml')).toContain(
      '<meta name="viewport" content="width=1600, height=2415"/>',
    );
  });

  it('numérote les pages sur trois chiffres, dans l’ordre du dos', async () => {
    const pages = [page(1, 'un'), page(2, 'deux'), page(3, 'trois')];
    const zip = await ouvrir(await assemblerEpub(pages, META));
    const opf = await lire(zip, 'EPUB/package.opf');

    expect(zip.file('EPUB/page-001.xhtml')).not.toBeNull();
    expect(zip.file('EPUB/page-003.xhtml')).not.toBeNull();
    expect(opf.indexOf('idref="page-001"')).toBeLessThan(opf.indexOf('idref="page-003"'));
  });

  it('embarque une image par page, au format déclaré', async () => {
    const zip = await ouvrir(await assemblerEpub([page(1, 'un'), page(2, 'deux')], META));

    expect(zip.file(`EPUB/images/page-001.${IMAGE_EPUB.extension}`)).not.toBeNull();
    expect(zip.file(`EPUB/images/page-002.${IMAGE_EPUB.extension}`)).not.toBeNull();
    expect(await lire(zip, 'EPUB/package.opf')).toContain(`media-type="${IMAGE_EPUB.mediaType}"`);
  });

  it('désigne la première page comme couverture', async () => {
    const zip = await ouvrir(await assemblerEpub([page(1, 'un'), page(2, 'deux')], META));
    const opf = await lire(zip, 'EPUB/package.opf');

    expect(opf).toMatch(/id="img-page-001"[^>]*properties="cover-image"/);
    expect(opf).not.toMatch(/id="img-page-002"[^>]*properties="cover-image"/);
  });
});

describe('correctif d’accessibilité de §7.4.2', () => {
  it('insère le texte de la page dans le document', async () => {
    // « le texte de chaque page est extrait et inséré dans un bloc masqué
    // visuellement mais accessible aux lecteurs d'écran et à la recherche. »
    const zip = await ouvrir(await assemblerEpub([page(1, 'Il y a très longtemps')], META));

    expect(await lire(zip, 'EPUB/page-001.xhtml')).toContain('Il y a très longtemps');
  });

  it('masque ce bloc SANS le retirer de l’arbre d’accessibilité', async () => {
    // `display: none` aurait été plus simple et aurait tout cassé : cette
    // propriété retire l'élément de l'arbre d'accessibilité, et la synthèse
    // vocale ne le voit plus. C'est le piège exact que ce module doit éviter.
    const zip = await ouvrir(await assemblerEpub([page(1, 'texte')], META));
    const style = await lire(zip, 'EPUB/style.css');

    expect(style).toMatch(/\.texte-accessible\s*\{[^}]*clip-path/);
    expect(style).not.toMatch(/\.texte-accessible\s*\{[^}]*display:\s*none/);
    expect(style).not.toMatch(/\.texte-accessible\s*\{[^}]*visibility:\s*hidden/);
  });

  it('sépare les paragraphes', async () => {
    const zip = await ouvrir(await assemblerEpub([page(1, 'Premier.\n\nSecond.')], META));
    const xhtml = await lire(zip, 'EPUB/page-001.xhtml');

    expect(xhtml).toContain('<p>Premier.</p>');
    expect(xhtml).toContain('<p>Second.</p>');
  });

  it('n’insère aucun bloc pour une page muette', async () => {
    // Un PDF scanné produit des pages sans texte (§7.4.4). Un bloc vide ne
    // servirait à rien et ferait annoncer une accessibilité inexistante.
    const zip = await ouvrir(await assemblerEpub([page(1, '')], META));

    expect(await lire(zip, 'EPUB/page-001.xhtml')).not.toContain('texte-accessible');
  });

  it('annonce `textual` quand le texte existe', async () => {
    const zip = await ouvrir(await assemblerEpub([page(1, 'du texte')], META));

    expect(await lire(zip, 'EPUB/package.opf')).toContain(
      '<meta property="schema:accessMode">textual</meta>',
    );
  });

  it('N’annonce PAS `textual` sur un livre muet', async () => {
    // Annoncer une accessibilité absente est pire que de ne rien annoncer : un
    // lecteur malvoyant choisirait le titre sur cette foi et n'y trouverait
    // rien à écouter.
    const zip = await ouvrir(await assemblerEpub([page(1, ''), page(2, '')], META));
    const opf = await lire(zip, 'EPUB/package.opf');

    expect(opf).not.toContain('<meta property="schema:accessMode">textual</meta>');
    expect(opf).toContain('<meta property="schema:accessMode">visual</meta>');
  });
});

describe('échappement XML', () => {
  it('traite le `&` en premier', () => {
    // Sinon on échapperait les `&` que l'on vient soi-même d'introduire, et
    // « < » donnerait « &amp;lt; ».
    expect(echapperXml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('échappe le titre dans le manifeste', async () => {
    // « Anansi l'araignée maligne » : l'apostrophe est dans le corpus, et un
    // caractère non échappé rend le fichier non conforme — le lecteur refuse
    // alors d'ouvrir le livre entier.
    const zip = await ouvrir(
      await assemblerEpub([page(1, 'texte')], { ...META, titre: 'Contes & récits <choisis>' }),
    );

    const opf = await lire(zip, 'EPUB/package.opf');
    expect(opf).toContain('Contes &amp; récits &lt;choisis&gt;');
    expect(opf).not.toContain('<choisis>');
  });

  it('échappe le texte de la page', async () => {
    const zip = await ouvrir(await assemblerEpub([page(1, 'Tom & Jerry <ici>')], META));

    const xhtml = await lire(zip, 'EPUB/page-001.xhtml');
    expect(xhtml).toContain('Tom &amp; Jerry &lt;ici&gt;');
  });
});

describe('horodatage', () => {
  it('est à la seconde, sans millisecondes', () => {
    // EPUB 3 impose `AAAA-MM-JJTHH:MM:SSZ`. `toISOString()` produit des
    // millisecondes, qu'un validateur refuse.
    expect(horodatageEpub(new Date('2026-07-29T10:20:30.456Z'))).toBe('2026-07-29T10:20:30Z');
  });

  it('part dans le manifeste sous cette forme', async () => {
    const zip = await ouvrir(await assemblerEpub([page(1, 'texte')], META));

    expect(await lire(zip, 'EPUB/package.opf')).toContain(
      '<meta property="dcterms:modified">2026-07-29T10:20:30Z</meta>',
    );
  });
});
