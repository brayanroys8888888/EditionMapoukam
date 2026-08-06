import {
  estMoyenPaiement,
  exigeTelephone,
  paysDeLOperateur,
  telephonePlausible,
} from '@/domain/payments/moyens';

/**
 * Contrôle des coordonnées de règlement, partagé par les deux tunnels.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE NE CONSERVE RIEN, ET N'A NULLE PART OÙ LE FAIRE.              │
 * │                                                                          │
 * │ Il rend la liste des champs en défaut, et c'est tout. Les valeurs elles- │
 * │ mêmes ne ressortent pas : les faire remonter aurait invité à les écrire  │
 * │ quelque part « pour plus tard », et le numéro de téléphone d'un compte   │
 * │ Mobile Money n'a aucune raison de vivre chez le marchand.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL NE REMPLACE PAS LA VALIDATION DU NAVIGATEUR, IL LA DOUBLE.           │
 * │                                                                          │
 * │ `required` et `type="email"` sont une commodité pour qui remplit le      │
 * │ formulaire ; ils s'enlèvent avec un clic dans les outils de développement.│
 * │ Un champ n'est vérifié que lorsqu'il l'est côté serveur — c'est la même  │
 * │ raison qui fait valider chaque route d'API avec Zod avant tout           │
 * │ traitement.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les noms de champs, tels que l'écran les rend et les relit. */
export const CHAMPS_COORDONNEES = ['moyen', 'nom', 'email', 'pays', 'telephone'] as const;

export type ChampCoordonnees = (typeof CHAMPS_COORDONNEES)[number];

function texte(donnees: FormData, nom: string): string {
  const valeur = donnees.get(nom);
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/**
 * Une adresse email est-elle plausible ?
 *
 * Aussi permissif que le contrôle du numéro de téléphone, et pour la même
 * raison : la seule preuve qu'une adresse existe est qu'un message y arrive.
 * Une expression stricte rejetterait des adresses valides — les apostrophes,
 * les signes plus, les domaines longs — pour n'attraper que ce qu'un simple
 * « une arobase, un point après » attrape déjà.
 */
function emailPlausible(valeur: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valeur) && valeur.length <= 200;
}

/**
 * Les champs en défaut, dans l'ordre où l'écran les présente.
 *
 * Rend une liste vide quand tout va bien. Les champs demandés dépendent du
 * MOYEN : la carte n'a ni pays ni numéro, et exiger l'un ou l'autre aurait
 * bloqué un règlement par carte sur des champs que l'écran n'affiche même pas.
 */
export function verifierCoordonnees(donnees: FormData): ChampCoordonnees[] {
  const defauts: ChampCoordonnees[] = [];

  const moyenBrut = donnees.get('moyen');
  if (!estMoyenPaiement(moyenBrut)) return ['moyen'];

  if (texte(donnees, 'nom').length < 2) defauts.push('nom');
  if (!emailPlausible(texte(donnees, 'email'))) defauts.push('email');

  if (exigeTelephone(moyenBrut)) {
    // Le pays doit être l'un de ceux où l'OPÉRATEUR CHOISI est présent, et non
    // n'importe quel code à deux lettres : la liste du menu déroulant est déjà
    // filtrée par opérateur, et un formulaire soumis à la main ne doit pas
    // pouvoir demander « Orange Money au Rwanda ».
    if (!paysDeLOperateur(moyenBrut).includes(texte(donnees, 'pays'))) defauts.push('pays');
    if (!telephonePlausible(texte(donnees, 'telephone'))) defauts.push('telephone');
  }

  return defauts;
}

/** Relit la liste de champs en défaut portée par l'URL après un refus. */
export function champsEnDefaut(valeur: string | undefined): ChampCoordonnees[] {
  if (!valeur) return [];

  return valeur
    .split(',')
    .filter((champ): champ is ChampCoordonnees =>
      CHAMPS_COORDONNEES.includes(champ as ChampCoordonnees),
    );
}
