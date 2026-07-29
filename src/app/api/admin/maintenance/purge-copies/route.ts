import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { declencherPurgeCopies } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';

/**
 * Purge des copies filigranées — déclenchement manuel.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MAINTENANCE, ET NON SIMULATION. C'EST POURQUOI ELLE EST ICI ET PAS DANS  │
 * │ /dev.                                                                    │
 * │                                                                          │
 * │ La console `/dev` simule ce qu'un prestataire externe ferait : un          │
 * │ paiement, un renouvellement, le passage du temps. Elle est interdite en    │
 * │ production, et c'est bien ainsi.                                          │
 * │                                                                          │
 * │ Cette purge, elle, est une opération réelle sur des données réelles, et    │
 * │ elle devra tourner EN production. Sa place n'est donc pas dans la console  │
 * │ de simulation : l'y mettre l'aurait rendue inaccessible là où elle est     │
 * │ indispensable (étape 13, point 8).                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Solution intermédiaire pour P1 de docs/PLAN.md §5 quater : un déclenchement à
 * la main vaut mieux qu'un appel qui n'existe pas. L'ordonnanceur reste à
 * brancher, et cette route ne l'en dispense pas — elle évite seulement que le
 * stockage croisse sans fin d'ici là.
 *
 * L'effacement est SANS DANGER : `identifiantCopie()` est déterministe, une
 * copie purgée se reconstruit à l'identique à la prochaine demande.
 */
export async function POST(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const resultat = await declencherPurgeCopies(garde.acteur.id);
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}
