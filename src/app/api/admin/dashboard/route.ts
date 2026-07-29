import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { tableauDeBord } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';

/**
 * Tableau de bord — §4.3 F10.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI DOIT SAUTER AUX YEUX Y EST, PLUTÔT QUE CONSULTABLE AILLEURS.     │
 * │                                                                          │
 * │ Les abonnements en anomalie (arbitrage N2) ne se distinguent d'un         │
 * │ abonnement sain par aucun signe visible : même statut affiché, même       │
 * │ place dans les listes. C'est tout le propos de l'état `anomalie` — nommer │
 * │ ce qui, sans lui, se fondrait dans la masse. Le reléguer derrière un      │
 * │ filtre reviendrait à le taire une seconde fois.                          │
 * │                                                                          │
 * │ Même raisonnement pour les brouillons non publiables : l'éditeur doit     │
 * │ voir ce qui manque AVANT de tenter la publication, et non découvrir le    │
 * │ refus au moment de publier.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const resultat = await tableauDeBord();
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}
