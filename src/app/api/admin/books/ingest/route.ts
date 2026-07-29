import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

import { requireAdmin } from '@/lib/auth/session';
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
 */
const TAILLE_MAX_OCTETS = 100 * 1024 * 1024;

const champsSchema = z.object({
  langue: z.enum(['fr', 'en']).default('fr'),
  titre: z.string().trim().min(1).max(300).optional(),
  auteur: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const garde = await requireAdmin(request);
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
    langue: formulaire.get('langue') ?? undefined,
    titre: formulaire.get('titre') ?? undefined,
    auteur: formulaire.get('auteur') ?? undefined,
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

    const resultat = await ingerer({
      cheminPdf,
      langue: champs.data.langue,
      ...(champs.data.titre ? { titre: champs.data.titre } : {}),
      ...(champs.data.auteur ? { auteur: champs.data.auteur } : {}),
    });

    logger.info('Ingestion demandée', {
      userId: garde.appelant.id,
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
    // Le détail part au journal, jamais au client : il contient des chemins de
    // fichiers et des messages de sous-processus.
    return errors.interne(erreur);
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}
