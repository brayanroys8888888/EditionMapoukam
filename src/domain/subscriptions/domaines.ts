/**
 * Les deux domaines d'abonnement — §3.6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ÉTANCHES, ET CUMULABLES.                                                │
 * │                                                                          │
 * │ `lecture`     ouvre la lecture en ligne du catalogue, et rien d'autre.   │
 * │ `association` ouvre le contenu réservé de l'Association Dave, et rien    │
 * │               d'autre.                                                   │
 * │                                                                          │
 * │ Un même compte peut détenir les deux : ce sont deux contrats, payés      │
 * │ séparément. Aucun des deux n'accorde le TÉLÉCHARGEMENT — seul un achat   │
 * │ le fait (§3.2 principe 1).                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce module ne contient que des TYPES et des listes. La question « cet
 * abonnement ouvre-t-il le droit ? » a une seule implémentation, et elle est en
 * SQL : `abonnement_ouvre_droit(user, domaine, at)`, migration 0067.
 */

export type DomaineAbonnement = 'lecture' | 'association';

/** Période de facturation. C'est elle qui donne la durée, pas le domaine. */
export type PeriodeAbonnement = 'mensuel' | 'annuel';

export const DOMAINES_ABONNEMENT = ['lecture', 'association'] as const;

export const PERIODES_ABONNEMENT = ['mensuel', 'annuel'] as const;

export function estDomaineAbonnement(valeur: string): valeur is DomaineAbonnement {
  return (DOMAINES_ABONNEMENT as readonly string[]).includes(valeur);
}
