import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { creerContenuAssociation, listerContenusAssociation } from '@/lib/admin/service';
import { CATEGORIES_ASSOCIATION } from '@/lib/association/service';
import { created, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * LES CONTENUS DE L'ESPACE ASSOCIATIF — §3.6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `acces` EST UN CHAMP DE CONTENU, PAS UNE RÈGLE D'ACCÈS.                 │
 * │                                                                          │
 * │ Il dit ce que ce contenu-ci EST : `libre` — lisible de tous, comme le     │
 * │ sont les anciens articles du blog repris tels quels — ou `abonnes`,       │
 * │ réservé à l'adhésion. Ce que le mot `abonnes` ENTRAÎNE, en revanche,      │
 * │ n'est écrit ni ici ni dans l'écran : `access_for_association` le décide,  │
 * │ en appelant `abonnement_ouvre_droit(user, 'association')`.                │
 * │                                                                          │
 * │ La distinction est celle de `inclus_abonnement` sur un titre : une        │
 * │ étiquette posée par l'éditeur, lue par une règle qui vit ailleurs.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CONTENU NAÎT EN BROUILLON, ET AUCUN CHAMP NE PERMET D'Y COUPER.      │
 * │                                                                          │
 * │ Comme un titre du catalogue. La publication est un second geste, par      │
 * │ `PUT …/publication`, et la base y refuse un contenu sans version          │
 * │ française — c'est le pendant de `manques_pour_publication`.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const resultat = await listerContenusAssociation();
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ contenus: resultat.donnees });
}

const contenuSchema = z.object({
  // Le slug entre dans l'adresse publique et dans les redirections 308 qui
  // reprennent les anciennes adresses du blog : il ne porte ni accent ni
  // espace, et la contrainte de la table dit la même chose.
  slug: z
    .string()
    .trim()
    .min(3)
    .max(96)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Le slug s’écrit en minuscules, sans accent, mots séparés par des traits d’union.',
    ),
  // L'énumération vient du module qui la tient déjà pour le front-office : la
  // recopier ici l'aurait fait diverger de l'écran qui affiche les libellés.
  categorie: z.enum(CATEGORIES_ASSOCIATION),
  titre: z.string().trim().min(1).max(200),
  chapeau: z.string().trim().max(400).default(''),
  acces: z.enum(['libre', 'abonnes']).default('abonnes'),
  minutes: z.int().positive().max(600).nullable().default(null),
  image_url: z.string().trim().max(500).nullable().default(null),
});

export async function POST(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, contenuSchema);
  if (!corps.ok) return corps.response;

  const resultat = await creerContenuAssociation(garde.acteur.id, {
    slug: corps.data.slug,
    categorie: corps.data.categorie,
    titre: corps.data.titre,
    chapeau: corps.data.chapeau,
    acces: corps.data.acces,
    minutes: corps.data.minutes,
    imageUrl: corps.data.image_url,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return created(resultat.donnees);
}
