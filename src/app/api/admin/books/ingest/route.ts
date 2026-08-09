import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

import { gardeAdmin } from '@/lib/admin/route-helpers';
import { Semaphore, avecDelai } from '@/lib/http/concurrence';
import { errors, fail, created } from '@/lib/http/responses';
import { ingerer } from '@/lib/ingestion/pipeline';
import { logger } from '@/lib/logger';

/**
 * Dépôt d'un PDF — §7.4.3.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FICHIER EST TÉLÉVERSÉ. LE CLIENT NE DÉSIGNE JAMAIS UN CHEMIN SERVEUR. │
 * │                                                                          │
 * │ La chaîne d'ingestion travaille à partir d'un chemin sur le disque, et il │
 * │ aurait été plus court d'accepter ce chemin dans le corps de la requête.   │
 * │ Cela aurait donné à tout compte administrateur une lecture arbitraire du  │
 * │ système de fichiers : déposer `/etc/shadow` ou un fichier `.env` aurait   │
 * │ recopié son contenu dans le stockage, puis l'aurait rendu par une URL     │
 * │ signée. Une restriction à un dossier autorisé aurait déplacé le problème  │
 * │ sur la qualité de la vérification anti-remontée (`..`, liens symboliques, │
 * │ chemins UNC).                                                            │
 * │                                                                          │
 * │ Le fichier arrive donc par le corps de la requête et n'existe, côté       │
 * │ serveur, que dans un dossier temporaire effacé en fin de traitement.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Réservée aux administrateurs : un utilisateur ordinaire reçoit 403, un
 * visiteur 401.
 */

/**
 * Taille maximale acceptée.
 *
 * Alignée sur la limite du bucket `book-sources` (migration 0020) : accepter
 * ici un fichier que le stockage refusera ensuite ferait échouer l'ingestion
 * après plusieurs minutes de travail, au lieu de la refuser tout de suite.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EXPORTÉE PARCE QU'UN TROISIÈME PLAFOND EXISTE, AILLEURS.                │
 * │                                                                          │
 * │ L'écran de dépôt passe par une Server Action, dont Next borne le corps —  │
 * │ à 1 Mo par défaut, ce qui faisait échouer CHAQUE conte du corpus, tous    │
 * │ au-dessus de 1,1 Mo. `next.config.ts` relève donc ce plafond, et un test  │
 * │ unitaire vérifie qu'il vaut bien celui-ci : un plafond plus bas là-bas    │
 * │ refuserait en silence ce que cette route accepte.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const TAILLE_MAX_OCTETS = 100 * 1024 * 1024;

/**
 * Limitation de concurrence de l'ingestion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PLAFOND DE 100 Mo BORNE LA REQUÊTE, PAS L'AGRÉGAT.                   │
 * │                                                                          │
 * │ C'était l'angle mort de cette route. Un jeton d'administration compromis  │
 * │ pouvait enchaîner les soumissions : chacune reste sous les 100 Mo, mais   │
 * │ chacune lance poppler et `sharp` sur un document entier, en mémoire. Le   │
 * │ coût réel est le PRODUIT du plafond par le nombre d'ingestions            │
 * │ simultanées, et rien ne bornait le second facteur.                        │
 * │                                                                          │
 * │ Deux places, contre trois pour le filigrane : une ingestion rend un       │
 * │ document complet en deux résolutions, elle est bien plus lourde qu'un     │
 * │ filigranage.                                                             │
 * │                                                                          │
 * │ Comme pour le téléchargement, le sémaphore fait ATTENDRE au lieu de       │
 * │ faire tomber — et le délai borne l'attente, pour qu'une file ne se        │
 * │ transforme pas en requêtes suspendues indéfiniment.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const PLACES_INGESTION = 2;
const DELAI_ATTENTE_MS = 10 * 60 * 1000;

/**
 * DURÉE MAXIMALE DE LA FONCTION SERVERLESS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉFAUT QUE CETTE LIGNE CORRIGE — TROIS SYMPTÔMES, UNE SEULE CAUSE.   │
 * │                                                                          │
 * │ Sans elle, Vercel coupe la fonction au bout de 10 à 15 secondes. Une     │
 * │ ingestion en demande une trentaine : rendre N pages en deux résolutions  │
 * │ n'est pas une requête, c'est un traitement.                              │
 * │                                                                          │
 * │ La fonction était donc TUÉE EN COURS DE ROUTE, et comme le brouillon est │
 * │ créé au tout début, l'éditeur voyait :                                   │
 * │                                                                          │
 * │   * pas de redirection vers l'écran d'édition — la fonction n'a jamais   │
 * │     répondu, d'où l'écran d'erreur et le détour par le tableau de bord ; │
 * │   * pas de couverture — `publierCouverture` vient après le rendu ;       │
 * │   * pas de lecture en ligne — `fichier_lecture` est écrit en dernier.    │
 * │                                                                          │
 * │ Trois symptômes sans rapport apparent, et un seul chronomètre.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 60 secondes, et pas davantage : c'est le plafond du palier Hobby de Vercel,
 * et une valeur qui dépasse le palier souscrit fait ÉCHOUER LE DÉPLOIEMENT.
 * Sur un palier Pro, elle peut monter à 300 — mais ce fichier ne peut pas
 * deviner le palier, et un déploiement refusé serait pire que le défaut qu'on
 * corrige.
 *
 * Ce plafond ne suffit d'ailleurs pas à lui seul : un PDF assez gros le
 * dépassera toujours. C'est pourquoi `pipeline.ts` persiste désormais chaque
 * acquis DÈS QU'IL EXISTE, au lieu de tout écrire à la fin — une interruption
 * y laisse un conte utilisable plutôt qu'une coquille.
 */
export const maxDuration = 60;

const ingestions = new Semaphore(PLACES_INGESTION);

/** Réservé aux tests : observe la file sans la modifier. */
export function ingestionsEnAttente(): number {
  return ingestions.enAttente;
}

const champsSchema = z.object({
  langue: z.enum(['fr', 'en']).default('fr'),
  titre: z.string().trim().min(1).max(300).optional(),
  auteur: z.string().trim().min(1).max(200).optional(),
  /**
   * Titre AUQUEL RATTACHER cette version, au lieu d'en créer un nouveau.
   *
   * §5.5 : un livre est une entité parente avec N déclinaisons linguistiques,
   * et un droit d'accès porte sur le LIVRE. Sans ce champ, déposer la version
   * anglaise créait un SECOND titre au slug suffixé — donc un second prix, une
   * seconde publication, et un acheteur du français sans aucun droit sur
   * l'anglais.
   */
  livre_id: z.uuid().optional(),
});

/**
 * Lit un champ de formulaire — UN CHAMP LAISSÉ VIDE VAUT ABSENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉFAUT QUE CETTE FONCTION CORRIGE.                                   │
 * │                                                                          │
 * │ `titre` et `auteur` sont FACULTATIFS : la chaîne d'ingestion les lit dans │
 * │ le PDF, et l'écran de dépôt invite en toutes lettres à les laisser vides. │
 * │                                                                          │
 * │ Mais un `<input>` vide n'est pas absent du corps multipart : il y figure  │
 * │ avec la valeur `''`. L'ancien `?? undefined` ne rattrapait que `null` —   │
 * │ le cas du champ jamais envoyé — si bien que la chaîne vide atteignait     │
 * │ `z.string().min(1)` et faisait échouer TOUT le dépôt sur un champ         │
 * │ facultatif que l'écran conseillait de ne pas remplir.                     │
 * │                                                                          │
 * │ Aucun test ne l'avait vu : ils construisent leur `FormData` à la main et  │
 * │ n'y posent que `fichier` et `langue`. Seul un vrai navigateur envoie des  │
 * │ champs vides.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La validation n'est pas assouplie pour autant : un titre RENSEIGNÉ reste
 * soumis aux mêmes bornes. C'est la lecture qui est corrigée, pas le contrôle.
 */
function renseigne(formulaire: FormData, nom: string): string | undefined {
  const valeur = formulaire.get(nom);
  if (typeof valeur !== 'string') return undefined;

  const propre = valeur.trim();
  return propre === '' ? undefined : propre;
}

export async function POST(request: Request): Promise<Response> {
  // `gardeAdmin` et non `requireAdmin` : elle apporte le QUOTA DE DEBIT en plus
  // du controle du role. Cette route en etait depourvue — un ecart consigne a
  // l'etape 13, dont la justification (« le plafond de 100 Mo borne la
  // requete ») ne tenait pas : il borne la requete, pas l'agregat.
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  let formulaire: FormData;
  try {
    formulaire = await request.formData();
  } catch {
    return fail(400, {
      code: 'corps_illisible',
      message: 'Le fichier doit être envoyé en `multipart/form-data`.',
    });
  }

  const fichier = formulaire.get('fichier');
  if (!(fichier instanceof File)) {
    return errors.validation({ fichier: ['Un fichier PDF est requis.'] });
  }

  if (fichier.size === 0) {
    return errors.validation({ fichier: ['Le fichier est vide.'] });
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return fail(413, {
      code: 'fichier_trop_volumineux',
      message: 'Le fichier dépasse la taille maximale acceptée (100 Mo).',
    });
  }

  const champs = champsSchema.safeParse({
    langue: renseigne(formulaire, 'langue'),
    titre: renseigne(formulaire, 'titre'),
    auteur: renseigne(formulaire, 'auteur'),
    livre_id: renseigne(formulaire, 'livre_id'),
  });
  if (!champs.success) {
    return errors.validation(
      Object.fromEntries(
        champs.error.issues.map((issue) => [issue.path.join('.') || '_', [issue.message]]),
      ),
    );
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());

  // Le type déclaré par le client n'est pas une preuve. La signature `%PDF-`
  // en tête de fichier en est une : poppler refuserait de toute façon un
  // fichier qui ne l'a pas, mais autant le dire clairement et tout de suite.
  if (!contenu.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return errors.validation({ fichier: ['Le fichier n’est pas un PDF.'] });
  }

  // Nom de fichier fixe : celui fourni par le client ne touche jamais le
  // système de fichiers. Le titre, lui, transite par un champ dédié.
  const dossier = await mkdtemp(join(tmpdir(), 'ingest-depot-'));
  const cheminPdf = join(dossier, 'source.pdf');

  try {
    await writeFile(cheminPdf, contenu);

    // Une place tenue pendant tout le traitement, rendue quoi qu'il arrive.
    const resultat = await avecDelai(
      () =>
        ingestions.tenir(() =>
          ingerer({
            cheminPdf,
            langue: champs.data.langue,
            ...(champs.data.titre ? { titre: champs.data.titre } : {}),
            ...(champs.data.auteur ? { auteur: champs.data.auteur } : {}),
            ...(champs.data.livre_id ? { bookId: champs.data.livre_id } : {}),
          }),
        ),
      DELAI_ATTENTE_MS,
      'Ingestion : attente trop longue.',
    );

    logger.info('Ingestion demandée', {
      userId: garde.acteur.id,
      bookId: resultat.bookId,
      dejaIngere: resultat.dejaIngere,
    });

    return created({
      livre_id: resultat.bookId,
      traduction_id: resultat.translationId,
      slug: resultat.slug,
      titre: resultat.titre,
      nb_pages: resultat.nbPages,
      // §7.4.4 : un PDF scanné produit des pages muettes. L'éditeur doit
      // l'apprendre ici, pas après la mise en ligne.
      couche_texte: resultat.coucheTexte,
      deja_ingere: resultat.dejaIngere,
      statut: 'brouillon',
    });
  } catch (erreur) {
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ LE DÉTAIL RESTE AU JOURNAL. L'ÉTAPE, ELLE, REMONTE.               │
     * │                                                                    │
     * │ Toute panne d'ingestion rendait « erreur_interne », donc « Une      │
     * │ erreur est survenue. Réessayez plus tard. » L'éditeur réessayait,   │
     * │ échouait pareil, et personne — lui pas plus que le développeur —    │
     * │ ne pouvait savoir si le fichier était en cause, le rendu, ou le     │
     * │ stockage. Diagnostiquer exigeait l'accès aux journaux du serveur.   │
     * │                                                                    │
     * │ Ce qui remonte désormais est l'ÉTAPE qui a échoué, jamais le        │
     * │ message : un nom de code stable, que l'interface traduit en une     │
     * │ phrase actionnable. Aucun chemin de fichier, aucune sortie de       │
     * │ sous-processus, aucune trace de pile ne franchit cette frontière —  │
     * │ c'est la règle, et elle n'est pas assouplie ici.                    │
     * │                                                                    │
     * │ « Où ça a cassé » n'est pas un détail interne : c'est ce qui        │
     * │ distingue un PDF illisible d'une panne de stockage, et cela change  │
     * │ ce que l'éditeur doit faire.                                        │
     * └────────────────────────────────────────────────────────────────────┘
     */
    const etape = etapeEnEchec(erreur);

    logger.error('Ingestion échouée', {
      userId: garde.acteur.id,
      etape,
      detail: erreur instanceof Error ? erreur.message : String(erreur),
    });

    return fail(500, {
      code: etape,
      message: MESSAGES_ECHEC[etape],
    });
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

/** Les étapes que le dépôt sait nommer, et ce qu'elles disent à l'éditeur. */
const MESSAGES_ECHEC = {
  pdf_illisible:
    'Ce PDF n’a pas pu être lu. Il est peut-être protégé par un mot de passe, ou endommagé.',
  rendu_impossible:
    'Les pages de ce PDF n’ont pas pu être converties en images. Le document est peut-être trop complexe ou corrompu.',
  stockage_indisponible:
    'Les fichiers produits n’ont pas pu être enregistrés. Réessayez dans un instant.',
  traitement_trop_long:
    'Le traitement a dépassé le temps imparti. Ce conte est probablement trop volumineux pour être déposé en une fois.',
  erreur_interne: 'Une erreur est survenue. Réessayez plus tard.',
} as const;

type EtapeEchec = keyof typeof MESSAGES_ECHEC;

/**
 * Classe une exception en étape, sans jamais rendre son message.
 *
 * La reconnaissance se fait sur des motifs volontairement LARGES : mieux vaut
 * retomber sur `erreur_interne` — le comportement d'avant — que de nommer une
 * étape à tort et d'envoyer l'éditeur chercher au mauvais endroit.
 */
function etapeEnEchec(erreur: unknown): EtapeEchec {
  const message = (erreur instanceof Error ? erreur.message : String(erreur)).toLowerCase();

  if (message.includes('attente trop longue') || message.includes('timeout')) {
    return 'traitement_trop_long';
  }
  if (
    message.includes('illisible') ||
    message.includes('nombre de pages') ||
    message.includes('encrypt') ||
    message.includes('password')
  ) {
    return 'pdf_illisible';
  }
  if (
    message.includes('unsupported image format') ||
    message.includes('rendu') ||
    message.includes('canvas') ||
    message.includes('pdfjs') ||
    message.includes('couverture')
  ) {
    return 'rendu_impossible';
  }
  if (
    message.includes('storage') ||
    message.includes('stockage') ||
    message.includes('bucket') ||
    message.includes('dépôt')
  ) {
    return 'stockage_indisponible';
  }

  return 'erreur_interne';
}
