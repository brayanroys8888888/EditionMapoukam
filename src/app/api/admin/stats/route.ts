import { z } from 'zod';

import { gardeAdmin, paginationSchema } from '@/lib/admin/route-helpers';
import * as stats from '@/lib/admin/stats';
import { errors, fail, ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';

/**
 * Statistiques agrégées — §4.3 F13.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SURFACE DE LECTURE LARGE EST UNE SURFACE D'EXFILTRATION.            │
 * │                                                                          │
 * │ Trois bornes s'y opposent, et aucune ne suffit seule :                   │
 * │                                                                          │
 * │   * la PÉRIODE est plafonnée à trois ans, EN BASE — une route ajoutée    │
 * │     plus tard en hérite sans y penser ;                                  │
 * │   * la PAGINATION est plafonnée à cent lignes, par la même fonction que  │
 * │     les listes d'administration ;                                        │
 * │   * le QUOTA de `gardeAdmin` borne l'enchaînement des requêtes.          │
 * │                                                                          │
 * │ Les deux premières limitent ce qu'une requête emporte ; la troisième     │
 * │ limite combien de requêtes peuvent être enchaînées. Sans elle, les deux  │
 * │ autres ne coûtent qu'une boucle.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * AUCUN CHIFFRE CONSOLIDÉ N'EST RENDU. Les montants sont ventilés par devise,
 * parce qu'additionner des euros et des francs CFA sans taux de change ne
 * produit rien (D4 point 4).
 */
const periodeSchema = z.object({
  debut: z.iso.datetime({ offset: true }).optional(),
  fin: z.iso.datetime({ offset: true }).optional(),
});

const requeteSchema = periodeSchema.extend(paginationSchema.shape).extend({
  agregat: z
    .enum([
      'chiffre_affaires',
      'abonnes',
      'mouvements',
      'titres_achetes',
      'titres_lus',
      'langues',
    ])
    .default('chiffre_affaires'),
});

export async function GET(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  const periode = {
    debut: query.data.debut ?? null,
    fin: query.data.fin ?? null,
  };
  const pagination = { page: query.data.page, taille: query.data.taille };

  const resultat = await (async () => {
    switch (query.data.agregat) {
      case 'chiffre_affaires':
        return await stats.chiffreAffaires(periode);
      case 'abonnes':
        return await stats.abonnes();
      case 'mouvements':
        return await stats.mouvementsAbonnement(periode);
      case 'titres_achetes':
        return await stats.titresAchetes({ ...periode, ...pagination });
      case 'titres_lus':
        return await stats.titresLus({ ...periode, ...pagination });
      case 'langues':
        return await stats.langues(periode);
    }
  })();

  if (!resultat.ok) {
    if (resultat.raison === 'periode_invalide') {
      // Une erreur d'APPEL, pas une panne : le message dit ce qui n'allait pas,
      // sans divulguer de détail interne.
      return fail(400, {
        code: 'periode_invalide',
        message: 'La période demandée est invalide ou dépasse trois ans.',
      });
    }
    return errors.interne();
  }

  return ok({
    agregat: query.data.agregat,
    // La devise accompagne CHAQUE montant. Le client n'a donc jamais à deviner
    // ce que représente un nombre, ni à en additionner deux.
    donnees: resultat.donnees,
  });
}
