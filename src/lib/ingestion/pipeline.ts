import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import { analyser, extraireTextePages, type AnalysePdf } from './analyze';
import { rendrePages } from './render-pages';
import { declinerCouverture } from './cover';
import { enregistrerPages, effacerPages, type PageAEnregistrer } from './pages-repository';
import {
  cheminTelechargement,
  deposerPage,
  deposerSource,
  deposerTelechargeables,
  nettoyerStockage,
  nouveauJetonStockage,
} from './storage';
import { assemblerEpub, IMAGE_EPUB, type PageEpub } from '@/domain/ingestion/epub';
import { slugDisponible } from '@/domain/ingestion/slug';
import { publierCouverture, retirerCouvertures } from '@/lib/storage/covers';
import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import { getClock, type Clock } from '@/lib/clock';
import { logger } from '@/lib/logger';

/**
 * Orchestration de la chaîne d'ingestion — §7.4.3.
 *
 * Les six étapes de la spécification, dans l'ordre :
 *   1. analyse (couche texte, pages, dimensions)        → `analyze.ts`
 *   2. rendu des pages en deux résolutions              → `render-pages.ts`
 *   3. couverture aux trois formats du catalogue        → `cover.ts`
 *   4. EPUB à mise en page fixe (voie B)                → `domain/ingestion/epub.ts`
 *   5. extraction de la couche texte                    → `analyze.ts`
 *   6. publication EN BROUILLON                         → ici
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'INGESTION NE PUBLIE JAMAIS.                                            │
 * │                                                                          │
 * │ §7.4.3 étape 6 : « le titre apparaît dans le back-office pour saisie des │
 * │ métadonnées et validation avant mise en ligne. » Le livre est donc créé  │
 * │ en `brouillon`, sa traduction aussi, et `publie_le` reste nul.           │
 * │                                                                          │
 * │ La conséquence est voulue : tant que l'éditeur n'a pas validé, le titre  │
 * │ est invisible au catalogue, et la fenêtre de vente de 3 mois — qui se    │
 * │ compte depuis `publie_le` — n'a pas commencé à courir.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export interface DemandeIngestion {
  /** Chemin du PDF sur le disque du serveur. */
  cheminPdf: string;
  langue: 'fr' | 'en';
  /** À défaut, le titre est lu dans les métadonnées du PDF, puis du nom de fichier. */
  titre?: string;
  auteur?: string;
  /**
   * Titre AUQUEL RATTACHER cette version, au lieu d'en créer un nouveau.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ SANS CELA, LA VERSION ANGLAISE D'UN CONTE DEVENAIT UN SECOND CONTE.   │
   * │                                                                        │
   * │ §5.5 : un livre est une entité parente avec N déclinaisons             │
   * │ linguistiques, et un droit d'accès porte sur le LIVRE, jamais sur une  │
   * │ version. Déposer la traduction anglaise créait pourtant un second      │
   * │ `books`, au slug suffixé `-2` — donc un second prix à saisir, une      │
   * │ seconde publication à faire, et un acheteur du français qui n'avait    │
   * │ aucun droit sur l'anglais.                                            │
   * │                                                                        │
   * │ Le slug, le titre parent et les champs métier ne sont alors PAS        │
   * │ touchés : ils appartiennent au livre, pas à la version qu'on ajoute.   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  bookId?: string;
}

export interface ResultatIngestion {
  jobId: string;
  bookId: string;
  translationId: string;
  slug: string;
  titre: string;
  jeton: string;
  nbPages: number;
  /** §7.4.4 — faux pour un PDF scanné : les pages seront muettes. */
  coucheTexte: boolean;
  /** Vrai si ce fichier avait déjà été ingéré : rien n'a été refait. */
  dejaIngere: boolean;
}

export interface OptionsIngestion {
  client?: AppSupabaseClient;
  clock?: Clock;
}

/**
 * Valeur portée par `books.auteur`, qui est NOT NULL, quand rien ne la
 * renseigne.
 *
 * Ni le PDF ni l'appelant ne fournissent toujours un auteur. Inventer un nom
 * serait pire que tout : la fiche est un BROUILLON destiné à être complété au
 * back-office (§7.4.3 étape 6), et une mention visiblement à remplir dit à
 * l'éditeur ce qu'il lui reste à faire.
 */
const AUTEUR_A_RENSEIGNER = 'À renseigner';

/**
 * Ingère un PDF.
 *
 * Idempotent par l'empreinte du CONTENU : redéposer le même fichier rend
 * l'ingestion existante au lieu d'en créer une seconde. Le nom du fichier n'y
 * joue aucun rôle — il change à chaque réenregistrement, le contenu non.
 */
export async function ingerer(
  demande: DemandeIngestion,
  options: OptionsIngestion = {},
): Promise<ResultatIngestion> {
  const client = options.client ?? createServiceClient();
  const clock = options.clock ?? getClock();

  const analyse = await analyser(demande.cheminPdf);

  const deja = await ingestionExistante(client, analyse.empreinte);
  if (deja) {
    logger.info('Ingestion déjà faite, rien à refaire', {
      empreinte: analyse.empreinte.slice(0, 12),
      bookId: deja.bookId,
    });
    return deja;
  }

  const jeton = nouveauJetonStockage();
  const titre = resoudreTitre(demande, analyse);

  const job = await client
    .from('ingestion_jobs')
    .insert({
      chemin_source: demande.cheminPdf,
      statut: 'en_cours',
      etape: 'analyse',
      empreinte: analyse.empreinte,
      jeton,
      nb_pages: analyse.nbPages,
      couche_texte: analyse.coucheTexte,
    })
    .select('id')
    .single();

  if (job.error || !job.data) {
    throw new Error(`Suivi d'ingestion impossible : ${job.error.message}`);
  }
  const jobId = job.data.id;

  // Le jeton de couverture est distinct de celui du stockage privé : le bucket
  // des couvertures est PUBLIC, et rien ne doit permettre de déduire l'un de
  // l'autre. Il est retenu ici pour pouvoir être nettoyé en cas d'échec.
  let jetonCouverture: string | null = null;
  let translationId: string | null = null;

  try {
    const cree = await creerBrouillon(client, { titre, langue: demande.langue, analyse, demande });
    translationId = cree.translationId;

    await marquer(client, jobId, {
      etape: 'depot_source',
      book_id: cree.bookId,
      translation_id: cree.translationId,
    });
    await deposerSource(jeton, await readFile(demande.cheminPdf), { client });

    // §7.4.3 étape 5. Extraite AVANT le rendu : si la couche texte manque, on
    // le sait avant d'avoir passé plusieurs minutes à fabriquer des images.
    await marquer(client, jobId, { etape: 'extraction_texte' });
    const textes = analyse.coucheTexte
      ? await extraireTextePages(demande.cheminPdf, analyse.nbPages)
      : [];

    await marquer(client, jobId, { etape: 'rendu_pages' });
    const { pages, pagesEpub, couverture } = await produirePages(
      demande.cheminPdf,
      analyse.nbPages,
      textes,
      jeton,
      client,
    );

    await marquer(client, jobId, { etape: 'couverture' });
    const publiee = await publierCouverture(await declinerCouverture(couverture), { client });
    jetonCouverture = publiee.jeton;

    await marquer(client, jobId, { etape: 'epub' });
    const epub = await assemblerEpub(pagesEpub, {
      titre,
      auteur: cree.auteur,
      langue: demande.langue,
      identifiant: cree.bookId,
      modifieLe: clock.now(),
    });

    await marquer(client, jobId, { etape: 'depot_telechargeables' });
    await deposerTelechargeables(
      jeton,
      // Le PDF téléchargeable est le PDF source à ce stade. Le filigrane
      // personnalisé (§9.4) est apposé À L'ACHAT, pas à l'ingestion : il porte
      // le nom de l'acheteur, qui n'existe pas encore. C'est l'étape 11.
      { pdf: await readFile(demande.cheminPdf), epub },
      { client },
    );

    await marquer(client, jobId, { etape: 'enregistrement_pages' });
    await enregistrerPages(cree.translationId, pages, { client });

    await finaliser(client, {
      bookId: cree.bookId,
      translationId: cree.translationId,
      nbPages: analyse.nbPages,
      couvertureUrl: publiee.chemins.fiche,
      // Le JETON, et non trois chemins : c'est lui qui porte l'identité du jeu
      // de couvertures, et `src/lib/storage/covers.ts` reste seul à connaître
      // la convention qui en dérive les trois tailles.
      couvertureJeton: publiee.jeton,
      cheminTelechargement: cheminTelechargement(jeton, 'pdf'),
    });

    await marquer(client, jobId, { etape: 'termine', statut: 'termine' });

    logger.info('Ingestion terminée', {
      jobId,
      bookId: cree.bookId,
      titre,
      nbPages: analyse.nbPages,
      coucheTexte: analyse.coucheTexte,
    });

    return {
      jobId,
      bookId: cree.bookId,
      translationId: cree.translationId,
      slug: cree.slug,
      titre,
      jeton,
      nbPages: analyse.nbPages,
      coucheTexte: analyse.coucheTexte,
      dejaIngere: false,
    };
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);

    await marquer(client, jobId, {
      statut: 'echoue',
      // Tronqué : un message de sous-processus peut faire plusieurs pages, et
      // la colonne sert au diagnostic, pas à l'archivage.
      erreur: detail.slice(0, 2000),
    });

    // Le nettoyage vient APRÈS l'enregistrement de l'échec : si le balayage
    // échoue à son tour, la trace de l'erreur d'origine est déjà en base.
    await nettoyerApresEchec(client, { jeton, jetonCouverture, translationId });

    logger.error('Ingestion échouée', { jobId, jeton, detail });
    throw erreur;
  }
}

/** Titre du livre, par ordre de confiance décroissant. */
function resoudreTitre(demande: DemandeIngestion, analyse: AnalysePdf): string {
  const candidat = demande.titre ?? analyse.titre ?? basename(demande.cheminPdf, '.pdf');
  return candidat.trim() || basename(demande.cheminPdf, '.pdf');
}

/** Ingestion déjà terminée pour cette empreinte, s'il y en a une. */
async function ingestionExistante(
  client: AppSupabaseClient,
  empreinte: string,
): Promise<ResultatIngestion | null> {
  const { data } = await client
    .from('ingestion_jobs')
    .select('id, book_id, translation_id, jeton, nb_pages, couche_texte, books(slug)')
    .eq('empreinte', empreinte)
    .eq('statut', 'termine')
    .maybeSingle();

  if (!data?.book_id || !data.translation_id) return null;

  const traduction = await client
    .from('book_translations')
    .select('titre')
    .eq('id', data.translation_id)
    .maybeSingle();

  return {
    jobId: data.id,
    bookId: data.book_id,
    translationId: data.translation_id,
    slug: data.books?.slug ?? '',
    titre: traduction.data?.titre ?? '',
    jeton: data.jeton ?? '',
    nbPages: data.nb_pages ?? 0,
    coucheTexte: data.couche_texte ?? false,
    dejaIngere: true,
  };
}

/** Crée le livre et sa version linguistique, tous deux en brouillon. */
async function creerBrouillon(
  client: AppSupabaseClient,
  contexte: {
    titre: string;
    langue: 'fr' | 'en';
    analyse: AnalysePdf;
    demande: DemandeIngestion;
  },
): Promise<{ bookId: string; translationId: string; slug: string; auteur: string }> {
  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ DEUX CHEMINS, ET LE SECOND NE TOUCHE PAS AU LIVRE.                    │
   * │                                                                        │
   * │ Rattacher une version à un titre existant ne doit RIEN changer de ce   │
   * │ titre : ni son slug — il est dans l'URL publique — ni son auteur, ni   │
   * │ ses champs métier, ni son statut. Un éditeur qui ajoute la version     │
   * │ anglaise ne s'attend pas à voir le titre français repasser en          │
   * │ brouillon, ni son auteur remplacé par celui qu'un PDF traduit porte    │
   * │ en métadonnée.                                                         │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const rattachement = await livreExistant(client, contexte.demande.bookId);

  const slug = rattachement
    ? rattachement.slug
    : await slugDisponible(contexte.titre, async (candidat) => {
        const { data } = await client.from('books').select('id').eq('slug', candidat).maybeSingle();
        return data !== null;
      });

  const auteur =
    rattachement?.auteur ??
    contexte.demande.auteur ??
    contexte.analyse.auteur ??
    AUTEUR_A_RENSEIGNER;

  let bookId = rattachement?.id ?? null;

  if (bookId === null) {
    const livre = await client
      .from('books')
      .insert({
        slug,
        auteur,
        // Tout le reste est laissé à l'éditeur. En particulier :
        //   * `inclus_abonnement` et `disponible_achat` restent faux — la chaîne
        //     ne décide pas du modèle économique d'un titre (§3.2) ;
        //   * `publie_le` reste nul — la fenêtre de 3 mois ne court pas encore.
        statut: 'brouillon',
      })
      .select('id')
      .single();

    if (livre.error || !livre.data) {
      throw new Error(`Création du livre impossible : ${livre.error.message}`);
    }
    bookId = livre.data.id;
  }

  const traduction = await client
    .from('book_translations')
    .insert({
      book_id: bookId,
      langue: contexte.langue,
      titre: contexte.titre,
      nb_pages: contexte.analyse.nbPages,
      statut: 'brouillon',
    })
    .select('id')
    .single();

  if (traduction.error || !traduction.data) {
    // La contrainte `unique (book_id, langue)` mord ici quand la version
    // existe déjà. Le message le dit plutôt que de laisser remonter une
    // violation de contrainte, que l'écran afficherait telle quelle.
    throw new Error(`Création de la version linguistique impossible : ${traduction.error.message}`);
  }

  return { bookId, translationId: traduction.data.id, slug, auteur };
}

/**
 * Le titre auquel rattacher, s'il en a été demandé un.
 *
 * Lève plutôt que de retomber sur la création d'un nouveau titre : un
 * identifiant fourni et introuvable est une erreur d'appel, et créer
 * silencieusement un doublon serait exactement le défaut qu'on corrige.
 */
async function livreExistant(
  client: AppSupabaseClient,
  bookId: string | undefined,
): Promise<{ id: string; slug: string; auteur: string } | null> {
  if (!bookId) return null;

  const { data, error } = await client
    .from('books')
    .select('id, slug, auteur')
    .eq('id', bookId)
    .maybeSingle();

  if (error) throw new Error(`Lecture du titre impossible : ${error.message}`);
  if (!data) throw new Error(`Titre ${bookId} introuvable : aucune version n'y a été rattachée.`);

  return data;
}

interface PagesProduites {
  pages: PageAEnregistrer[];
  pagesEpub: PageEpub[];
  /** Rendu brut de la première page, dont la couverture est tirée. */
  couverture: Buffer;
}

/**
 * Encode une page au format attendu à l'intérieur de l'EPUB.
 *
 * Le format est déclaré par le module qui écrit le manifeste, jamais choisi
 * ici : `IMAGE_EPUB.mediaType` part dans le `package.opf`, et un encodage qui
 * ne lui correspondrait plus produirait un EPUB dont le manifeste ment sur son
 * propre contenu — un livre qui s'ouvre sur des pages blanches, refusé par
 * tout validateur. Le garde-fou rend la divergence bruyante.
 */
async function encoderPourEpub(png: Buffer): Promise<Buffer> {
  if (IMAGE_EPUB.mediaType !== 'image/jpeg') {
    throw new Error(`Format d'image EPUB non pris en charge : ${String(IMAGE_EPUB.mediaType)}.`);
  }
  return await sharp(png).jpeg({ quality: 82, progressive: true }).toBuffer();
}

/**
 * Rend, dépose et rassemble les pages.
 *
 * Les images WebP sont déposées puis RELÂCHÉES page par page : seules les
 * images de l'EPUB restent en mémoire, parce qu'un zip ne peut être assemblé
 * qu'une fois toutes ses entrées connues. C'est le poste de consommation
 * principal de la chaîne, et il est borné par `LIMITES.pagesMax`.
 */
async function produirePages(
  cheminPdf: string,
  nbPages: number,
  textes: readonly string[],
  jeton: string,
  client: AppSupabaseClient,
): Promise<PagesProduites> {
  const pages: PageAEnregistrer[] = [];
  const pagesEpub: PageEpub[] = [];
  let couverture: Buffer | null = null;

  await rendrePages(cheminPdf, nbPages, async (page) => {
    const chemins = await deposerPage(jeton, page.numero, page.images, { client });

    // Le texte est indexé par numéro de page, l'extraction en ayant produit un
    // par page — chaîne vide comprise, pour une page sans texte.
    const texte = textes[page.numero - 1] ?? '';

    pages.push({
      numero: page.numero,
      cheminHaute: chemins.haute,
      cheminAllegee: chemins.allegee,
      largeur: page.largeur,
      hauteur: page.hauteur,
      // `null` et non chaîne vide : la colonne est nullable, et distinguer
      // « pas de texte » de « texte vide » facilite le diagnostic d'un scan.
      texte: texte.length > 0 ? texte : null,
    });

    pagesEpub.push({
      numero: page.numero,
      image: await encoderPourEpub(page.source),
      largeur: page.largeur,
      hauteur: page.hauteur,
      texte,
    });

    if (page.numero === 1) couverture = page.source;
  });

  if (couverture === null) {
    throw new Error('Rendu sans première page : couverture impossible.');
  }

  return { pages, pagesEpub, couverture };
}

/** Rattache les fichiers produits au livre et à sa traduction. */
async function finaliser(
  client: AppSupabaseClient,
  valeurs: {
    bookId: string;
    translationId: string;
    nbPages: number;
    couvertureUrl: string;
    couvertureJeton: string;
    cheminTelechargement: string;
  },
): Promise<void> {
  const livre = await client
    .from('books')
    .update({
      couverture_url: valeurs.couvertureUrl,
      couverture_jeton: valeurs.couvertureJeton,
    })
    .eq('id', valeurs.bookId);

  if (livre.error) {
    throw new Error(`Mise à jour du livre impossible : ${livre.error.message}`);
  }

  const traduction = await client
    .from('book_translations')
    .update({
      fichier_lecture: `book-pages/${valeurs.bookId}`,
      fichier_telechargement: valeurs.cheminTelechargement,
      nb_pages: valeurs.nbPages,
    })
    .eq('id', valeurs.translationId);

  if (traduction.error) {
    throw new Error(`Mise à jour de la traduction impossible : ${traduction.error.message}`);
  }
}

/** Met à jour le suivi. Les échecs y sont tracés, jamais propagés. */
async function marquer(
  client: AppSupabaseClient,
  jobId: string,
  valeurs: Record<string, unknown>,
): Promise<void> {
  const { error } = await client
    .from('ingestion_jobs')
    .update(valeurs as never)
    .eq('id', jobId);

  if (error) {
    logger.warn('Suivi d’ingestion non mis à jour', { jobId, detail: error.message });
  }
}

/**
 * Efface ce qu'une ingestion échouée a laissé derrière elle.
 *
 * Le livre en brouillon est CONSERVÉ, volontairement : il porte la trace de
 * l'échec pour l'éditeur, il est invisible au catalogue tant qu'il est en
 * brouillon, et le supprimer effacerait aussi la ligne de suivi qui explique
 * ce qui s'est passé. Ce sont les FICHIERS qui sont nettoyés — eux seuls
 * occupent du stockage sans que rien ne les rattache.
 */
async function nettoyerApresEchec(
  client: AppSupabaseClient,
  quoi: { jeton: string; jetonCouverture: string | null; translationId: string | null },
): Promise<void> {
  try {
    await nettoyerStockage(quoi.jeton, { client });
    if (quoi.jetonCouverture) {
      await retirerCouvertures(quoi.jetonCouverture, { client });
    }
    if (quoi.translationId) {
      await effacerPages(quoi.translationId, { client });
    }
  } catch (erreur) {
    logger.warn('Nettoyage après échec incomplet', { jeton: quoi.jeton, detail: erreur });
  }
}
