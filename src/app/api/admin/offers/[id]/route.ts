import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { modifierOffre, supprimerOffre } from '@/lib/admin/service';
import { errors, noContent, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * MODIFIER OU RETIRER UNE OFFRE — §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI LE DOMAINE NI LA PÉRIODE NE SONT ACCEPTÉS EN ENTRÉE.                 │
 * │                                                                          │
 * │ Ce ne sont pas des libellés, ce sont les CONDITIONS DU CONTRAT. Une       │
 * │ offre passée de `lecture` à `association` déplacerait les droits de tous  │
 * │ ceux qui l'ont souscrite d'un espace à l'autre ; une offre mensuelle      │
 * │ devenue annuelle facturerait douze fois ce qui a été accepté.             │
 * │                                                                          │
 * │ Le refus n'est pas écrit ici : `admin_modifier_offre` ne prend tout       │
 * │ simplement pas ces deux paramètres. Le schéma ci-dessous ne les nomme     │
 * │ donc pas non plus — pour changer l'un ou l'autre, on crée une offre et    │
 * │ on désactive l'ancienne, ce qui laisse intacts les contrats en cours.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SUPPRIMER N'EST PAS DÉSACTIVER, ET LA BASE FAIT LA DIFFÉRENCE.          │
 * │                                                                          │
 * │ `admin_supprimer_offre` refuse une offre déjà souscrite : perdre la       │
 * │ provenance d'un contrat en cours n'apporterait rien à personne. Le refus  │
 * │ remonte en 422, jamais en 404 — l'offre existe, et l'éditeur doit         │
 * │ comprendre que c'est la désactivation qu'il cherche.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const modificationSchema = z
  .object({
    libelle_fr: z.string().trim().min(1).max(120).optional(),
    libelle_en: z.string().trim().min(1).max(120).optional(),
    descriptif_fr: z.string().trim().max(400).optional(),
    descriptif_en: z.string().trim().max(400).optional(),
    ordre: z.int().min(0).max(999).optional(),
    actif: z.boolean().optional(),
  })
  // Un corps vide n'est pas une modification : il vaut mieux le dire que
  // d'écrire une ligne d'audit qui ne raconte aucun changement.
  .refine((valeur) => Object.keys(valeur).length > 0, {
    message: 'Aucun champ à modifier.',
  });

export async function PATCH(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, modificationSchema);
  if (!corps.ok) return corps.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await modifierOffre(garde.acteur.id, id, {
    ...(corps.data.libelle_fr !== undefined ? { libelleFr: corps.data.libelle_fr } : {}),
    ...(corps.data.libelle_en !== undefined ? { libelleEn: corps.data.libelle_en } : {}),
    ...(corps.data.descriptif_fr !== undefined ? { descriptifFr: corps.data.descriptif_fr } : {}),
    ...(corps.data.descriptif_en !== undefined ? { descriptifEn: corps.data.descriptif_en } : {}),
    ...(corps.data.ordre !== undefined ? { ordre: corps.data.ordre } : {}),
    ...(corps.data.actif !== undefined ? { actif: corps.data.actif } : {}),
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}

export async function DELETE(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await supprimerOffre(garde.acteur.id, id);
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return noContent();
}
