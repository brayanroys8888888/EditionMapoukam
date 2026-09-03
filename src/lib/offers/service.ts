import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { createServiceClient } from '@/lib/supabase/clients';
import { getBusinessSettings } from '@/lib/settings/business-settings';
import { getServerEnv } from '@/lib/config/env';
import { formatAmount } from '@/domain/money';
import type { Currency } from '@/domain/money';
import type { Offre, ReponseOffres } from '@/domain/api/contract';
import type { DomaineAbonnement, PeriodeAbonnement } from '@/domain/subscriptions/domaines';
import type { Zone } from '@/domain/orders/types';

/**
 * Les formules d'abonnement — §3.1, §3.3, §3.6.
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
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES PRIX NE SONT PLUS DANS L'ENVIRONNEMENT : ILS SONT EN BASE.          │
 * │                                                                          │
 * │ `PRICE_SUBSCRIPTION_MONTHLY` et `PRICE_SUBSCRIPTION_YEARLY` figeaient    │
 * │ deux formules dans un fichier `.env` — non versionné, donc invisible, et │
 * │ hors de portée de l'éditeur. Depuis la migration 0068, les formules sont │
 * │ des lignes de `subscription_plans`, tarifées zone par zone dans          │
 * │ `plan_prices`, et administrées depuis `/admin/offres` (§4.3 F12 bis).   │
 * │                                                                          │
 * │ Ce module ne connaît donc plus AUCUN tarif. Il lit `offres_publiques`,   │
 * │ qui ne rend que les formules actives ayant un prix DANS LA ZONE demandée │
 * │ — une formule sans prix ne s'affiche pas, plutôt que de s'afficher à     │
 * │ zéro.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Une formule telle que la base la rend, avant mise en forme. */
export interface OffreRetenue {
  code: string;
  domaine: DomaineAbonnement;
  periode: PeriodeAbonnement;
  montant: number;
  devise: string;
}

type LigneOffre = {
  code: string;
  domaine: DomaineAbonnement;
  periode: PeriodeAbonnement;
  libelle_fr: string;
  libelle_en: string;
  descriptif_fr: string | null;
  descriptif_en: string | null;
  montant: number;
  devise: string;
  ordre: number;
};

/** Libellé de la périodicité, dans la langue demandée. */
function periodeAffichee(periode: PeriodeAbonnement, langue: string): string {
  if (langue === 'en') return periode === 'mensuel' ? 'month' : 'year';
  return periode === 'mensuel' ? 'mois' : 'an';
}

function enOffre(ligne: LigneOffre, langue: string, monnaie: Currency): Offre {
  const anglais = langue === 'en';
  return {
    code: ligne.code,
    domaine: ligne.domaine,
    montant: ligne.montant,
    devise: ligne.devise,
    affichage: formatAmount(ligne.montant, monnaie),
    periode: periodeAffichee(ligne.periode, langue),
    // Repli sur le français, comme partout ailleurs : une formule dont
    // l'anglais n'a pas encore été écrit s'affiche en français, jamais sous son
    // code.
    libelle: (anglais ? ligne.libelle_en : ligne.libelle_fr) || ligne.libelle_fr,
    descriptif: (anglais ? ligne.descriptif_en : ligne.descriptif_fr) || ligne.descriptif_fr,
  };
}

async function lireMonnaie(client: AppSupabaseClient, devise: string): Promise<Currency> {
  const { data, error } = await client
    .from('currencies')
    .select('code, decimals, symbole')
    .eq('code', devise)
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? 'devise inconnue');
  return { code: data.code, decimals: data.decimals, symbole: data.symbole };
}

export async function lireOffres(
  zone: Zone,
  options: { client?: AppSupabaseClient; langue?: string } = {},
): Promise<ReponseOffres> {
  const env = getServerEnv();
  const client = options.client ?? createServiceClient();
  const langue = options.langue ?? 'fr';

  const reglages = await getBusinessSettings({ client });

  const devise = zone === 'afrique' ? 'XAF' : 'EUR';
  const monnaie = await lireMonnaie(client, devise);

  const { data, error } = await client.rpc('offres_publiques', { p_zone: zone });
  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as LigneOffre[];
  const parDomaine = (domaine: DomaineAbonnement): Offre[] =>
    lignes.filter((l) => l.domaine === domaine).map((l) => enOffre(l, langue, monnaie));

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
      offres: parDomaine('lecture'),
      // Rappelé dans la réponse, comme sur `/api/subscriptions` : c'est la
      // confusion la plus coûteuse du projet, et la page des offres est le
      // premier endroit où un client la rencontre.
      donne_telechargement: false,
    },
    association: {
      // Vide tant que l'éditeur n'a créé aucune formule associative. Aucun prix
      // n'est inventé ici : un tarif affiché est un tarif décidé.
      offres: parDomaine('association'),
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

/**
 * La formule qu'on souscrit, et son prix dans la zone d'encaissement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE RÉPONSE À « COMBIEN ? », ET ELLE EST EN SQL.                  │
 * │                                                                          │
 * │ Deux routes ont besoin de ce montant : celle qui ouvre la souscription   │
 * │ chez le prestataire, et celle qui simule l'événement signé. Elles        │
 * │ appellent toutes deux `offre_par_code`, qui refuse d'un seul geste les   │
 * │ trois cas dangereux : code inconnu, formule désactivée, formule sans     │
 * │ prix dans cette zone. Un `null` ici veut dire « on ne vend pas ça », et  │
 * │ l'appelant n'a pas à distinguer laquelle des trois raisons s'applique.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function lireOffreParCode(
  code: string,
  zone: Zone,
  options: { client?: AppSupabaseClient } = {},
): Promise<(OffreRetenue & { id: string }) | null> {
  const client = options.client ?? createServiceClient();

  const { data, error } = await client.rpc('offre_par_code', { p_code: code, p_zone: zone });
  if (error) throw new Error(error.message);

  const ligne = (data ?? [])[0] as
    | { id: string; code: string; domaine: DomaineAbonnement; periode: PeriodeAbonnement; montant: number; devise: string }
    | undefined;

  return ligne ?? null;
}
