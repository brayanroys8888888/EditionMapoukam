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
 */

/**
 * Zone de repli.
 *
 * D4 point 8 : « Si un conte n'a pas de prix pour la zone résolue, on retombe
 * sur la zone internationale plutôt que d'échouer. »
 */
export const ZONE_DE_REPLI: Zone = 'international';

/** Prix d'un titre pour une zone, avec repli. */
export function prixPourZone(prix: readonly PrixZone[], zone: Zone): PrixZone | null {
  return prix.find((p) => p.zone === zone) ?? prix.find((p) => p.zone === ZONE_DE_REPLI) ?? null;
}

/**
 * Zone réellement applicable à une commande entière.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE REPLI EST DÉCIDÉ POUR LA COMMANDE, PAS LIGNE PAR LIGNE.              │
 * │                                                                          │
 * │ Appliqué ligne par ligne, D4 point 8 produirait un panier où un titre    │
 * │ est facturé en FCFA et le suivant en euros. Or `orders` ne porte QU'UNE  │
 * │ devise et QU'UNE zone, et additionner deux devises sans taux de change   │
 * │ n'a aucun sens — `sumAmounts` refuse d'ailleurs de le faire.            │
 * │                                                                          │
 * │ Si un seul titre du panier n'a pas de prix dans la zone demandée, la     │
 * │ commande entière bascule donc en zone internationale. Le repli reste     │
 * │ celui de D4 point 8 ; c'est sa portée qui est précisée.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function zoneApplicable(titres: readonly TitreAchetable[], souhaitee: Zone): Zone {
  const vendables = titres.filter((t) => t.prix.length > 0);
  if (vendables.length === 0) return souhaitee;

  const tousServis = vendables.every((t) => t.prix.some((p) => p.zone === souhaitee));
  return tousServis ? souhaitee : ZONE_DE_REPLI;
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
 */
export function tarifer(titres: readonly TitreAchetable[], souhaitee: Zone): Tarification {
  const zone = zoneApplicable(titres, souhaitee);
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
      refusees.push({ bookId: titre.bookId, titre: titre.titre, raison: 'sans_prix' });
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
