import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';

import { POST as ingestionRoute } from '@/app/api/admin/books/ingest/route';
import { ingerer, type ResultatIngestion } from '@/lib/ingestion/pipeline';
import { RESOLUTIONS } from '@/lib/ingestion/render-pages';
import { BUCKETS, cheminTelechargement } from '@/lib/ingestion/storage';
import { TAILLES_COUVERTURE } from '@/lib/storage/covers';
import { IMAGE_EPUB } from '@/domain/ingestion/epub';

import { messagesGraves, validerEpub } from '../helpers/epubcheck';
import { closePool, query, queryOne } from '../helpers/db';
import { corpsJson, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, serviceClient, type TestUser } from '../helpers/users';

/**
 * Chaîne d'ingestion de bout en bout — §7.4.3.
 *
 * Le critère d'acceptation de l'étape, mot pour mot (docs/PLAN.md) :
 *
 *   « un PDF de N pages → 2N images WebP, 3 formats de couverture,
 *     1 EPUB valide, N pages de texte, 1 livre en brouillon »
 *
 * Le test tourne sur un conte RÉEL du corpus, pas sur un PDF fabriqué pour
 * l'occasion. Un PDF de test à une page ne porte ni lettrine, ni couche texte
 * réelle, ni gabarit de composition : il prouverait que le code s'exécute, pas
 * qu'il fait son travail.
 *
 * La chaîne complète est jouée UNE FOIS dans `beforeAll`, et toutes les
 * assertions lisent son résultat. Rendre quatorze pages en deux résolutions
 * prend une bonne minute — le refaire à chaque `it` rendrait la suite
 * inutilisable.
 */
const CORPUS = join(process.cwd(), "conte d'afrique", 'contes_pdf');
const CONTE = join(CORPUS, 'Petit Baobab.pdf');

/** Relevé sur le fichier. Le codé en dur est volontaire : il ancre le test. */
const NB_PAGES_ATTENDU = 14;

let resultat: ResultatIngestion;
let admin: TestUser;
let utilisateur: TestUser;

/** Objets réellement présents dans un bucket, sous un préfixe. */
async function objets(bucket: string, prefixe: string): Promise<string[]> {
  const { data, error } = await serviceClient().storage.from(bucket).list(prefixe, { limit: 200 });
  if (error) throw new Error(`Listage impossible (${bucket}/${prefixe}) : ${error.message}`);
  return (data ?? []).map((objet) => objet.name).sort();
}

/** Télécharge un objet du stockage privé. */
async function telecharger(cheminComplet: string): Promise<Buffer> {
  const separateur = cheminComplet.indexOf('/');
  const bucket = cheminComplet.slice(0, separateur);
  const chemin = cheminComplet.slice(separateur + 1);

  const { data, error } = await serviceClient().storage.from(bucket).download(chemin);
  if (error || !data) throw new Error(`Téléchargement impossible (${cheminComplet}) : ${error?.message ?? 'vide'}`);
  return Buffer.from(await data.arrayBuffer());
}

beforeAll(async () => {
  if (!existsSync(CONTE)) {
    throw new Error(
      `Corpus introuvable : ${CONTE}. Les seize PDF vivent hors du dépôt (docs/PLAN.md).`,
    );
  }

  admin = await createTestUser({ admin: true });
  utilisateur = await createTestUser();

  resultat = await ingerer({ cheminPdf: CONTE, langue: 'fr' });
}, 300_000);

afterAll(async () => {
  // Les fichiers d'abord : une fois les lignes effacées, plus rien ne dit où
  // ils se trouvent.
  if (resultat) {
    for (const bucket of Object.values(BUCKETS)) {
      const noms = await objets(bucket, resultat.jeton).catch(() => []);
      if (noms.length > 0) {
        await serviceClient()
          .storage.from(bucket)
          .remove(noms.map((nom) => `${resultat.jeton}/${nom}`));
      }
    }

    const livre = await queryOne<{ couverture_url: string | null }>(
      `select couverture_url from public.books where id = $1`,
      [resultat.bookId],
    );
    const jetonCouverture = livre?.couverture_url?.split('/')[1];
    if (jetonCouverture) {
      await serviceClient()
        .storage.from('covers')
        .remove(Object.keys(TAILLES_COUVERTURE).map((t) => `${jetonCouverture}/${t}.webp`));
    }

    await query(`delete from public.ingestion_jobs where book_id = $1`, [resultat.bookId]);
    await query(`delete from public.books where id = $1`, [resultat.bookId]);
  }

  await deleteTestUser(admin);
  await deleteTestUser(utilisateur);
  await closePool();
}, 120_000);

describe('critère d’acceptation de l’étape 7', () => {
  it('produit 2N images WebP pour un PDF de N pages', async () => {
    const noms = await objets(BUCKETS.pages, resultat.jeton);

    expect(resultat.nbPages).toBe(NB_PAGES_ATTENDU);
    expect(noms).toHaveLength(NB_PAGES_ATTENDU * 2);
    expect(noms.every((nom) => nom.endsWith('.webp'))).toBe(true);
  });

  it('produit les deux résolutions de chaque page', async () => {
    // §5.1 — une part importante de l'audience est sur connexion lente. Une
    // page dont l'allégée manquerait lui serait servie en pleine résolution.
    const noms = await objets(BUCKETS.pages, resultat.jeton);

    for (let page = 1; page <= NB_PAGES_ATTENDU; page += 1) {
      const numero = String(page).padStart(3, '0');
      for (const resolution of Object.keys(RESOLUTIONS)) {
        expect(noms, `page ${numero} en ${resolution}`).toContain(`${numero}-${resolution}.webp`);
      }
    }
  });

  it('rend l’allégée nettement plus légère que la haute', async () => {
    // Deux résolutions de poids identique ne serviraient à rien : c'est le
    // POIDS qui fait la différence sur une connexion lente, pas le nom.
    const pages = await query<{ chemin_haute: string; chemin_allegee: string }>(
      `select chemin_haute, chemin_allegee from public.book_pages
       where translation_id = $1 and numero = 4`,
      [resultat.translationId],
    );
    const page = pages[0];
    expect(page).toBeDefined();

    const haute = await telecharger(page!.chemin_haute);
    const allegee = await telecharger(page!.chemin_allegee);

    expect(allegee.byteLength).toBeLessThan(haute.byteLength / 2);
  }, 60_000);

  it('produit les 3 formats de couverture', async () => {
    const livre = await queryOne<{ couverture_url: string }>(
      `select couverture_url from public.books where id = $1`,
      [resultat.bookId],
    );

    expect(livre?.couverture_url).toMatch(/^covers\/[0-9a-f]{32}\/fiche\.webp$/);

    const jetonCouverture = livre!.couverture_url.split('/')[1]!;
    const noms = await objets('covers', jetonCouverture);

    expect(noms.sort()).toEqual(['fiche.webp', 'mise-en-avant.webp', 'vignette.webp']);
  });

  it('produit N pages de texte', async () => {
    const pages = await query<{ numero: number; texte: string | null }>(
      `select numero, texte from public.book_pages
       where translation_id = $1 order by numero`,
      [resultat.translationId],
    );

    expect(pages).toHaveLength(NB_PAGES_ATTENDU);
    // §7.4.4 : le corpus est généré numériquement, la couche texte est là.
    expect(resultat.coucheTexte).toBe(true);
    expect(pages.filter((p) => (p.texte ?? '').length > 0).length).toBeGreaterThan(0);
  });

  it('recolle la lettrine dans le texte enregistré', async () => {
    // Le défaut de gabarit du corpus, vérifié cette fois SUR LA BASE et non sur
    // la sortie de l'extracteur : c'est ce texte-là qui servira la recherche.
    const pages = await query<{ texte: string | null }>(
      `select texte from public.book_pages where translation_id = $1 order by numero`,
      [resultat.translationId],
    );
    const texte = pages.map((p) => p.texte ?? '').join('\n');

    expect(texte).toContain('À l’entrée');
    expect(texte).not.toContain('Àl’entrée');
  });

  it('crée 1 livre en BROUILLON, jamais publié', async () => {
    // §7.4.3 étape 6 : « le titre apparaît dans le back-office pour saisie des
    // métadonnées et validation avant mise en ligne. » Un titre publié
    // directement par la chaîne court-circuiterait cette validation.
    const livre = await queryOne<{
      statut: string;
      publie_le: string | null;
      slug: string;
      inclus_abonnement: boolean;
      disponible_achat: boolean;
      gratuit: boolean;
    }>(
      `select statut, publie_le, slug, inclus_abonnement, disponible_achat, gratuit
       from public.books where id = $1`,
      [resultat.bookId],
    );

    expect(livre?.statut).toBe('brouillon');
    // `publie_le` nul : la fenêtre de vente de 3 mois (§3.2) ne court pas
    // encore, puisqu'elle se compte depuis cette date.
    expect(livre?.publie_le).toBeNull();

    // La conclusion utile n'est pas « le slug vaut petit-baobab » : le jeu de
    // démonstration porte DÉJÀ ce slug. C'est donc le cas de collision qui est
    // éprouvé ici, et sur la vraie contrainte d'unicité de la base — le second
    // titre du même nom doit obtenir un slug distinct, sans faire échouer
    // l'ingestion.
    expect(livre?.slug).toMatch(/^petit-baobab-\d+$/);

    // La chaîne ne décide JAMAIS du modèle économique d'un titre (§3.2).
    expect(livre?.inclus_abonnement).toBe(false);
    expect(livre?.disponible_achat).toBe(false);
    expect(livre?.gratuit).toBe(false);
  });

  it('crée la version linguistique en brouillon, avec son nombre de pages', async () => {
    const traduction = await queryOne<{
      statut: string;
      langue: string;
      titre: string;
      nb_pages: number;
      fichier_telechargement: string;
    }>(
      `select statut, langue, titre, nb_pages, fichier_telechargement
       from public.book_translations where id = $1`,
      [resultat.translationId],
    );

    expect(traduction?.statut).toBe('brouillon');
    expect(traduction?.langue).toBe('fr');
    expect(traduction?.titre).toBe('Petit Baobab');
    expect(traduction?.nb_pages).toBe(NB_PAGES_ATTENDU);
    expect(traduction?.fichier_telechargement).toBe(cheminTelechargement(resultat.jeton, 'pdf'));
  });
});

describe('EPUB à mise en page fixe produit', () => {
  let epub: Buffer;
  let zip: JSZip;

  beforeAll(async () => {
    epub = await telecharger(cheminTelechargement(resultat.jeton, 'epub'));
    zip = await JSZip.loadAsync(epub);
  }, 60_000);

  it('est déposé à côté du PDF, sous le même radical', async () => {
    // La route de téléchargement (étape 6) obtient l'EPUB en remplaçant `.pdf`
    // par `.epub` sur le chemin stocké. Une autre convention la casserait.
    const noms = await objets(BUCKETS.telechargements, resultat.jeton);

    expect(noms.sort()).toEqual(['livre.epub', 'livre.pdf']);
  });

  it('porte la signature OCF en tête de fichier', () => {
    expect(epub.subarray(30, 38).toString('ascii')).toBe('mimetype');
    expect(epub.subarray(38, 58).toString('ascii')).toBe('application/epub+zip');
  });

  it('contient une image et un document par page', () => {
    for (let page = 1; page <= NB_PAGES_ATTENDU; page += 1) {
      const nom = `page-${String(page).padStart(3, '0')}`;
      expect(zip.file(`EPUB/${nom}.xhtml`), `${nom}.xhtml`).not.toBeNull();
      expect(zip.file(`EPUB/images/${nom}.${IMAGE_EPUB.extension}`), `${nom}`).not.toBeNull();
    }
  });

  it('embarque de vraies images, au format qu’il déclare', async () => {
    // Le manifeste annonce `image/jpeg`. Si l'encodage divergeait de cette
    // déclaration, le fichier resterait un zip parfaitement valide et le livre
    // s'ouvrirait sur des pages blanches — la panne la plus coûteuse à
    // diagnostiquer, parce que rien ne la signale à la fabrication.
    const image = await zip
      .file(`EPUB/images/page-001.${IMAGE_EPUB.extension}`)!
      .async('nodebuffer');

    // Marqueurs de début et de fin d'un JPEG.
    expect(image.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(image.subarray(image.byteLength - 2).toString('hex')).toBe('ffd9');
    // Une page d'album illustré ne pèse pas trois kilo-octets : un fichier
    // minuscule trahirait un rendu vide.
    expect(image.byteLength).toBeGreaterThan(10_000);
  });

  it('ne déclare rien qu’il ne contienne', async () => {
    // Un manifeste qui promet un fichier absent produit un livre qui s'ouvre
    // sur des pages blanches — et qu'un distributeur refuse.
    const opf = await zip.file('EPUB/package.opf')!.async('string');
    const href = [...opf.matchAll(/<item [^>]*href="([^"]+)"/g)].map((m) => m[1]!);

    expect(href.length).toBeGreaterThan(0);
    for (const chemin of href) {
      expect(zip.file(`EPUB/${chemin}`), `déclaré au manifeste mais absent : ${chemin}`).not.toBeNull();
    }
  });

  it('range le dos dans l’ordre des pages', async () => {
    const opf = await zip.file('EPUB/package.opf')!.async('string');
    const dos = [...opf.matchAll(/<itemref idref="page-(\d+)"\/>/g)].map((m) => Number(m[1]));

    expect(dos).toHaveLength(NB_PAGES_ATTENDU);
    expect(dos).toEqual([...dos].sort((a, b) => a - b));
  });

  it('embarque le texte accessible de §7.4.2', async () => {
    // « le texte de chaque page est extrait et inséré dans un bloc masqué
    // visuellement mais accessible aux lecteurs d'écran et à la recherche. »
    const xhtml = await zip.file('EPUB/page-004.xhtml')!.async('string');

    expect(xhtml).toContain('texte-accessible');
    expect(xhtml).toContain('À l’entrée');
  });

  it('donne à chaque page les dimensions réelles de son image', async () => {
    const xhtml = await zip.file('EPUB/page-001.xhtml')!.async('string');
    const viewport = /content="width=(\d+), height=(\d+)"/.exec(xhtml);

    expect(viewport).not.toBeNull();
    expect(Number(viewport![1])).toBe(RESOLUTIONS.haute);
    expect(Number(viewport![2])).toBeGreaterThan(RESOLUTIONS.haute);
  });

  /**
   * Validation par epubcheck, l'implémentation de référence du W3C.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ CE TEST S'EXÉCUTE TOUJOURS. IL N'EST PLUS CONDITIONNÉ À QUOI QUE CE    │
   * │ SOIT.                                                                  │
   * │                                                                        │
   * │ Le validateur est versionné sous `vendors/epubcheck/`. Auparavant, il  │
   * │ était téléchargé à l'installation par un paquet npm, et cette          │
   * │ installation pouvait ÉCHOUER SANS FAIRE ÉCHOUER `npm install` : une    │
   * │ intégration continue aurait alors été verte sans rien valider — pire   │
   * │ que pas de test du tout, puisque le tableau de bord affirmait le       │
   * │ contraire.                                                             │
   * │                                                                        │
   * │ Les vérifications de structure qui précèdent restent utiles : elles    │
   * │ disent POURQUOI un fichier est conforme, là où epubcheck se contente   │
   * │ de dire qu'il l'est.                                                   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  it(
    'passe la validation epubcheck du W3C sans aucune erreur',
    async () => {
      const rapport = await validerEpub(epub);
      const graves = messagesGraves(rapport);

      // Les messages sont rendus en clair : un test qui dirait seulement
      // « 3 erreurs » obligerait à relancer epubcheck à la main pour savoir
      // lesquelles.
      expect(graves.map((m) => `${m.ID ?? '?'} : ${m.message}`)).toEqual([]);
    },
    300_000,
  );

  it('produit un XML bien formé pour chaque document', async () => {
    // Contrôle grossier mais réel : un lecteur strict refuse le livre ENTIER
    // sur une seule balise mal fermée ou une esperluette nue.
    for (const chemin of ['EPUB/package.opf', 'EPUB/nav.xhtml', 'EPUB/page-001.xhtml']) {
      const contenu = await zip.file(chemin)!.async('string');

      expect(contenu.startsWith('<?xml'), `${chemin} sans déclaration XML`).toBe(true);
      // Une esperluette non suivie d'une entité est une erreur de conformité.
      expect(contenu, `${chemin} : esperluette non échappée`).not.toMatch(
        /&(?!amp;|lt;|gt;|quot;|apos;|#)/,
      );
    }
  });
});

describe('idempotence', () => {
  it('ne réingère pas deux fois le même fichier', async () => {
    // Un double clic dans le back-office, un envoi relancé après une coupure :
    // chacun créerait un second livre en brouillon, avec ses images en double.
    const second = await ingerer({ cheminPdf: CONTE, langue: 'fr' });

    expect(second.dejaIngere).toBe(true);
    expect(second.bookId).toBe(resultat.bookId);
    expect(second.translationId).toBe(resultat.translationId);
  }, 60_000);

  it('ne laisse qu’un seul livre pour cette empreinte', async () => {
    const lignes = await query<{ n: string }>(
      `select count(*)::text as n from public.ingestion_jobs
       where empreinte = (select empreinte from public.ingestion_jobs where book_id = $1 limit 1)
         and statut = 'termine'`,
      [resultat.bookId],
    );

    expect(lignes[0]?.n).toBe('1');
  });

  it('garde la trace de l’ingestion, terminée', async () => {
    const job = await queryOne<{ statut: string; etape: string; nb_pages: number; jeton: string }>(
      `select statut, etape, nb_pages, jeton from public.ingestion_jobs where id = $1`,
      [resultat.jobId],
    );

    expect(job?.statut).toBe('termine');
    expect(job?.nb_pages).toBe(NB_PAGES_ATTENDU);
    expect(job?.jeton).toBe(resultat.jeton);
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VERSION ANGLAISE EST UNE VERSION, PAS UN SECOND CONTE.                │
 * │                                                                          │
 * │ §5.5 : un livre est une entité parente avec N déclinaisons linguistiques, │
 * │ et un droit d'accès porte sur le LIVRE. Sans `bookId`, déposer la         │
 * │ traduction créait un second `books` au slug suffixé — donc un second prix │
 * │ à saisir, une seconde publication à faire, et un acheteur du français     │
 * │ sans aucun droit sur l'anglais qu'il croyait avoir acheté.                │
 * │                                                                          │
 * │ Le défaut ne se voyait nulle part : les deux titres existaient, tous deux │
 * │ corrects, et rien ne disait qu'ils auraient dû n'en faire qu'un.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('rattachement d’une version à un titre existant', () => {
  const SECOND = join(CORPUS, 'Zakou et le tambour.pdf');
  /*
   * Un TROISIÈME fichier pour le contre-test, et ce n'est pas un détail.
   *
   * Rejouer `SECOND` ne lèverait rien : `ingerer` reconnaît son empreinte et
   * rend l'ingestion déjà faite sans jamais atteindre le rattachement. Le test
   * passerait en ne prouvant rien — le pire des deux mondes.
   */
  const TROISIEME = join(CORPUS, 'La rivière qui parlait.pdf');

  let ajoutee: ResultatIngestion | null = null;
  let parentAvant: { slug: string; auteur: string } | null = null;

  afterAll(async () => {
    // Les fichiers de CETTE ingestion-ci : le livre parent, lui, est effacé par
    // le nettoyage général, et sa cascade emportera la version ajoutée.
    if (ajoutee) {
      for (const bucket of Object.values(BUCKETS)) {
        const noms = await objets(bucket, ajoutee.jeton).catch(() => []);
        if (noms.length > 0) {
          await serviceClient()
            .storage.from(bucket)
            .remove(noms.map((nom) => `${ajoutee!.jeton}/${nom}`));
        }
      }
      await query(`delete from public.ingestion_jobs where translation_id = $1`, [
        ajoutee.translationId,
      ]);
    }
  }, 120_000);

  it('ajoute une VERSION, sans créer de second livre', async () => {
    if (!existsSync(SECOND)) {
      throw new Error(`Corpus introuvable : ${SECOND}.`);
    }

    const avant = await queryOne<{ n: string }>(`select count(*)::text as n from public.books`);
    parentAvant =
      (await queryOne<{ slug: string; auteur: string }>(
        `select slug, auteur from public.books where id = $1`,
        [resultat.bookId],
      )) ?? null;

    ajoutee = await ingerer({ cheminPdf: SECOND, langue: 'en', bookId: resultat.bookId });

    // Le MÊME livre, et une AUTRE version.
    expect(ajoutee.bookId).toBe(resultat.bookId);
    expect(ajoutee.translationId).not.toBe(resultat.translationId);

    const apres = await queryOne<{ n: string }>(`select count(*)::text as n from public.books`);
    expect(Number(apres?.n)).toBe(Number(avant?.n));

    const versions = await query<{ langue: string }>(
      `select langue from public.book_translations where book_id = $1 order by langue`,
      [resultat.bookId],
    );
    expect(versions.map((v) => v.langue)).toEqual(['en', 'fr']);
  }, 300_000);

  it('ne touche NI le slug NI l’auteur du titre parent', async () => {
    // Ils appartiennent au livre, pas à la version qu'on ajoute. Le slug est
    // dans l'adresse publique du conte : le voir changer parce qu'on a déposé
    // une traduction casserait tous les liens partagés.
    expect(parentAvant).not.toBeNull();

    const parent = await queryOne<{ slug: string; auteur: string }>(
      `select slug, auteur from public.books where id = $1`,
      [resultat.bookId],
    );

    expect(parent?.slug).toBe(resultat.slug);
    expect(parent?.slug).toBe(parentAvant?.slug);
    expect(parent?.auteur).toBe(parentAvant?.auteur);
  });

  it('LÈVE sur un identifiant introuvable, plutôt que de créer un doublon', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Un identifiant fourni et introuvable est une erreur d'APPEL. Y       │
    // │ répondre en créant un nouveau titre serait exactement le défaut       │
    // │ qu'on corrige, et il passerait inaperçu : l'appelant recevrait un     │
    // │ succès, avec un identifiant de livre qui n'est pas celui demandé.     │
    // └────────────────────────────────────────────────────────────────────┘
    if (!existsSync(TROISIEME)) {
      throw new Error(`Corpus introuvable : ${TROISIEME}.`);
    }

    const avant = await queryOne<{ n: string }>(`select count(*)::text as n from public.books`);

    try {
      await expect(
        ingerer({
          cheminPdf: TROISIEME,
          langue: 'fr',
          bookId: '11111111-1111-1111-1111-111111111111',
        }),
      ).rejects.toThrow(/introuvable/i);

      const apres = await queryOne<{ n: string }>(`select count(*)::text as n from public.books`);
      expect(Number(apres?.n)).toBe(Number(avant?.n));
    } finally {
      // L'échec laisse sa trace en `ingestion_jobs`, ce qui est voulu — elle
      // sert au diagnostic. Elle n'a rien à faire dans le jeu de démonstration
      // que relisent les autres suites, d'où ce ménage.
      await query(`delete from public.ingestion_jobs where statut = 'echoue' and book_id is null`);
    }
  }, 120_000);
});

describe('route de dépôt', () => {
  function requete(fichier: Buffer | null, options: { jeton?: string; nom?: string } = {}): Request {
    const formulaire = new FormData();
    if (fichier) {
      formulaire.set(
        'fichier',
        new File([new Uint8Array(fichier)], options.nom ?? 'conte.pdf', {
          type: 'application/pdf',
        }),
      );
    }
    formulaire.set('langue', 'fr');

    const entetes = new Headers();
    if (options.jeton) entetes.set('authorization', `Bearer ${options.jeton}`);

    return new Request('http://localhost:3000/api/admin/books/ingest', {
      method: 'POST',
      headers: entetes,
      body: formulaire,
    });
  }

  it('refuse un visiteur non connecté', async () => {
    const reponse = await ingestionRoute(requete(readFileSync(CONTE)));

    expect(reponse.status).toBe(401);
  });

  it('refuse un utilisateur ordinaire', async () => {
    // La distinction 401/403 est volontaire : un compte connecté sans le rôle
    // n'est pas un visiteur anonyme.
    const reponse = await ingestionRoute(
      requete(readFileSync(CONTE), { jeton: utilisateur.accessToken }),
    );

    expect(reponse.status).toBe(403);
  });

  it('accepte un administrateur, et reconnaît un fichier déjà ingéré', async () => {
    // Le même conte que `beforeAll` : la route doit rendre l'ingestion
    // existante sans rien refabriquer.
    const reponse = await ingestionRoute(
      requete(readFileSync(CONTE), { jeton: admin.accessToken }),
    );

    expect(reponse.status).toBe(201);
    const corps = await corpsJson<{
      livre_id: string;
      deja_ingere: boolean;
      statut: string;
      couche_texte: boolean;
      nb_pages: number;
    }>(reponse);

    expect(corps.livre_id).toBe(resultat.bookId);
    expect(corps.deja_ingere).toBe(true);
    expect(corps.statut).toBe('brouillon');
    expect(corps.couche_texte).toBe(true);
    expect(corps.nb_pages).toBe(NB_PAGES_ATTENDU);
  }, 60_000);

  it('refuse un fichier qui n’est pas un PDF', async () => {
    // Le type déclaré par le client n'est pas une preuve : celui-ci annonce
    // `application/pdf` et n'en est pas un.
    const reponse = await ingestionRoute(
      requete(Buffer.from('PK pas un pdf'), { jeton: admin.accessToken }),
    );

    expect(reponse.status).toBe(400);
    const corps = await corpsJson<ReponseErreur>(reponse);
    expect(corps.erreur.champs?.['fichier']).toBeDefined();
  });

  it('refuse une requête sans fichier', async () => {
    const reponse = await ingestionRoute(requete(null, { jeton: admin.accessToken }));

    expect(reponse.status).toBe(400);
  });

  it('refuse un fichier vide', async () => {
    const reponse = await ingestionRoute(
      requete(Buffer.alloc(0), { jeton: admin.accessToken }),
    );

    expect(reponse.status).toBe(400);
  });

  /**
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ UN CHAMP FACULTATIF LAISSÉ VIDE — LE CAS QU'AUCUN TEST N'EXERÇAIT.    │
   * │                                                                        │
   * │ `titre` et `auteur` sont facultatifs, et l'écran de dépôt invite en     │
   * │ toutes lettres à les laisser vides : la chaîne d'ingestion les lit      │
   * │ dans le PDF.                                                            │
   * │                                                                        │
   * │ Mais un `<input>` vide n'est pas ABSENT du corps multipart — il y       │
   * │ figure avec la valeur `''`, que `z.string().min(1)` rejetait. Le dépôt  │
   * │ échouait donc pour tout éditeur qui suivait le conseil de l'écran.      │
   * │                                                                        │
   * │ Les tests ci-dessus construisent leur `FormData` à la main et n'y       │
   * │ posent que `fichier` et `langue` : ils ne pouvaient pas le voir. Seul   │
   * │ un vrai navigateur envoie des champs vides — c'est ce qui l'a révélé.   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  function requeteAvecChamps(fichier: Buffer, champs: Record<string, string>): Request {
    const formulaire = new FormData();
    formulaire.set(
      'fichier',
      new File([new Uint8Array(fichier)], 'conte.pdf', { type: 'application/pdf' }),
    );
    formulaire.set('langue', 'fr');
    for (const [nom, valeur] of Object.entries(champs)) formulaire.set(nom, valeur);

    return new Request('http://localhost:3000/api/admin/books/ingest', {
      method: 'POST',
      headers: new Headers({ authorization: `Bearer ${admin.accessToken}` }),
      body: formulaire,
    });
  }

  it('ACCEPTE un titre et un auteur laissés vides, comme le fait un navigateur', async () => {
    // Le fichier est délibérément illisible : ce test porte sur la VALIDATION
    // des champs, pas sur l'ingestion, et un conte entier prendrait des
    // minutes. Un refus dû aux champs rend 400 avec `champs.titre` renseigné ;
    // c'est précisément ce qui ne doit plus arriver.
    const reponse = await ingestionRoute(
      requeteAvecChamps(Buffer.from('%PDF-1.4 tronqué'), { titre: '', auteur: '' }),
    );

    const corps = await corpsJson<ReponseErreur>(reponse.clone());

    expect(corps.erreur?.champs?.['titre']).toBeUndefined();
    expect(corps.erreur?.champs?.['auteur']).toBeUndefined();
  }, 60_000);

  it('refuse toujours un titre RENSEIGNÉ mais trop long', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE CONTRE-TEST. Traiter le vide comme absent ne doit pas relâcher le  │
    // │ contrôle sur ce qui est réellement saisi — sans cette assertion, on   │
    // │ pourrait satisfaire le test précédent en retirant la validation.      │
    // └──────────────────────────────────────────────────────────────────────┘
    const reponse = await ingestionRoute(
      requeteAvecChamps(Buffer.from('%PDF-1.4 tronqué'), { titre: 'x'.repeat(301) }),
    );

    expect(reponse.status).toBe(400);
    const corps = await corpsJson<ReponseErreur>(reponse);
    expect(corps.erreur.champs?.['titre']).toBeDefined();
  });

  it('ne divulgue jamais de chemin serveur dans une erreur', async () => {
    // CLAUDE.md : « Les erreurs renvoyées au client ne divulguent jamais de
    // détail interne. » Le corps de la réponse ne doit contenir ni chemin de
    // fichier ni message de sous-processus.
    const reponse = await ingestionRoute(
      requete(Buffer.from('%PDF-1.4 tronqué et illisible'), { jeton: admin.accessToken }),
    );

    const brut = await reponse.text();
    expect(brut).not.toMatch(/[A-Za-z]:\\|\/tmp\/|AppData|poppler/i);
  }, 60_000);
});

describe('le contenu ingéré reste hors de portée d’un client', () => {
  it('n’est pas lisible dans les bucket privés', async () => {
    // CLAUDE.md règle 3 : les bucket de fichiers sont privés. §6.2 : « un
    // utilisateur pourrait partager une URL de fichier et contourner
    // intégralement le modèle économique. »
    for (const bucket of Object.values(BUCKETS)) {
      const { data, error } = await utilisateur.client.storage.from(bucket).list(resultat.jeton);

      expect(error !== null || (data ?? []).length === 0, `${bucket} lisible par un client`).toBe(
        true,
      );
    }
  });

  it('n’est pas lisible par une lecture directe de book_pages', async () => {
    const { data, error } = await utilisateur.client
      .from('book_pages')
      .select('chemin_haute')
      .eq('translation_id', resultat.translationId);

    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('mais la couverture, elle, est publique — et c’est voulu', async () => {
    // §5.4 : une couverture est un argument de vente, elle doit être indexable
    // par les moteurs de recherche et servie par le CDN.
    const livre = await queryOne<{ couverture_url: string }>(
      `select couverture_url from public.books where id = $1`,
      [resultat.bookId],
    );
    const chemin = livre!.couverture_url.replace(/^covers\//, '');

    const { data } = serviceClient().storage.from('covers').getPublicUrl(chemin);
    const reponse = await fetch(data.publicUrl);

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('content-type')).toContain('image/webp');
  });
});
