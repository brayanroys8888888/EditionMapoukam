import { z } from 'zod';

import { gardeAdmin, pagination, paginationSchema, refusEnReponse } from '@/lib/admin/route-helpers';
import { enregistrerPromo, listerPromos } from '@/lib/admin/service';
import { created, ok } from '@/lib/http/responses';
import { parseJsonBody, parseSearchParams } from '@/lib/http/validate';

/**
 * Codes promotionnels — §3.4, §4.3 F12.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN CODE EN POURCENTAGE VAUT PARTOUT. UN CODE À MONTANT FIXE, NON.       │
 * │                                                                          │
 * │ « 5 € de réduction » n'a aucun sens sur un panier en francs CFA :         │
 * │ appliqué tel quel, il retirerait cinq francs là où il promettait cinq     │
 * │ euros — trois millièmes de la remise annoncée. Un pourcentage, lui, est    │
 * │ neutre en devise : 20 % valent 20 % dans toutes les zones.                │
 * │                                                                          │
 * │ Un code à montant fixe est donc lié à une devise ET à une zone. La devise │
 * │ ne suffit pas : la zone `afrique` couvre XAF et XOF, et rien n'interdit    │
 * │ que deux zones partagent un jour une devise — une remise consentie sur     │
 * │ une grille tarifaire ne se transpose pas à l'autre.                       │
 * │                                                                          │
 * │ Symétriquement, un code en POURCENTAGE ne porte PAS de zone : la lui       │
 * │ donner suggérerait qu'il ne vaut pas ailleurs.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * LA VALIDATION EST EXCLUSIVEMENT SERVEUR. La table `promo_codes` est fermée à
 * tout client (migration 0010) : un code n'est jamais lu par le navigateur, donc
 * jamais validé par lui. L'expiration, le plafond d'utilisation, le non-cumul et
 * le plancher à zéro sont décidés dans `src/domain/orders/promo.ts`, à l'écart de
 * toute entrée réseau.
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, paginationSchema);
  if (!query.ok) return query.response;

  const resultat = await listerPromos({ page: query.data.page, taille: query.data.taille });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return ok({
    codes: resultat.donnees,
    // Le total vient de `total_lignes`, porte par chaque ligne. Une page vide
    // n'en a aucune : l'enveloppe le ramene a zero plutot que de disparaitre.
    ...pagination(
      resultat.donnees as { total_lignes?: number | string }[],
      query.data.page,
      query.data.taille,
    ),
  });
}

const promoSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      // Lettres et chiffres seulement : un code se dicte au téléphone et se
      // recopie à la main.
      .regex(/^[A-Za-z0-9]+$/, 'Le code ne peut contenir que des lettres et des chiffres.'),
    type: z.enum(['montant', 'pourcentage']),
    valeur: z.int().positive(),
    devise: z.enum(['EUR', 'XAF', 'XOF']).optional(),
    zone: z.enum(['international', 'afrique']).optional(),
    expire_le: z.iso.datetime({ offset: true }).optional(),
    usage_max: z.int().positive().max(1_000_000).optional(),
    actif: z.boolean().default(true),
  })
  .refine((v) => v.type !== 'pourcentage' || v.valeur <= 100, {
    message: 'Un pourcentage ne peut pas dépasser 100.',
    path: ['valeur'],
  })
  .refine((v) => v.type !== 'pourcentage' || (v.devise === undefined && v.zone === undefined), {
    message: 'Un code en pourcentage ne porte ni devise ni zone : il vaut dans toutes les zones.',
    path: ['zone'],
  })
  .refine((v) => v.type !== 'montant' || (v.devise !== undefined && v.zone !== undefined), {
    message: 'Un code à montant fixe exige une devise ET une zone.',
    path: ['zone'],
  });

export async function POST(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, promoSchema);
  if (!corps.ok) return corps.response;

  const resultat = await enregistrerPromo(garde.acteur.id, {
    code: corps.data.code,
    type: corps.data.type,
    valeur: corps.data.valeur,
    devise: corps.data.devise ?? null,
    zone: corps.data.zone ?? null,
    expireLe: corps.data.expire_le ?? null,
    usageMax: corps.data.usage_max ?? null,
    actif: corps.data.actif,
  });
  if (!resultat.ok) return refusEnReponse(resultat.raison);

  return created(resultat.donnees);
}
