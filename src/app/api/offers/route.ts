import { z } from 'zod';

import { errors, ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { lireOffres } from '@/lib/offers/service';
import { ZONES } from '@/domain/orders/types';
import { logger } from '@/lib/logger';

/**
 * Les deux offres — §3.1, §4.1 F1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN PRIX N'EST ÉCRIT DANS UN COMPOSANT. JAMAIS.                       │
 * │                                                                          │
 * │ Sans cette route, la page des offres aurait porté « 7,99 € » en dur —    │
 * │ une seconde source de prix, exactement ce que la décision D4 a supprimé  │
 * │ pour les livres, et pour la même raison : deux sources divergent, et la  │
 * │ divergence porte sur ce que le client paie.                              │
 * │                                                                          │
 * │ Les maquettes affichent d'ailleurs 6,90 € et 3,90 €, valeurs inventées   │
 * │ par l'outil de maquettage. C'est ici que la question se tranche, pas     │
 * │ dans un fichier de style (docs/maquettes/README.md).                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le calcul vit dans `src/lib/offers/service.ts`, que la PAGE des offres
 * appelle également : une seule grille tarifaire, des deux côtés du réseau
 * (PLAN-FRONTEND §1.2).
 */
const requeteSchema = z.object({
  /** Zone d'AFFICHAGE, provisoire. La zone d'encaissement vient du paiement. */
  zone: z.enum(ZONES).default('international'),
});

export async function GET(request: Request): Promise<Response> {
  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  try {
    return ok(await lireOffres(query.data.zone));
  } catch (erreur) {
    logger.error('Offres illisibles', { detail: erreur });
    return errors.interne(erreur);
  }
}
