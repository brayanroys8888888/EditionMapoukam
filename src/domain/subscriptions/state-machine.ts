/**
 * Machine à états de l'abonnement — §9.1.
 *
 * Module PUR : aucune base, aucune horloge lue ici. Il répond à une seule
 * question — « cet événement est-il recevable dans cet état, et vers quel état
 * mène-t-il ? » — et c'est ce qui permet de l'éprouver sur les vingt-cinq
 * combinaisons plutôt que sur les trois que traverse un parcours nominal.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE NE DIT PAS QUI A LE DROIT DE LIRE.                            │
 * │                                                                          │
 * │ Les règles d'accès — période de grâce, accès maintenu jusqu'à la fin de  │
 * │ la période payée — vivent dans `access_for_books` (migration 0016),      │
 * │ unique implémentation, appelée aussi bien par l'application que par les  │
 * │ politiques RLS. Les réécrire ici les ferait diverger, et la divergence   │
 * │ porterait sur qui a le droit de lire quoi.                              │
 * │                                                                          │
 * │ Ici, on ne décide que du STATUT. Le moteur de droits en tire les         │
 * │ conséquences, seul.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export const STATUTS = ['essai', 'actif', 'annule', 'impaye', 'expire'] as const;
export type StatutAbonnement = (typeof STATUTS)[number];

/**
 * Statut OBSERVÉ, dates repliées.
 *
 * Reprend les statuts rapportés par le prestataire, plus `anomalie` — période
 * échue depuis plus que la tolérance sans qu'aucun événement ne soit arrivé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE MACHINE NE PRODUIT JAMAIS `anomalie`.                             │
 * │                                                                          │
 * │ `anomalie` n'est pas une transition : c'est un CONSTAT, calculé en base  │
 * │ par `statut_effectif` (migration 0029) à partir des dates. Aucun         │
 * │ prestataire ne la rapporte, et rien ne l'écrit jamais dans              │
 * │ `subscriptions.statut` — le type stocké ne la contient même pas.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const STATUTS_EFFECTIFS = [...STATUTS, 'anomalie'] as const;
export type StatutEffectif = (typeof STATUTS_EFFECTIFS)[number];

export const EVENEMENTS = [
  'souscrit',
  'renouvele',
  'prelevement_echoue',
  'annule',
  'expire',
] as const;
export type EvenementAbonnement = (typeof EVENEMENTS)[number];

export type RefusTransition =
  | 'deja_souscrit'
  | 'souscription_requise'
  | 'abonnement_termine'
  | 'annulation_definitive';

export type Transition =
  | { ok: true; statut: StatutAbonnement; inchange: boolean }
  | { ok: false; raison: RefusTransition };

/**
 * États depuis lesquels plus rien ne se produit.
 *
 * `expire` est le seul vrai terminal. `annule` ne l'est PAS : la période payée
 * court encore, et l'abonnement finira par expirer — c'est ce qui permet à
 * §9.1 de promettre un « accès maintenu jusqu'à la fin de la période payée ».
 */
const TERMINAUX: readonly StatutAbonnement[] = ['expire'];

export interface OptionsTransition {
  /**
   * La souscription ouvre-t-elle sur une période d'essai ?
   *
   * §3.4 prévoit sept jours d'essai gratuit, moyen de paiement requis. Une
   * offre sans essai part directement en `actif` — le paramètre vit ici, et non
   * chez l'appelant, parce que c'est bien un choix d'ÉTAT.
   */
  avecEssai?: boolean;
}

/**
 * Transition de la machine.
 *
 * @param courant `null` lorsqu'aucun abonnement n'existe encore.
 */
export function transitionner(
  courant: StatutAbonnement | null,
  evenement: EvenementAbonnement,
  options: OptionsTransition = {},
): Transition {
  // La souscription est le seul événement qui parte de rien — et elle ne part
  // que de rien : un second `souscrit` sur un abonnement vivant serait un
  // double prélèvement.
  if (evenement === 'souscrit') {
    if (courant === null || TERMINAUX.includes(courant)) {
      return {
        ok: true,
        statut: (options.avecEssai ?? true) ? 'essai' : 'actif',
        inchange: false,
      };
    }
    return { ok: false, raison: 'deja_souscrit' };
  }

  if (courant === null) {
    return { ok: false, raison: 'souscription_requise' };
  }

  // L'expiration est toujours recevable, y compris sur un abonnement déjà
  // expiré : c'est l'état de repos, et un prestataire peut le confirmer deux
  // fois sans que ce soit une anomalie.
  if (evenement === 'expire') {
    return { ok: true, statut: 'expire', inchange: courant === 'expire' };
  }

  if (courant === 'expire') {
    return { ok: false, raison: 'abonnement_termine' };
  }

  switch (evenement) {
    case 'renouvele':
      // Un abonnement ANNULÉ ne se renouvelle pas : c'est précisément l'objet
      // de l'annulation. Un prélèvement qui surviendrait après serait une
      // erreur du prestataire, pas une reconduction à honorer.
      if (courant === 'annule') {
        return { ok: false, raison: 'annulation_definitive' };
      }
      // Depuis `impaye`, un prélèvement réussi remet l'abonnement d'aplomb :
      // c'est le rattrapage normal d'une carte refusée puis remplacée.
      return { ok: true, statut: 'actif', inchange: courant === 'actif' };

    case 'prelevement_echoue':
      if (courant === 'annule') {
        // L'abonnement est déjà arrêté : un échec de prélèvement n'y change
        // rien, et le faire basculer en `impaye` ROUVRIRAIT une période de
        // grâce sur un abonnement que l'utilisateur a résilié.
        return { ok: false, raison: 'annulation_definitive' };
      }
      // Idempotent : deux échecs de suite ne relancent pas la période de grâce.
      // C'est le premier échec qui la fait courir (§9.1).
      return { ok: true, statut: 'impaye', inchange: courant === 'impaye' };

    case 'annule':
      return { ok: true, statut: 'annule', inchange: courant === 'annule' };
  }
}

/**
 * L'événement ouvre-t-il une nouvelle période payée ?
 *
 * Seuls la souscription et le renouvellement déplacent les bornes. Un échec de
 * prélèvement ou une annulation laissent `fin_periode` intacte — c'est elle qui
 * porte la promesse de §9.1 : « accès maintenu jusqu'à la fin de la période
 * payée ».
 */
export function ouvreNouvellePeriode(evenement: EvenementAbonnement): boolean {
  return evenement === 'souscrit' || evenement === 'renouvele';
}

/**
 * Le passage à cet état fait-il courir la période de grâce ?
 *
 * Renseigne `impaye_depuis`, dont le moteur de droits se sert pour maintenir
 * l'accès pendant `periode_grace_jours`.
 */
export function demarreGrace(precedent: StatutAbonnement | null, suivant: StatutAbonnement): boolean {
  return suivant === 'impaye' && precedent !== 'impaye';
}

/** Durée d'une période, en mois. */
export function dureeEnMois(offre: 'mensuel' | 'annuel'): number {
  return offre === 'mensuel' ? 1 : 12;
}
