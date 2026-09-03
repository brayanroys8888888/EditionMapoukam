import { z } from 'zod';

import { gardeAdmin, refusEnReponse } from '@/lib/admin/route-helpers';
import { creerOffre, listerOffres } from '@/lib/admin/service';
import { created, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';

/**
 * LES OFFRES D'ABONNEMENT — §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CRÉER UNE OFFRE NE CRÉE JAMAIS UN DROIT.                                │
 * │                                                                          │
 * │ Une offre VEND un droit qui existe déjà, et c'est son `domaine` qui dit   │
 * │ lequel : `lecture` ouvre la lecture en ligne du catalogue, `association`  │
 * │ ouvre les contenus réservés de l'espace associatif. Ce que chacun de ces  │
 * │ deux mots ouvre est écrit UNE fois, dans `abonnement_ouvre_droit`         │
 * │ (migration 0067) — pas ici, et pas dans l'écran qui appelle cette route.  │
 * │                                                                          │
 * │ Conséquence directe de §3.6 : aucun domaine nouveau ne s'invente depuis   │
 * │ le réseau. L'énumération ci-dessous est celle du type PostgreSQL, et un   │
 * │ troisième domaine exigerait une migration — donc une décision, pas un     │
 * │ formulaire.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PAS DE PAGINATION SUR CETTE LISTE, ET C'EST DÉLIBÉRÉ.                   │
 * │                                                                          │
 * │ Le catalogue commercial se compte en unités : deux formules de lecture,   │
 * │ deux d'adhésion, peut-être une offre découverte. Paginer y coûterait      │
 * │ deux paramètres et une enveloppe pour ne jamais dépasser la première      │
 * │ page — et cacherait à l'éditeur la moitié d'un catalogue qu'il doit       │
 * │ pouvoir embrasser d'un regard, prix et manques compris.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const resultat = await listerOffres();
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({ offres: resultat.donnees });
}

const offreSchema = z.object({
  // La MÊME forme que la contrainte de la table : minuscules, chiffres et
  // traits d'union. Ce code se retrouve dans une adresse (`?offre=…`) et dans
  // un événement de paiement ; l'espace et l'accent n'y ont pas leur place.
  code: z
    .string()
    .trim()
    .min(3)
    .max(48)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Le code d’une offre s’écrit en minuscules, sans accent, mots séparés par des traits d’union.',
    ),
  domaine: z.enum(['lecture', 'association']),
  periode: z.enum(['mensuel', 'annuel']),
  libelle_fr: z.string().trim().min(1).max(120),
  libelle_en: z.string().trim().min(1).max(120),
  descriptif_fr: z.string().trim().max(400).optional(),
  descriptif_en: z.string().trim().max(400).optional(),
  ordre: z.int().min(0).max(999).default(0),
});

export async function POST(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, offreSchema);
  if (!corps.ok) return corps.response;

  /*
   * Aucun `actif` dans le schéma : une offre NAÎT INACTIVE, et c'est la
   * colonne qui le décide (`default false`). Accepter le drapeau à la création
   * permettrait de mettre en vente une offre encore sans prix — que
   * `offres_publiques` omettrait, laissant l'éditeur devant une offre
   * « active » qu'aucun visiteur ne voit. L'activation est un second geste,
   * fait par `PATCH`, après que les prix ont été posés.
   */
  const resultat = await creerOffre(garde.acteur.id, {
    code: corps.data.code,
    domaine: corps.data.domaine,
    periode: corps.data.periode,
    libelleFr: corps.data.libelle_fr,
    libelleEn: corps.data.libelle_en,
    descriptifFr: corps.data.descriptif_fr ?? null,
    descriptifEn: corps.data.descriptif_en ?? null,
    ordre: corps.data.ordre,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return created(resultat.donnees);
}
