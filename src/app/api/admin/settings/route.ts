import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { modifierParametres } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * Paramètres métier — §4.3 F10.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES VALEURS DÉPLACENT LES RÈGLES ELLES-MÊMES.                           │
 * │                                                                          │
 * │ Réduire `fenetre_nouveaute_jours` fait entrer d'un coup dans              │
 * │ l'abonnement des titres qui étaient vendus seuls ; l'allonger les en       │
 * │ ressort. Allonger `periode_grace_jours` maintient l'accès de comptes       │
 * │ impayés. Ce sont des leviers commerciaux, et le journal d'audit enregistre │
 * │ la ligne ENTIÈRE avant et après : ces paramètres interagissent, et relire  │
 * │ l'état complet à une date donnée vaut mieux que recomposer une suite de    │
 * │ deltas.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les bornes ci-dessous sont volontairement larges : elles empêchent l'absurde
 * — une fenêtre de dix ans, une tolérance négative — sans se substituer à une
 * décision commerciale. Le vrai garde-fou est la trace.
 */
const corpsSchema = z.object({
  fenetre_nouveaute_jours: z.int().min(0).max(3650).optional(),
  periode_grace_jours: z.int().min(0).max(365).optional(),
  jours_essai: z.int().min(0).max(365).optional(),
  tolerance_renouvellement_heures: z.int().min(0).max(8760).optional(),
  retention_copies_mois: z.int().min(1).max(120).optional(),
});

export async function PATCH(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, corpsSchema);
  if (!corps.ok) return corps.response;

  if (Object.values(corps.data).every((v) => v === undefined)) {
    return errors.validation({ _: ['Aucun paramètre à modifier.'] });
  }

  const resultat = await modifierParametres(garde.acteur.id, {
    ...(corps.data.fenetre_nouveaute_jours !== undefined
      ? { fenetreNouveauteJours: corps.data.fenetre_nouveaute_jours }
      : {}),
    ...(corps.data.periode_grace_jours !== undefined
      ? { periodeGraceJours: corps.data.periode_grace_jours }
      : {}),
    ...(corps.data.jours_essai !== undefined ? { joursEssai: corps.data.jours_essai } : {}),
    ...(corps.data.tolerance_renouvellement_heures !== undefined
      ? { toleranceRenouvellementHeures: corps.data.tolerance_renouvellement_heures }
      : {}),
    ...(corps.data.retention_copies_mois !== undefined
      ? { retentionCopiesMois: corps.data.retention_copies_mois }
      : {}),
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}
