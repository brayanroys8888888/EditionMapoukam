import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import { getClock, type Clock } from '@/lib/clock';
import { tarifer } from '@/domain/orders/pricing';
import { calculerTotal } from '@/domain/orders/total';
import type { CodePromo, RefusPromo } from '@/domain/orders/promo';
import type { LigneRefusee, TotalCommande, Zone } from '@/domain/orders/types';
import { titresDuPanier, viderPanier } from './cart';
import { logger } from '@/lib/logger';

/**
 * Commandes — §4.2 F9, docs/PLAN.md D4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE COMMANDE N'EST JAMAIS PASSÉE EN `paye` ICI.                         │
 * │                                                                          │
 * │ CLAUDE.md règle 5 : « Les webhooks sont la seule source de vérité sur    │
 * │ l'état d'un paiement. Une redirection de navigateur ne déclenche jamais  │
 * │ l'octroi d'un droit. » Cette couche crée des commandes `en_attente` et   │
 * │ rien d'autre. L'octroi appartient à l'étape 9.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Aperçu chiffré d'un panier, sans rien enregistrer. */
export interface ApercuCommande {
  total: TotalCommande;
  refusees: readonly LigneRefusee[];
  /** Renseigné si un code a été soumis et écarté. Le total reste calculable. */
  refusPromo: RefusPromo | null;
  /**
   * Identifiant du code RETENU, s'il y en a un.
   *
   * Porté par l'aperçu plutôt que relu au moment d'écrire : deux lectures
   * séparées pourraient tomber de part et d'autre d'une désactivation du code,
   * et rattacher à la commande un code que le calcul avait écarté.
   */
  promoRetenuId: string | null;
  /**
   * La zone d'encaissement diffère-t-elle de celle affichée ?
   *
   * D4 point 5 : « Si les deux divergent, le total est recalculé et affiché
   * avant confirmation. Aucun montant n'est jamais modifié silencieusement. »
   */
  zoneDivergente: boolean;
}

export type RefusCommande = 'panier_vide' | 'confirmation_requise';

export type ResultatCommande =
  | { ok: true; orderId: string; apercu: ApercuCommande }
  | { ok: false; raison: RefusCommande; apercu: ApercuCommande | null };

/** Lit un code promotionnel. Jamais exposé au client : la table lui est fermée. */
async function lirePromo(
  client: AppSupabaseClient,
  code: string | null,
): Promise<CodePromo | null> {
  if (!code) return null;

  const { data } = await client
    .from('promo_codes')
    .select('id, code, type, valeur, devise, expire_le, actif, usage_max, usage_count')
    // La colonne impose `code = upper(code)` : la saisie est normalisée ici
    // plutôt que d'exiger de l'utilisateur qu'il respecte la casse.
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    code: data.code,
    type: data.type,
    valeur: data.valeur,
    devise: data.devise,
    expireLe: data.expire_le ? new Date(data.expire_le) : null,
    actif: data.actif,
    usageMax: data.usage_max,
    usageCount: data.usage_count,
  };
}

export interface DemandeApercu {
  /** Zone servie à l'affichage — provisoire, sans effet financier (D4 point 5). */
  zoneAffichee: Zone;
  /** Zone d'encaissement, issue du pays réel du moyen de paiement. */
  zoneEncaissement: Zone;
  codePromo?: string | null;
}

/**
 * Chiffre un panier sans rien enregistrer.
 *
 * Sert deux fois : à l'affichage du récapitulatif, et à la vérification faite
 * juste avant d'écrire la commande. Le même calcul dans les deux cas — deux
 * implémentations auraient fini par annoncer un montant et en facturer un autre.
 */
export async function apercu(
  userId: string,
  demande: DemandeApercu,
  options: { client?: AppSupabaseClient; clock?: Clock } = {},
): Promise<ApercuCommande | null> {
  const client = options.client ?? createServiceClient();
  const clock = options.clock ?? getClock();

  const titres = await titresDuPanier(userId, { client });
  const tarification = tarifer(titres, demande.zoneEncaissement);

  const promo = await lirePromo(client, demande.codePromo ?? null);
  const calcul = calculerTotal(tarification.lignes, tarification.zone, {
    promo,
    maintenant: clock.now(),
  });

  if (!calcul.ok) return null;

  return {
    total: calcul.total,
    refusees: tarification.refusees,
    refusPromo: calcul.refusPromo?.raison ?? null,
    // Le code n'est rattaché que s'il a été RETENU : un code expiré ne doit pas
    // figurer sur la commande, sans quoi le gestionnaire de webhooks croirait
    // devoir le décompter à l'encaissement.
    promoRetenuId: calcul.refusPromo === null ? (promo?.id ?? null) : null,
    // La divergence se mesure sur ce que l'utilisateur a VU, pas sur le repli
    // technique : un panier affiché en zone afrique et encaissé en zone
    // internationale doit être reconfirmé, même si le repli l'aurait imposé.
    zoneDivergente: demande.zoneAffichee !== tarification.zone,
  };
}

export interface DemandeCommande extends DemandeApercu {
  /**
   * Total que l'utilisateur a confirmé, en plus petite unité.
   *
   * Exigé UNIQUEMENT quand les zones divergent. Ce n'est pas un prix soumis par
   * le client — le montant facturé reste celui que le serveur recalcule. C'est
   * un accusé de réception : il prouve que le montant montré à l'écran est bien
   * celui qui va être débité.
   */
  totalConfirme?: number | null;
}

/**
 * Crée une commande `en_attente` à partir du panier.
 *
 * Le panier est vidé APRÈS l'écriture : si la création échoue, l'utilisateur
 * retrouve son panier intact plutôt qu'un panier vide et aucune commande.
 */
export async function creerCommande(
  userId: string,
  demande: DemandeCommande,
  options: { client?: AppSupabaseClient; clock?: Clock } = {},
): Promise<ResultatCommande> {
  const client = options.client ?? createServiceClient();

  const chiffrage = await apercu(userId, demande, options);
  if (!chiffrage) {
    return { ok: false, raison: 'panier_vide', apercu: null };
  }

  // D4 point 5 — aucun montant n'est modifié silencieusement. Tant que
  // l'utilisateur n'a pas confirmé le montant recalculé, rien n'est écrit.
  if (chiffrage.zoneDivergente && demande.totalConfirme !== chiffrage.total.total) {
    return { ok: false, raison: 'confirmation_requise', apercu: chiffrage };
  }

  const { data, error } = await client.rpc('create_order', {
    p_user_id: userId,
    p_zone: chiffrage.total.zone,
    p_devise: chiffrage.total.devise,
    p_montant_total: chiffrage.total.total,
    p_remise: chiffrage.total.remise,
    p_promo_code_id: chiffrage.promoRetenuId,
    p_lignes: chiffrage.total.lignes.map((ligne) => ({
      book_id: ligne.bookId,
      langue: ligne.langue,
      prix_unitaire: ligne.prixUnitaire,
      devise: ligne.devise,
      zone: ligne.zone,
    })),
  } as never);

  if (error || typeof data !== 'string') {
    throw new Error(`Commande impossible : ${error?.message ?? 'identifiant non rendu'}`);
  }

  await viderPanier(userId, { client });

  logger.info('Commande créée', {
    userId,
    orderId: data,
    montant: chiffrage.total.total,
    devise: chiffrage.total.devise,
    zone: chiffrage.total.zone,
    nbLignes: chiffrage.total.lignes.length,
  });

  return { ok: true, orderId: data, apercu: chiffrage };
}
