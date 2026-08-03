import { z } from 'zod';

import { errors, ok } from '@/lib/http/responses';
import { parseSearchParams } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { getBusinessSettings } from '@/lib/settings/business-settings';
import { getServerEnv } from '@/lib/config/env';
import { formatAmount } from '@/domain/money';
import type { Currency } from '@/domain/money';
import { ZONES } from '@/domain/orders/types';
import { logger } from '@/lib/logger';

/**
 * Les deux offres — §3.1, §4.1 F1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN PRIX N'EST ÉCRIT DANS UN COMPOSANT. JAMAIS.                       │
 * │                                                                          │
 * │ Sans cette route, la page des offres aurait porté « 7,99 € » en dur —    │
 * │ une seconde source de prix, exactement ce que la décision D4 a supprimé  │
 * │ pour les livres, et pour la même raison : deux sources divergent, et la  │
 * │ divergence porte sur ce que le client paie.                              │
 * │                                                                          │
 * │ Les maquettes affichent d'ailleurs 6,90 € et 3,90 €, valeurs inventées   │
 * │ par l'outil de maquettage. C'est ici que la question se tranche, pas     │
 * │ dans un fichier de style (docs/maquettes/README.md).                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const requeteSchema = z.object({
  /** Zone d'AFFICHAGE, provisoire. La zone d'encaissement vient du paiement. */
  zone: z.enum(ZONES).default('international'),
});

export async function GET(request: Request): Promise<Response> {
  const query = parseSearchParams(request, requeteSchema);
  if (!query.ok) return query.response;

  const env = getServerEnv();
  const client = createServiceClient();

  try {
    const reglages = await getBusinessSettings({ client });

    const devise = query.data.zone === 'afrique' ? 'XAF' : 'EUR';
    const { data, error } = await client
      .from('currencies')
      .select('code, decimals, symbole')
      .eq('code', devise)
      .maybeSingle();

    if (error || !data) return errors.interne(error?.message ?? 'devise inconnue');
    const monnaie: Currency = { code: data.code, decimals: data.decimals, symbole: data.symbole };

    const abonnements = [
      { code: 'mensuel' as const, montant: env.PRICE_SUBSCRIPTION_MONTHLY, periode: 'mois' },
      { code: 'annuel' as const, montant: env.PRICE_SUBSCRIPTION_YEARLY, periode: 'an' },
    ];

    return ok({
      zone: query.data.zone,
      devise,
      abonnement: {
        // ┌──────────────────────────────────────────────────────────────────┐
        // │ L'INTERRUPTEUR COMMERCIAL, ET NON UN COMPTE DE TITRES.           │
        // │                                                                  │
        // │ §3.3 recommande d'attendre 30 à 40 titres publiés. Le code ne     │
        // │ connaît pas ce seuil et n'a pas à le connaître : c'est une        │
        // │ décision, pas une règle. L'interface lit ce booléen, elle ne      │
        // │ compte pas les titres pour en déduire quoi que ce soit.          │
        // └──────────────────────────────────────────────────────────────────┘
        ouvert: reglages.abonnementOuvert,
        jours_essai: reglages.joursEssai,
        offres: abonnements.map((offre) => ({
          code: offre.code,
          montant: offre.montant,
          devise,
          affichage: formatAmount(offre.montant, monnaie),
          periode: offre.periode,
        })),
        // Rappelé dans la réponse, comme sur `/api/subscriptions` : c'est la
        // confusion la plus coûteuse du projet, et la page des offres est le
        // premier endroit où un client la rencontre.
        donne_telechargement: false,
      },
      achat_unite: {
        // Prix INDICATIF : le prix réel est par titre, dans `book_prices`.
        // L'annoncer comme « à partir de » évite de promettre un tarif unique
        // que le catalogue contredirait.
        a_partir_de: env.PRICE_UNIT_DEFAULT,
        devise,
        affichage: formatAmount(env.PRICE_UNIT_DEFAULT, monnaie),
        donne_telechargement: true,
      },
    });
  } catch (erreur) {
    logger.error('Offres illisibles', { detail: erreur });
    return errors.interne(erreur);
  }
}
