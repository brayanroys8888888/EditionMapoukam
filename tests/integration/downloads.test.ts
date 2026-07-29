import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

import { GET as telecharger } from '@/app/api/downloads/[bookId]/route';
import { purgerCopies } from '@/lib/downloads/service';
import { identifiantCopie } from '@/domain/downloads/copie';

import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, get, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, serviceClient, type TestUser } from '../helpers/users';

/**
 * Téléchargement filigrané — §9.4, §10.2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FILIGRANE EST UN DRM SOCIAL : il dissuade et il trace, il n'empêche   │
 * │ pas. Un utilisateur déterminé le retirera — c'est un choix assumé de     │
 * │ §10.2. Ces tests vérifient donc que la trace EST PRÉSENTE et JUSTE, pas  │
 * │ qu'elle est inviolable.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let acheteur: TestUser;
let autre: TestUser;
let abonne: TestUser;
let livreId: string;
let jetonTitre: string;

/** Dépose un PDF et un EPUB exploitables pour le titre. */
async function deposerFichiersDuTitre(): Promise<void> {
  const pdf = await PDFDocument.create();
  pdf.addPage([420, 634]);
  pdf.addPage([420, 634]);
  const octetsPdf = Buffer.from(await pdf.save());

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    'EPUB/package.opf',
    '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:uuid:oeuvre</dc:identifier><dc:title>Titre</dc:title><dc:language>fr</dc:language></metadata><manifest/><spine/></package>',
  );
  zip.file(
    'EPUB/page-001.xhtml',
    '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>1</title></head><body><p>Contenu</p></body></html>',
  );
  const octetsEpub = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));

  const client = serviceClient();
  await client.storage
    .from('book-downloads')
    .upload(`${jetonTitre}/livre.pdf`, octetsPdf, {
      contentType: 'application/pdf',
      upsert: true,
    });
  await client.storage
    .from('book-downloads')
    .upload(`${jetonTitre}/livre.epub`, octetsEpub, {
      contentType: 'application/epub+zip',
      upsert: true,
    });
}

/** Récupère le fichier servi, en suivant l'URL signée. */
async function recupererFichier(url: string): Promise<Buffer> {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Téléchargement impossible : ${String(reponse.status)}`);
  return Buffer.from(await reponse.arrayBuffer());
}

function demande(
  user: TestUser,
  options: { format?: 'pdf' | 'epub'; langue?: 'fr' | 'en' } = {},
): [Request, { params: Promise<{ bookId: string }> }] {
  const parametres = new URLSearchParams({
    langue: options.langue ?? 'fr',
    format: options.format ?? 'pdf',
  });
  return [
    get(`/api/downloads/${livreId}?${parametres.toString()}`, { jeton: user.accessToken }),
    { params: Promise.resolve({ bookId: livreId }) },
  ];
}

beforeAll(async () => {
  acheteur = await createTestUser();
  autre = await createTestUser();
  abonne = await createTestUser();

  const livre = await queryOne<{ id: string }>(
    `select id from public.books where slug = 'la-tortue-et-le-lapin'`,
  );
  livreId = livre!.id;

  // Un jeton de stockage propre à ce test, pour ne pas heurter les seeds.
  jetonTitre = 'testdownloads0000000000000000000';
  await query(
    `update public.book_translations
        set fichier_telechargement = $2
      where book_id = $1 and langue = 'fr'`,
    [livreId, `book-downloads/${jetonTitre}/livre.pdf`],
  );
  await deposerFichiersDuTitre();

  // L'acheteur possède le titre ; l'abonné a un abonnement actif mais AUCUN
  // achat — c'est la distinction que §3.2 rend centrale.
  const commande = await queryOne<{ id: string }>(
    `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
     values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
    [acheteur.id],
  );
  await query(
    `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
     values ($1, $2, 'achat', $3, true)`,
    [acheteur.id, livreId, commande!.id],
  );
  await query(
    `insert into public.subscriptions
       (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
     values ($1, 'mensuel', 'actif', public.app_now(),
             public.app_now() + interval '1 month', 'international', 'EUR', 799)`,
    [abonne.id],
  );
});

afterEach(async () => {
  // Chaque test repart sans copie : le cache masquerait les échecs de
  // génération que certains tests cherchent précisément à provoquer.
  const copies = await query<{ chemin: string }>(`select chemin from public.download_copies`);
  for (const copie of copies) {
    await serviceClient()
      .storage.from('book-downloads')
      .remove([copie.chemin.replace('book-downloads/', '')]);
  }
  await query(`delete from public.download_copies`);
});

afterAll(async () => {
  await serviceClient()
    .storage.from('book-downloads')
    .remove([`${jetonTitre}/livre.pdf`, `${jetonTitre}/livre.epub`]);
  await deleteTestUser(acheteur);
  await deleteTestUser(autre);
  await deleteTestUser(abonne);
  await closePool();
});

describe('droits', () => {
  it('refuse un visiteur non connecté', async () => {
    const reponse = await telecharger(
      get(`/api/downloads/${livreId}`),
      { params: Promise.resolve({ bookId: livreId }) },
    );

    expect(reponse.status).toBe(401);
  });

  it('REFUSE un abonné actif — la règle métier centrale', async () => {
    // §3.2 : « Le droit de téléchargement n'est accordé que par un achat,
    // jamais par un abonnement. »
    const reponse = await telecharger(...demande(abonne));

    expect(reponse.status).toBe(403);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('telechargement_non_inclus');
  });

  it('refuse un utilisateur sans aucun droit', async () => {
    const reponse = await telecharger(...demande(autre));

    expect(reponse.status).toBe(403);
  });

  it('sert l’acheteur', async () => {
    const reponse = await telecharger(...demande(acheteur));

    expect(reponse.status).toBe(200);
  });

  it('refuse une traduction en brouillon, même à l’acheteur', async () => {
    // docs/PLAN.md D2 point 4.
    const reponse = await telecharger(...demande(acheteur, { langue: 'en' }));

    expect(reponse.status).toBe(404);
  });
});

describe('le fichier servi porte la trace de son acheteur', () => {
  it('inscrit l’adresse de l’acheteur dans le PDF', async () => {
    const corps = await corpsJson<{ url: string; reference: string }>(
      await telecharger(...demande(acheteur)),
    );
    const fichier = await recupererFichier(corps.url);
    const doc = await PDFDocument.load(fichier, { updateMetadata: false });

    expect(doc.getSubject()).toContain(corps.reference);
    expect(fichier.byteLength).toBeGreaterThan(0);
  }, 60_000);

  it('inscrit l’adresse de l’acheteur dans l’EPUB', async () => {
    // Un EPUB nu rendrait le filigrane du PDF décoratif : qui veut partager le
    // livre partage le format qui ne porte pas son adresse.
    const corps = await corpsJson<{ url: string }>(
      await telecharger(...demande(acheteur, { format: 'epub' })),
    );
    const zip = await JSZip.loadAsync(await recupererFichier(corps.url));

    const opf = await zip.file('EPUB/package.opf')!.async('string');
    expect(opf).toContain(acheteur.email);

    const page = await zip.file('EPUB/page-001.xhtml')!.async('string');
    expect(page).toContain(acheteur.email);
  }, 60_000);

  it('NE SERT JAMAIS le fichier de A à B', async () => {
    // Ce serait à la fois une fuite de donnée personnelle et la mise en cause
    // d'un innocent, dont l'adresse circulerait sur un fichier qu'il n'a pas
    // partagé.
    await telecharger(...demande(acheteur));

    // `autre` obtient un droit, puis demande le même titre.
    const commande = await queryOne<{ id: string }>(
      `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
       values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
      [autre.id],
    );
    await query(
      `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
       values ($1, $2, 'achat', $3, true)`,
      [autre.id, livreId, commande!.id],
    );

    try {
      const corps = await corpsJson<{ url: string }>(await telecharger(...demande(autre)));
      const fichier = await recupererFichier(corps.url);
      const doc = await PDFDocument.load(fichier, { updateMetadata: false });

      expect(doc.getSubject()).toContain(identifiantCopie({
        userId: autre.id,
        bookId: livreId,
        langue: 'fr',
        format: 'pdf',
      }));
      // Et surtout : l'adresse de l'acheteur n'y figure pas.
      expect(fichier.toString('latin1')).not.toContain(acheteur.email);
    } finally {
      await query(`delete from public.entitlements where user_id = $1`, [autre.id]);
      await query(`delete from public.orders where user_id = $1`, [autre.id]);
    }
  }, 90_000);
});

describe('ÉCHEC FERMÉ — le fichier nu n’est jamais servi', () => {
  it('refuse quand la génération échoue, sans livrer un seul octet de l’original', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA PANNE SILENCIEUSE PARFAITE, ÉVITÉE.                               │
    // │                                                                      │
    // │ Un repli sur l'original serait invisible : l'acheteur reçoit son     │
    // │ livre, tout semble fonctionner, et les fichiers partiraient sans     │
    // │ protection pendant des semaines. On ne s'en apercevrait qu'en        │
    // │ trouvant un exemplaire en circulation sans pouvoir dire d'où il      │
    // │ vient — au moment précis où la trace devait servir.                  │
    // └──────────────────────────────────────────────────────────────────────┘
    const client = serviceClient();

    // Le fichier source est remplacé par un contenu que pdf-lib ne sait pas
    // lire : la génération lèvera.
    const marqueur = 'CONTENU-ORIGINAL-NON-FILIGRANE';
    await client.storage
      .from('book-downloads')
      .upload(`${jetonTitre}/livre.pdf`, Buffer.from(marqueur), {
        contentType: 'application/pdf',
        upsert: true,
      });

    // Compté AVANT : les tests précédents ont déjà servi des fichiers à ce
    // compte. Ce qui doit être prouvé, c'est qu'il ne s'ajoute RIEN.
    const journauxAvant = await query(
      `select 1 from public.download_logs where user_id = $1`,
      [acheteur.id],
    );

    try {
      const reponse = await telecharger(...demande(acheteur));

      // Refus explicite, jamais 200.
      expect(reponse.status).toBe(503);
      const corps = await corpsJson<ReponseErreur>(reponse);
      expect(corps.erreur.code).toBe('copie_indisponible');

      // Aucune URL servie : rien à télécharger, donc aucun octet de l'original.
      expect(JSON.stringify(corps)).not.toContain('url');
      expect(JSON.stringify(corps)).not.toContain(marqueur);

      // Et rien n'a été enregistré : ni copie, ni journal. Journaliser un
      // téléchargement qui n'a pas eu lieu fausserait la détection des
      // comportements anormaux de §10.2.
      expect(await query(`select 1 from public.download_copies`)).toHaveLength(0);
      expect(
        await query(`select 1 from public.download_logs where user_id = $1`, [acheteur.id]),
      ).toHaveLength(journauxAvant.length);
    } finally {
      await deposerFichiersDuTitre();
    }
  }, 60_000);

  it('refuse quand le fichier source a disparu', async () => {
    const client = serviceClient();
    await client.storage.from('book-downloads').remove([`${jetonTitre}/livre.pdf`]);

    try {
      const reponse = await telecharger(...demande(acheteur));

      expect(reponse.status).toBe(503);
    } finally {
      await deposerFichiersDuTitre();
    }
  }, 60_000);
});

describe('cache', () => {
  it('génère à la première demande, puis réutilise', async () => {
    // §9.4 : « Si le fichier filigrané n'existe pas encore, il est généré. »
    const premiere = await corpsJson<{ reference: string }>(
      await telecharger(...demande(acheteur)),
    );
    const copies = await query<{ copie_id: string }>(`select copie_id from public.download_copies`);
    expect(copies).toHaveLength(1);

    const seconde = await corpsJson<{ reference: string }>(
      await telecharger(...demande(acheteur)),
    );

    expect(seconde.reference).toBe(premiere.reference);
    expect(await query(`select 1 from public.download_copies`)).toHaveLength(1);
  }, 90_000);

  it('sépare les copies par langue et par format', async () => {
    await telecharger(...demande(acheteur, { format: 'pdf' }));
    await telecharger(...demande(acheteur, { format: 'epub' }));

    const copies = await query<{ format: string }>(
      `select format::text from public.download_copies order by format`,
    );
    expect(copies.map((c) => c.format)).toEqual(['epub', 'pdf']);
  }, 90_000);

  it('repousse la purge à chaque demande', async () => {
    await telecharger(...demande(acheteur));
    const avant = await queryOne<{ dernier_acces_le: string }>(
      `select dernier_acces_le from public.download_copies limit 1`,
    );

    await query(
      `update public.download_copies set dernier_acces_le = public.app_now() - interval '10 days'`,
    );
    await telecharger(...demande(acheteur));

    const apres = await queryOne<{ dernier_acces_le: string }>(
      `select dernier_acces_le from public.download_copies limit 1`,
    );
    expect(new Date(apres!.dernier_acces_le).getTime()).toBeGreaterThan(
      new Date(avant!.dernier_acces_le).getTime() - 1000,
    );
  }, 90_000);
});

describe('purge', () => {
  it('n’efface rien tant que la rétention court', async () => {
    await telecharger(...demande(acheteur));

    expect(await purgerCopies()).toBe(0);
    expect(await query(`select 1 from public.download_copies`)).toHaveLength(1);
  }, 90_000);

  it('efface les copies non redemandées, fichier compris', async () => {
    await telecharger(...demande(acheteur));
    const copie = await queryOne<{ chemin: string }>(
      `select chemin from public.download_copies limit 1`,
    );

    // Rétention de 6 mois par défaut.
    await query(
      `update public.download_copies set dernier_acces_le = public.app_now() - interval '9 months'`,
    );

    expect(await purgerCopies()).toBe(1);
    expect(await query(`select 1 from public.download_copies`)).toHaveLength(0);

    const objet = copie!.chemin.replace('book-downloads/', '');
    const { data } = await serviceClient().storage.from('book-downloads').download(objet);
    expect(data).toBeNull();
  }, 90_000);

  it('REGÉNÈRE à l’identique après purge', async () => {
    // C'est ce qui rend la purge sans danger : la clé est déterministe, donc
    // la copie effacée se reconstruit avec le même identifiant. Un identifiant
    // aléatoire aurait fait perdre la trace au moment où elle sert.
    const avant = await corpsJson<{ reference: string }>(
      await telecharger(...demande(acheteur)),
    );

    await query(
      `update public.download_copies set dernier_acces_le = public.app_now() - interval '9 months'`,
    );
    await purgerCopies();

    const apres = await corpsJson<{ reference: string }>(
      await telecharger(...demande(acheteur)),
    );

    expect(apres.reference).toBe(avant.reference);
  }, 120_000);
});

describe('journal et quota', () => {
  it('journalise langue et format', async () => {
    await telecharger(...demande(acheteur, { format: 'epub' }));

    const journal = await queryOne<{ langue: string; format: string }>(
      `select langue, format::text from public.download_logs where user_id = $1
        order by telecharge_le desc limit 1`,
      [acheteur.id],
    );

    expect(journal?.langue).toBe('fr');
    expect(journal?.format).toBe('epub');
  }, 60_000);

  it('refuse au-delà du quota', async () => {
    // §10.2 — « limitation du nombre de téléchargements par période » pour
    // freiner l'aspiration automatisée.
    let dernier: Response | null = null;
    for (let i = 0; i < 32; i += 1) {
      dernier = await telecharger(...demande(acheteur));
      if (dernier.status === 429) break;
    }

    expect(dernier?.status).toBe(429);
    expect(dernier?.headers.get('retry-after')).toBeTruthy();
  }, 180_000);
});
