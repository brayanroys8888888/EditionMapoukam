import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { createServiceClient } from '@/lib/supabase/clients';
import { getBusinessSettings } from '@/lib/settings/business-settings';
import { getServerEnv } from '@/lib/config/env';
import { formatAmount } from '@/domain/money';
import type { Currency } from '@/domain/money';
import type { ReponseOffres } from '@/domain/api/contract';
import type { Zone } from '@/domain/orders/types';

/**
 * Les deux offres — §3.1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EXTRAIT DE LA ROUTE POUR QUE LA PAGE LISE LA MÊME CHOSE.                │
 * │                                                                          │
 * │ `/api/offers` construisait cette réponse en propre. Une page serveur ne  │
 * │ peut pas employer la clé de service — un test d'architecture l'interdit  │
 * │ hors de `src/app/api` — et aurait donc dû passer par HTTP, ou recopier   │
 * │ le calcul. Recopier aurait produit une SECONDE grille tarifaire, ce que  │
 * │ cette route existe précisément pour empêcher.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function lireOffres(
  zone: Zone,
  options: { client?: AppSupabaseClient } = {},
): Promise<ReponseOffres> {
  const env = getServerEnv();
  const client = options.client ?? createServiceClient();

  const reglages = await getBusinessSettings({ client });

  const devise = zone === 'afrique' ? 'XAF' : 'EUR';
  const { data, error } = await client
    .from('currencies')
    .select('code, decimals, symbole')
    .eq('code', devise)
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? 'devise inconnue');

  const monnaie: Currency = { code: data.code, decimals: data.decimals, symbole: data.symbole };

  const abonnements = [
    { code: 'mensuel' as const, montant: env.PRICE_SUBSCRIPTION_MONTHLY, periode: 'mois' },
    { code: 'annuel' as const, montant: env.PRICE_SUBSCRIPTION_YEARLY, periode: 'an' },
  ];

  return {
    zone,
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
  };
}
