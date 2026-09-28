import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { enregistrerCampagne } from '@/lib/admin/service';
import { ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * LA CAMPAGNE EN COURS — les kits distribués, région par région.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES RÉGIONS ARRIVENT EN BLOC, ET LE BLOC FAIT FOI.                      │
 * │                                                                          │
 * │ Une région absente du tableau est RETIRÉE. C'est le contrat déjà retenu  │
 * │ pour les versions d'un témoignage (0073), et il a la même raison : sans  │
 * │ lui, retirer une région demanderait un second geste que l'écran n'offre  │
 * │ pas, et la région resterait — visible des adhérents.                      │
 * │                                                                          │
 * │ Conséquence assumée : un formulaire qui n'enverrait qu'une région        │
 * │ effacerait les autres. C'est pourquoi l'écran envoie toujours TOUTES     │
 * │ les lignes qu'il affiche.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const campagneSchema = z.object({
  id: z.uuid().nullish(),
  intitule: z.string().trim().min(1).max(200),
  objectif_kits: z.int().min(1).max(1_000_000),
  fin_le: z.iso.date().nullish(),
  regions: z
    .array(
      z.object({
        region: z.string().trim().min(1).max(80),
        // Un nombre de kits NÉGATIF n'existe pas : on ne reprend pas un kit
        // distribué. La base le refuse aussi, et ce schéma le dit plus tôt.
        kits: z.int().min(0).max(1_000_000),
      }),
    )
    .max(50)
    .default([]),
});

export async function PUT(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, campagneSchema);
  if (!corps.ok) return corps.response;

  const resultat = await enregistrerCampagne(garde.acteur.id, {
    id: corps.data.id ?? null,
    intitule: corps.data.intitule,
    objectifKits: corps.data.objectif_kits,
    finLe: corps.data.fin_le ?? null,
    regions: corps.data.regions,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ campagne: resultat.donnees });
}
