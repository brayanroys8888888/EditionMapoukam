import { createServiceClient } from '@/lib/supabase/clients';
import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { getClock } from '@/lib/clock';

/**
 * Paramètres métier — source UNIQUE : la table `business_settings`.
 *
 * Ces valeurs ne vivent PAS dans l'environnement. Une politique RLS ne peut pas
 * lire les variables du processus Node : si l'application et la base tiraient
 * leurs valeurs de deux endroits, elles finiraient par appliquer deux règles
 * différentes, et un test de concordance ne ferait que constater la divergence
 * une fois installée.
 *
 * L'application n'en a besoin que pour l'affichage — « disponible dans 12
 * jours », écran d'administration. Le moteur de droits, lui, les lit
 * directement en SQL et ne passe jamais par ce module.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EFFET RÉTROACTIF. Modifier la fenêtre de nouveauté change À LA SECONDE   │
 * │ l'accès à tous les titres concernés, sans migration ni déploiement.      │
 * │ Toute écriture doit passer par `updateBusinessSettings`, qui invalide le │
 * │ cache et exige d'avoir consulté le nombre de titres impactés.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface BusinessSettings {
  fenetreNouveauteJours: number;
  periodeGraceJours: number;
  /**
   * Durée d'essai accordée aux NOUVELLES souscriptions (§3.4).
   *
   * Réglable, mais sans effet rétroactif : la valeur est recopiée sur chaque
   * abonnement à sa création (`subscriptions.jours_essai`), comme le prix l'est
   * sur `order_items`. Sans cela, ramener le réglage de 7 à 3 jours prélèverait
   * au troisième jour un abonné à qui sept ont été promis.
   */
  joursEssai: number;
  majLe: Date;
}

export interface ImpactFenetre {
  entrentDansAbonnement: number;
  sortentDeLAbonnement: number;
}

/**
 * Durée du cache, en millisecondes.
 *
 * Court volontairement : ces valeurs changent rarement, mais quand elles
 * changent, l'effet est commercial et immédiat. Trente secondes de retard
 * d'affichage sont acceptables ; trente minutes ne le seraient pas.
 */
const DUREE_CACHE_MS = 30_000;

let cache: { valeur: BusinessSettings; expireA: number } | null = null;

export async function getBusinessSettings(
  options: { client?: AppSupabaseClient; forcerRelecture?: boolean } = {},
): Promise<BusinessSettings> {
  const maintenant = getClock().now().getTime();
  if (!options.forcerRelecture && cache && cache.expireA > maintenant) {
    return cache.valeur;
  }

  const client = options.client ?? createServiceClient();
  const { data, error } = await client
    .from('business_settings')
    .select('fenetre_nouveaute_jours, periode_grace_jours, jours_essai, maj_le')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    // Pas de valeur de repli : appliquer une fenêtre inventée reviendrait à
    // ouvrir ou fermer l'abonnement sur des titres au hasard.
    throw new Error(
      `Paramètres métier illisibles : ${error?.message ?? 'aucune ligne dans business_settings'}`,
    );
  }

  const valeur: BusinessSettings = {
    fenetreNouveauteJours: data.fenetre_nouveaute_jours,
    periodeGraceJours: data.periode_grace_jours,
    joursEssai: data.jours_essai,
    majLe: new Date(data.maj_le),
  };
  cache = { valeur, expireA: maintenant + DUREE_CACHE_MS };
  return valeur;
}

/**
 * Nombre de titres qui basculeraient si la fenêtre prenait cette valeur.
 *
 * À présenter à l'administrateur AVANT validation : sans ce chiffre, il
 * modifie une règle commerciale à l'aveugle.
 */
export async function simulerChangementDeFenetre(
  nouvelleFenetreJours: number,
  options: { client?: AppSupabaseClient } = {},
): Promise<ImpactFenetre> {
  const client = options.client ?? createServiceClient();
  const { data, error } = await client.rpc('titres_impactes_par_fenetre', {
    p_nouvelle_fenetre: nouvelleFenetreJours,
  });

  if (error) {
    throw new Error(`Simulation impossible : ${error.message}`);
  }

  const ligne = (data as { entrent_dans_abonnement: number; sortent_de_l_abonnement: number }[])[0];
  return {
    entrentDansAbonnement: ligne?.entrent_dans_abonnement ?? 0,
    sortentDeLAbonnement: ligne?.sortent_de_l_abonnement ?? 0,
  };
}

/**
 * Modifie les paramètres et invalide le cache.
 *
 * Les bornes sont vérifiées par la base (contraintes `CHECK`) : un appel direct,
 * un script de reprise ou une console ne peuvent pas les contourner. Cette
 * fonction ne les redouble pas — elle laisse remonter l'erreur de la base, qui
 * est l'autorité.
 */
export async function updateBusinessSettings(
  modifications: Partial<
    Pick<BusinessSettings, 'fenetreNouveauteJours' | 'periodeGraceJours' | 'joursEssai'>
  >,
  auteurId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<BusinessSettings> {
  const client = options.client ?? createServiceClient();

  const { error } = await client
    .from('business_settings')
    .update({
      ...(modifications.fenetreNouveauteJours !== undefined
        ? { fenetre_nouveaute_jours: modifications.fenetreNouveauteJours }
        : {}),
      ...(modifications.periodeGraceJours !== undefined
        ? { periode_grace_jours: modifications.periodeGraceJours }
        : {}),
      ...(modifications.joursEssai !== undefined ? { jours_essai: modifications.joursEssai } : {}),
      maj_par: auteurId,
    })
    .eq('id', 1);

  if (error) {
    throw new Error(`Modification refusée : ${error.message}`);
  }

  invaliderCache();
  return getBusinessSettings({ client, forcerRelecture: true });
}

/** Vide le cache. Appelé après écriture, et par les tests. */
export function invaliderCache(): void {
  cache = null;
}
