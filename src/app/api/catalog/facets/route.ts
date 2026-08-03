import { z } from 'zod';

import { errors } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { lireFacettes } from '@/lib/catalog/repository';
import { LANGUES } from '@/domain/catalog/schemas';
import { logger } from '@/lib/logger';

/**
 * Valeurs de filtre réellement présentes au catalogue — §4.1 F2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES PASTILLES DE FILTRE NE SE CODENT PAS EN DUR.                        │
 * │                                                                          │
 * │ Le catalogue accepte `themes`, `origine`, `region` et une tranche d'âge, │
 * │ mais rien n'énumérait les valeurs disponibles. Une liste écrite dans     │
 * │ l'interface se désynchroniserait du catalogue au premier titre ingéré —  │
 * │ et proposerait un filtre qui ne rend rien, ou en cacherait un qui        │
 * │ existe.                                                                  │
 * │                                                                          │
 * │ C'est aussi ce qui rend `themes` supportable en texte libre : l'interface │
 * │ n'en devine aucun, elle affiche ce qui EST là (docs/PLAN.md §5 terdecies).│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Publique, comme le catalogue qu'elle décrit. Seuls les titres publiés y
 * comptent : une facette dérivée d'un brouillon annoncerait un catalogue à
 * venir, ce que la fiche refuse déjà de faire en répondant 404.
 */
const requeteSchema = z.object({
  langue: z.enum(LANGUES).default('fr'),
});

export async function GET(request: Request): Promise<Response> {
  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  try {
    // Même module que la page serveur du catalogue (PLAN-FRONTEND §1.2) : la
    // route ne connaît plus la fonction SQL, elle connaît le catalogue.
    const data = await lireFacettes(query.data.langue);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Le catalogue bouge à l'échelle de la semaine, pas de la seconde.
        // Une minute de cache partagé épargne une agrégation par visiteur,
        // sur des données strictement publiques.
        'cache-control': 'public, max-age=60',
      },
    });
  } catch (erreur) {
    logger.error('Facettes illisibles', { detail: erreur });
    return errors.interne(erreur);
  }
}
