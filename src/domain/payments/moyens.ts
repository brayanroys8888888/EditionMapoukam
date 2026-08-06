/**
 * Moyens de paiement offerts au règlement — §3.3.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN NUMÉRO DE CARTE N'EST DEMANDÉ, ET AUCUN NE LE SERA.               │
 * │                                                                          │
 * │ La décision date de l'écran de règlement d'origine, et elle tient — mais  │
 * │ elle ne dit pas « pas de formulaire de paiement ». Elle dit que le        │
 * │ NUMÉRO DE CARTE ne passe pas par nous, et c'est aussi ce que fera         │
 * │ l'intégration réelle : les prestataires imposent des champs hébergés      │
 * │ chez eux, précisément pour que le numéro ne touche jamais le serveur du   │
 * │ marchand. Un formulaire de carte écrit ici devrait être démonté le jour   │
 * │ de l'intégration, après avoir appris à des gens à taper leur carte sur    │
 * │ un écran qui n'encaisse rien.                                            │
 * │                                                                          │
 * │ Le Mobile Money, lui, fonctionne autrement : l'API de l'opérateur reçoit  │
 * │ un NUMÉRO DE TÉLÉPHONE et pousse une demande de confirmation sur le       │
 * │ combiné. Le demander est donc exact — c'est le champ que l'intégration    │
 * │ réelle demandera, au même endroit du tunnel.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MOYEN CHOISI NE RETARIFE RIEN.                                       │
 * │                                                                          │
 * │ La zone d'encaissement vient du pays que le PRESTATAIRE rapporte, et elle │
 * │ est figée sur la commande à sa création (§3.3, D4 point 7). Choisir       │
 * │ « Orange Money Cameroun » sur une commande chiffrée en zone               │
 * │ internationale ne la rechiffre donc pas : D4 point 5 interdit qu'un       │
 * │ montant change en silence entre l'écran qui l'annonce et le débit.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module PUR : des listes et deux prédicats, rien qui touche au réseau.
 */

export const MOYENS_PAIEMENT = ['orange_money', 'mtn_momo', 'carte'] as const;

export type MoyenPaiement = (typeof MOYENS_PAIEMENT)[number];

export function estMoyenPaiement(valeur: unknown): valeur is MoyenPaiement {
  return typeof valeur === 'string' && MOYENS_PAIEMENT.includes(valeur as MoyenPaiement);
}

/**
 * Pays où chaque opérateur est présent — codes ISO 3166-1 alpha-2.
 *
 * Volontairement restreinte aux marchés que §5.1 vise, et volontairement
 * explicite : « les pays d'Afrique francophone » se serait mis à diverger de
 * `zonePourPays` au premier ajout, et l'écran aurait proposé un opérateur là
 * où aucun prix n'existe.
 */
const PAYS_OPERATEUR: Record<MoyenPaiement, readonly string[]> = {
  orange_money: ['CM', 'CI', 'SN', 'ML', 'BF', 'GN', 'CD', 'MG'],
  mtn_momo: ['CM', 'CI', 'BJ', 'GN', 'CG', 'RW'],
  // La carte n'est liée à aucun pays : c'est le prestataire qui lira celui de
  // la carte, et lui seul.
  carte: [],
};

export function paysDeLOperateur(moyen: MoyenPaiement): readonly string[] {
  return PAYS_OPERATEUR[moyen];
}

/** Tous les pays cités, pour que l'i18n sache lesquels traduire. */
export function paysMobileMoney(): readonly string[] {
  return [...new Set([...PAYS_OPERATEUR.orange_money, ...PAYS_OPERATEUR.mtn_momo])].sort();
}

/**
 * Le moyen passe-t-il par un numéro de téléphone ?
 *
 * C'est ce prédicat, et non une comparaison au nom d'un opérateur, qui décide
 * des champs affichés : un troisième opérateur de Mobile Money s'y ajoutera
 * sans qu'aucun écran ne change.
 */
export function exigeTelephone(moyen: MoyenPaiement): boolean {
  return PAYS_OPERATEUR[moyen].length > 0;
}

/**
 * Un numéro de téléphone est-il plausible ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ PLAUSIBLE, PAS VALIDE — ET LA DIFFÉRENCE EST VOULUE.                    │
 * │                                                                          │
 * │ Les plans de numérotation changent : le Cameroun est passé de huit à      │
 * │ neuf chiffres en 2014, et une expression trop stricte aurait alors rejeté │
 * │ des numéros parfaitement valides. Seul l'opérateur sait si un numéro      │
 * │ existe, et il le dira en refusant la demande.                            │
 * │                                                                          │
 * │ Ce contrôle n'attrape donc que la faute de frappe manifeste, tout de      │
 * │ suite, plutôt que de la laisser revenir en échec de paiement.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function telephonePlausible(valeur: string): boolean {
  const compact = valeur.replace(/[\s.\-()]/g, '');
  return /^\+?\d{8,15}$/.test(compact);
}
