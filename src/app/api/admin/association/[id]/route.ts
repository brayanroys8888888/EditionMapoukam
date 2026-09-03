import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import {
  lireContenuAssociation,
  modifierContenuAssociation,
  supprimerContenuAssociation,
} from '@/lib/admin/service';
import { CATEGORIES_ASSOCIATION } from '@/lib/association/service';
import { errors, noContent, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * UN CONTENU ASSOCIATIF, VU DE L'ADMINISTRATION — §3.6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE `GET` REND LE CORPS DE TOUTES LES VERSIONS, SANS VERDICT D'ACCÈS.    │
 * │                                                                          │
 * │ C'est l'écran de rédaction : un rédacteur relit ce qu'il écrit, y compris │
 * │ un contenu réservé qu'il n'a pas « acheté ». L'appel passe par            │
 * │ `service_role`, donc les privilèges de colonne qui ferment `corps` à      │
 * │ `anon` et `authenticated` ne s'y opposent pas.                            │
 * │                                                                          │
 * │ C'est précisément pourquoi cette route est gardée trois fois : la garde   │
 * │ ci-dessous, la délégation à une fonction `admin_*`, et la revérification  │
 * │ du rôle EN BASE par `admin_poser_acteur`. Une garde oubliée ici           │
 * │ publierait le contenu réservé de l'association à qui le demande.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NI `slug` NI `statut` NE SE MODIFIENT PAR CE `PATCH`.                   │
 * │                                                                          │
 * │ Le slug est l'adresse publique, et les redirections 308 qui reprennent    │
 * │ les anciennes URL du blog comptent dessus : le renommer casserait des     │
 * │ liens qui existent déjà ailleurs. Le statut, lui, a sa propre route —     │
 * │ parce que publier n'est pas modifier, et que la base y refuse un contenu  │
 * │ sans version française.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await lireContenuAssociation(id);
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  // La fonction SQL rend `null` sur un identifiant inconnu — un `jsonb` vide,
  // pas une erreur. C'est un 404, jamais un 200 sur un corps nul.
  if (resultat.donnees === null) return errors.introuvable();

  return ok(resultat.donnees);
}

const modificationSchema = z
  .object({
    categorie: z.enum(CATEGORIES_ASSOCIATION).optional(),
    acces: z.enum(['libre', 'abonnes']).optional(),
    minutes: z.int().positive().max(600).nullable().optional(),
    image_url: z.string().trim().max(500).nullable().optional(),
    vedette: z.boolean().optional(),
    ordre: z.int().min(0).max(999).optional(),
  })
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

  const resultat = await modifierContenuAssociation(garde.acteur.id, id, {
    ...(corps.data.categorie !== undefined ? { categorie: corps.data.categorie } : {}),
    ...(corps.data.acces !== undefined ? { acces: corps.data.acces } : {}),
    ...(corps.data.minutes !== undefined ? { minutes: corps.data.minutes } : {}),
    ...(corps.data.image_url !== undefined ? { imageUrl: corps.data.image_url } : {}),
    ...(corps.data.vedette !== undefined ? { vedette: corps.data.vedette } : {}),
    ...(corps.data.ordre !== undefined ? { ordre: corps.data.ordre } : {}),
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok(resultat.donnees);
}

/**
 * La suppression efface le contenu ET ses versions (`on delete cascade`).
 *
 * Elle reste possible sur un contenu publié : rien ne s'y rattache — ni
 * commande, ni droit acquis — et l'adhésion ne se vend pas contenu par
 * contenu. Un contenu retiré n'ôte donc rien à personne, contrairement à un
 * titre du catalogue.
 */
export async function DELETE(
  request: Request,
  contexte: { params: Promise<{ id: string }> },
): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const { id } = await contexte.params;
  if (!z.uuid().safeParse(id).success) return errors.introuvable();

  const resultat = await supprimerContenuAssociation(garde.acteur.id, id);
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return noContent();
}
