/**
 * LES QUATRE TYPES DE PUBLICATION, ÉCRITS UNE FOIS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS ÉCRANS LES LISAIENT, ET CHACUN LES RECOPIAIT.                     │
 * │                                                                          │
 * │ La liste de l'onglet pour ses pastilles, la barre d'outils pour son      │
 * │ volet de choix, l'écran de rédaction pour valider le `?type=` de son     │
 * │ adresse. Trois copies d'une même énumération, et la base en porte une    │
 * │ quatrième : `association_contents.type_publication`.                     │
 * │                                                                          │
 * │ Un type ajouté en base serait alors accepté par la route, refusé par     │
 * │ l'adresse, et rendu « ? » dans la liste — trois comportements pour une   │
 * │ seule donnée. Ce fichier ferme ce chemin-là côté interface ; la base     │
 * │ reste seule juge de ce qu'elle accepte.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce module ne porte QUE des constantes : aucun import, donc rien qui empêche
 * un composant client de le tirer un jour sans réveiller le client de service.
 */
export const TYPES_PUBLICATION = [
  'compte_rendu',
  'recit_terrain',
  'fiche_pdf',
  'replay',
] as const;

export type TypePublication = (typeof TYPES_PUBLICATION)[number];

export function estTypePublication(valeur: string): valeur is TypePublication {
  return (TYPES_PUBLICATION as readonly string[]).includes(valeur);
}

/**
 * L'abréviation de la pastille : CR, RT, PDF, ▶ — celles du prototype.
 *
 * Un `Record` complet, et non un index partiel : ajouter un type sans lui
 * donner de sigle ne compile pas, ce qui vaut mieux qu'un « ? » découvert
 * dans la liste trois semaines plus tard.
 */
export const SIGLE_TYPE: Record<TypePublication, string> = {
  compte_rendu: 'CR',
  recit_terrain: 'RT',
  fiche_pdf: 'PDF',
  replay: '▶',
};
