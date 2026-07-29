import type {
  LigneCommande,
  LigneRefusee,
  PrixZone,
  TitreAchetable,
  Zone,
} from './types';

/**
 * Résolution du prix d'une commande — docs/PLAN.md D4.
 *
 * Module PUR : il reçoit une grille tarifaire déjà lue en base et rend des
 * lignes de commande. Aucune requête, aucune horloge.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE CONVERSION DE TAUX DE CHANGE, JAMAIS.                            │
 * │                                                                          │
 * │ D4 point 4 : « chaque prix est écrit à la main pour sa zone ». Un taux   │
 * │ appliqué à l'exécution ferait varier le prix affiché d'un jour à l'autre │
 * │ sans que personne ne l'ait décidé, et rendrait irreproductible le        │
 * │ montant d'une commande passée.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE REPLI DE D4 POINT 8 A ÉTÉ RETIRÉ, ET REMPLACÉ PAR UN REFUS NOMMÉ.    │
 * │                                                                          │
 * │ D4 point 8 prévoyait de retomber sur la zone internationale lorsqu'un   │
 * │ titre n'avait pas de prix dans la zone résolue. Appliqué ligne par      │
 * │ ligne, ce repli produisait un panier facturé moitié en francs CFA et    │
 * │ moitié en euros ; appliqué à la commande entière, il faisait passer     │
 * │ silencieusement un acheteur africain à la grille européenne.            │
 * │                                                                          │
 * │ La protection est désormais EN AMONT : un titre ne peut être publié en  │
 * │ vente à l'unité que s'il a un prix dans CHAQUE zone active — la base le │
 * │ vérifie par déclencheur (migration 0024). Le cas résiduel — une zone    │
 * │ ajoutée après publication — donne ici un refus explicite, jamais un     │
 * │ changement de devise en silence. Un panier dont le total change sans    │
 * │ explication fait abandonner l'acheteur.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Prix d'un titre pour une zone. Aucun repli : la zone demandée, ou rien. */
export function prixPourZone(prix: readonly PrixZone[], zone: Zone): PrixZone | null {
  return prix.find((p) => p.zone === zone) ?? null;
}

export interface Tarification {
  lignes: LigneCommande[];
  refusees: LigneRefusee[];
  zone: Zone;
}

/**
 * Transforme des titres en lignes de commande tarifées.
 *
 * Un titre est refusé plutôt qu'ignoré : l'utilisateur doit apprendre POURQUOI
 * son panier ne peut pas être commandé tel quel. Un panier qui se vide en
 * silence est un bogue perçu comme une panne.
 *
 * La zone rendue est toujours celle demandée : elle ne se déplace jamais sous
 * les pieds de l'acheteur.
 */
export function tarifer(titres: readonly TitreAchetable[], zone: Zone): Tarification {
  const lignes: LigneCommande[] = [];
  const refusees: LigneRefusee[] = [];

  for (const titre of titres) {
    // L'ordre des refus va du plus structurel au plus circonstanciel : un titre
    // non publié n'est pas achetable, quoi qu'il arrive ; un titre déjà possédé
    // le serait pour quelqu'un d'autre.
    if (!titre.publie) {
      refusees.push({ bookId: titre.bookId, titre: titre.titre, raison: 'non_publie' });
      continue;
    }
    if (!titre.disponibleAchat) {
      refusees.push({ bookId: titre.bookId, titre: titre.titre, raison: 'non_disponible_achat' });
      continue;
    }
    if (titre.dejaPossede) {
      // Revendre un titre déjà acheté est un débit indu : le droit est déjà
      // acquis, et il est perpétuel (§3.2).
      refusees.push({ bookId: titre.bookId, titre: titre.titre, raison: 'deja_possede' });
      continue;
    }

    const prix = prixPourZone(titre.prix, zone);
    if (!prix) {
      // Cas résiduel : une zone ouverte après la publication du titre. La
      // validation de publication empêche qu'il survienne pour un titre publié
      // dans les zones existantes.
      refusees.push({
        bookId: titre.bookId,
        titre: titre.titre,
        raison: 'sans_prix_dans_la_zone',
      });
      continue;
    }

    lignes.push({
      bookId: titre.bookId,
      titre: titre.titre,
      langue: titre.langue,
      prixUnitaire: prix.montant,
      devise: prix.devise,
      zone: prix.zone,
    });
  }

  return { lignes, refusees, zone };
}
