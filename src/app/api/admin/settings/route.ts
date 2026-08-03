import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { modifierParametres } from '@/lib/admin/service';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';

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
  /**
   * Ouverture commerciale de l'abonnement — §3.3.
   *
   * Le seuil de 30 a 40 titres publies n'est PAS applique ici : c'est une
   * recommandation commerciale, pas une regle technique. La reponse rend le
   * nombre de titres publies pour que l'ecran le rappelle sans l'imposer.
   */
  abonnement_ouvert: z.boolean().optional(),
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
    ...(corps.data.abonnement_ouvert !== undefined
      ? { abonnementOuvert: corps.data.abonnement_ouvert }
      : {}),
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LE COMPTE DE TITRES ACCOMPAGNE LA RÉPONSE, IL NE LA CONDITIONNE PAS. │
  // │                                                                      │
  // │ §3.3 recommande d'ouvrir l'abonnement à partir de 30 à 40 titres :   │
  // │ « un abonnement à 7,99 € adossé à un catalogue de quelques titres ne │
  // │ soutiendra pas la comparaison et générera surtout des résiliations ». │
  // │                                                                      │
  // │ Le code REFUSE d'appliquer ce seuil : c'est une décision commerciale, │
  // │ et un refus technique la transformerait en règle. Il rend le chiffre, │
  // │ l'écran le rappelle, et l'éditeur décide. Montrer sans imposer.       │
  // └──────────────────────────────────────────────────────────────────────┘
  const compte = await createServiceClient().rpc('titres_publies');

  return ok({
    ...(resultat.donnees as Record<string, unknown>),
    titres_publies: compte.data ?? null,
  });
}
