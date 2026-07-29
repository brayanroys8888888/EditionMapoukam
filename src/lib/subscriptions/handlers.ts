import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import { getClock, type Clock } from '@/lib/clock';
import {
  demarreGrace,
  dureeEnMois,
  ouvreNouvellePeriode,
  transitionner,
  type EvenementAbonnement,
  type RefusTransition,
  type StatutAbonnement,
} from '@/domain/subscriptions/state-machine';
import { logger } from '@/lib/logger';

/**
 * Application des transitions d'abonnement — §9.1.
 *
 * La décision — « cet événement est-il recevable, et vers quel état mène-t-il ? »
 * — appartient à `src/domain/subscriptions/state-machine.ts`, module pur. Ce
 * fichier ne fait que l'appliquer en base.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA ZONE EST FIGÉE À LA SOUSCRIPTION, JAMAIS RECALCULÉE.                 │
 * │                                                                          │
 * │ docs/PLAN.md D4 point 7. Un renouvellement ne touche ni `zone`, ni       │
 * │ `devise`, ni `montant` : un abonné qui souscrit en zone Afrique à        │
 * │ 2 500 FCFA doit être reconduit à 2 500 FCFA, même s'il renouvelle depuis │
 * │ un autre pays. Recalculer reviendrait à changer le prix d'un contrat en  │
 * │ cours sans que personne ne l'ait décidé.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export interface AbonnementCourant {
  id: string;
  statut: StatutAbonnement;
  finPeriode: Date;
  zone: 'international' | 'afrique';
  devise: string;
  montant: number;
  offre: 'mensuel' | 'annuel';
}

export type ResultatTransition =
  | { ok: true; subscriptionId: string; statut: StatutAbonnement; inchange: boolean }
  | { ok: false; raison: RefusTransition };

/** Abonnement en cours de vie d'un utilisateur, s'il y en a un. */
export async function abonnementCourant(
  userId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<AbonnementCourant | null> {
  const client = options.client ?? createServiceClient();

  // `essai`, `actif` et `impaye` sont les statuts vivants — ceux que l'index
  // unique de la migration 0008 empêche d'avoir en double. Un abonnement
  // `annule` dont la période court encore est lu aussi : il ouvre toujours le
  // droit, et un nouvel événement doit le retrouver.
  const { data } = await client
    .from('subscriptions')
    .select('id, statut, fin_periode, zone, devise, montant, offre')
    .eq('user_id', userId)
    .in('statut', ['essai', 'actif', 'impaye', 'annule'])
    .order('cree_le', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    statut: data.statut,
    finPeriode: new Date(data.fin_periode),
    zone: data.zone,
    devise: data.devise,
    montant: data.montant,
    offre: data.offre as 'mensuel' | 'annuel',
  };
}

/** Fin d'une période ouverte à `depuis`, pour une offre donnée. */
function finDePeriode(depuis: Date, offre: 'mensuel' | 'annuel'): Date {
  const fin = new Date(depuis.getTime());
  fin.setUTCMonth(fin.getUTCMonth() + dureeEnMois(offre));
  return fin;
}

export interface DemandeTransition {
  userId: string;
  evenement: EvenementAbonnement;
  /** Requis pour une souscription. Ignoré ensuite : l'offre est celle du contrat. */
  offre?: 'mensuel' | 'annuel';
  zone?: 'international' | 'afrique';
  devise?: string;
  montant?: number;
  joursEssai?: number;
  idPrestataire?: string | null;
  webhookEventId?: string | null;
}

/**
 * Applique un événement d'abonnement.
 *
 * Idempotent par construction : la machine à états rend `inchange` quand
 * l'événement ne modifie rien, et un rejeu n'écrit alors pas une seconde fois.
 */
export async function appliquerEvenement(
  demande: DemandeTransition,
  options: { client?: AppSupabaseClient; clock?: Clock } = {},
): Promise<ResultatTransition> {
  const client = options.client ?? createServiceClient();
  const clock = options.clock ?? getClock();
  const maintenant = clock.now();

  const courant = await abonnementCourant(demande.userId, { client });

  const transition = transitionner(courant?.statut ?? null, demande.evenement, {
    avecEssai: (demande.joursEssai ?? 0) > 0,
  });

  if (!transition.ok) {
    logger.info('Transition d’abonnement refusée', {
      userId: demande.userId,
      evenement: demande.evenement,
      statutCourant: courant?.statut ?? null,
      raison: transition.raison,
    });
    return transition;
  }

  const subscriptionId =
    demande.evenement === 'souscrit'
      ? await creer(client, demande, transition.statut, maintenant)
      : await mettreAJour(client, courant!, demande, transition.statut, maintenant);

  await client.from('payment_events').insert({
    webhook_event_id: demande.webhookEventId ?? null,
    type: `abonnement.${demande.evenement}`,
    subscription_id: subscriptionId,
    user_id: demande.userId,
    detail: { statut: transition.statut, inchange: transition.inchange },
  });

  logger.info('Abonnement mis à jour', {
    userId: demande.userId,
    subscriptionId,
    evenement: demande.evenement,
    statut: transition.statut,
  });

  return {
    ok: true,
    subscriptionId,
    statut: transition.statut,
    inchange: transition.inchange,
  };
}

/** Crée l'abonnement. La zone y est figée pour toute sa durée de vie. */
async function creer(
  client: AppSupabaseClient,
  demande: DemandeTransition,
  statut: StatutAbonnement,
  maintenant: Date,
): Promise<string> {
  const offre = demande.offre ?? 'mensuel';

  // La période d'essai fait partie de la période couverte : l'accès est ouvert
  // dès la souscription (§3.4, moyen de paiement requis).
  const fin =
    statut === 'essai' && demande.joursEssai
      ? new Date(maintenant.getTime() + demande.joursEssai * 86_400_000)
      : finDePeriode(maintenant, offre);

  const { data, error } = await client
    .from('subscriptions')
    .insert({
      user_id: demande.userId,
      offre,
      statut,
      debut_periode: maintenant.toISOString(),
      fin_periode: fin.toISOString(),
      zone: demande.zone ?? 'international',
      devise: demande.devise ?? 'EUR',
      montant: demande.montant ?? 0,
      id_prestataire: demande.idPrestataire ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Souscription impossible : ${error.message}`);
  }
  return data.id;
}

/** Fait évoluer l'abonnement existant. */
async function mettreAJour(
  client: AppSupabaseClient,
  courant: AbonnementCourant,
  demande: DemandeTransition,
  statut: StatutAbonnement,
  maintenant: Date,
): Promise<string> {
  // Typé explicitement plutôt qu'en `Record<string, unknown>` : le client
  // Supabase est généré depuis le schéma, et un nom de colonne mal orthographié
  // doit être une erreur de compilation, non une mise à jour silencieusement
  // sans effet.
  const valeurs: {
    statut: StatutAbonnement;
    maj_le: string;
    debut_periode?: string;
    fin_periode?: string;
    impaye_depuis?: string | null;
    annule_le?: string;
  } = { statut, maj_le: maintenant.toISOString() };

  if (ouvreNouvellePeriode(demande.evenement)) {
    // Le renouvellement repart de la fin de la période en cours quand elle est
    // encore devant nous, et de maintenant sinon. Repartir systématiquement de
    // maintenant offrirait des jours à qui renouvelle en avance ; repartir
    // systématiquement de `fin_periode` en offrirait à qui a laissé traîner un
    // impayé.
    const depuis = courant.finPeriode > maintenant ? courant.finPeriode : maintenant;
    valeurs.debut_periode = depuis.toISOString();
    valeurs.fin_periode = finDePeriode(depuis, courant.offre).toISOString();
    // Le rattrapage d'un impayé referme la période de grâce.
    valeurs.impaye_depuis = null;
  }

  if (demarreGrace(courant.statut, statut)) {
    // C'est le PREMIER échec qui fait courir la grâce (§9.1). Un second échec
    // ne la relance pas, sans quoi un prestataire qui réessaie chaque jour la
    // prolongerait indéfiniment.
    valeurs.impaye_depuis = maintenant.toISOString();
  }

  if (statut === 'annule' && courant.statut !== 'annule') {
    // La date d'annulation est conservée, et `fin_periode` reste intacte :
    // l'accès est maintenu jusqu'au terme de la période payée (§9.1).
    valeurs.annule_le = maintenant.toISOString();
  }

  const { error } = await client.from('subscriptions').update(valeurs).eq('id', courant.id);
  if (error) {
    throw new Error(`Mise à jour de l’abonnement impossible : ${error.message}`);
  }

  return courant.id;
}
