import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { errors, ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { getAccessForBooks } from '@/lib/access/engine';
import { urlsCouverture } from '@/lib/storage/covers';
import { LANGUES } from '@/domain/catalog/schemas';
import { logger } from '@/lib/logger';

/**
 * Ma bibliothèque — §4.2 F7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX SECTIONS, ET LEUR SÉPARATION EST UNE RÈGLE MÉTIER.                 │
 * │                                                                          │
 * │ « Mes achats » vient de `entitlements` ; « En cours de lecture » vient   │
 * │ de `reading_progress`. Les deux ne coïncident PAS, et c'est voulu : la   │
 * │ progression SURVIT à la perte d'accès (étape 12), pour qu'un             │
 * │ réabonnement reprenne là où l'enfant s'était arrêté.                     │
 * │                                                                          │
 * │ Un titre peut donc être en cours de lecture sans être accessible. Les     │
 * │ fondre en une seule liste ferait disparaître ce cas — ou pire,           │
 * │ promettrait une lecture que le moteur de droits refuserait ensuite.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE COMPTE VISÉ EST TOUJOURS CELUI DE LA SESSION.                        │
 * │                                                                          │
 * │ Aucun `user_id` n'est accepté en entrée. La règle de l'étape 13 vaut ici │
 * │ autant que côté administration : agir SUR quelqu'un peut se tracer,      │
 * │ LIRE la bibliothèque de quelqu'un d'autre n'a aucune justification.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const requeteSchema = z.object({
  langue: z.enum(LANGUES).default('fr'),
});

interface LigneBibliotheque {
  book_id: string;
  slug: string;
  titre: string;
  region: string | null;
  couverture_jeton: string | null;
  langues: string[];
  source: string | null;
  peut_telecharger: boolean;
  accorde_le: string | null;
  expire_le: string | null;
  derniere_page: number | null;
  langue_reprise: string | null;
  derniere_lecture_le: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  const client = createServiceClient();

  try {
    const { data, error } = await client.rpc('library_for_user', {
      p_user: garde.appelant.id,
      p_langue: query.data.langue,
    });

    if (error) {
      logger.error('Bibliothèque illisible', { detail: error.message });
      return errors.interne(error.message);
    }

    const lignes = (data ?? []) as unknown as LigneBibliotheque[];

    // La décision d'accès reste celle du MOTEUR, jamais déduite de la présence
    // d'un droit : un titre acheté puis archivé n'est plus lisible, et seul le
    // moteur le sait. UN appel pour toute la bibliothèque.
    const acces = await getAccessForBooks(
      garde.appelant.id,
      lignes.map((l) => l.book_id),
      { client },
    );

    const entrees = lignes.map((ligne) => ({
      livre_id: ligne.book_id,
      slug: ligne.slug,
      titre: ligne.titre,
      region: ligne.region,
      couverture: urlsCouverture(ligne.couverture_jeton),
      langues: ligne.langues,
      acces: acces.get(ligne.book_id) ?? {
        canRead: false,
        canDownload: false,
        reason: 'none' as const,
      },
      possede: ligne.source !== null,
      source: ligne.source,
      peut_telecharger: ligne.peut_telecharger,
      expire_le: ligne.expire_le,
      reprise:
        ligne.derniere_page === null
          ? null
          : {
              page: ligne.derniere_page,
              langue: ligne.langue_reprise,
              derniere_lecture_le: ligne.derniere_lecture_le,
            },
    }));

    return ok({
      achats: entrees.filter((e) => e.possede),
      // Un titre commencé apparaît ici même s'il est aussi possédé : c'est
      // « reprendre ma lecture », pas « ce qui n'est pas à moi ».
      en_cours: entrees.filter((e) => e.reprise !== null),
    });
  } catch (erreur) {
    logger.error('Bibliothèque illisible', { detail: erreur });
    return errors.interne(erreur);
  }
}
