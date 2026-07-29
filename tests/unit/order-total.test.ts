import { describe, expect, it } from 'vitest';

import { prixPourZone, tarifer } from '@/domain/orders/pricing';
import { paysZoneAfrique, zonePourPays } from '@/domain/orders/zones';
import { calculerRemise, type CodePromo } from '@/domain/orders/promo';
import { calculerTotal } from '@/domain/orders/total';
import type { TitreAchetable } from '@/domain/orders/types';

/**
 * Calcul du total d'une commande — docs/PLAN.md D4.
 *
 * Logique pure : ces tests couvrent les cas qui coûtent cher en production et
 * qu'un test d'intégration atteindrait mal — devise sans sous-unité, remise
 * supérieure au panier, panier mixte entre deux zones.
 */
const MAINTENANT = new Date('2026-07-29T12:00:00Z');

function titre(partiel: Partial<TitreAchetable> & { bookId: string }): TitreAchetable {
  return {
    titre: `Conte ${partiel.bookId}`,
    langue: 'fr',
    disponibleAchat: true,
    publie: true,
    dejaPossede: false,
    prix: [
      { zone: 'international', montant: 499, devise: 'EUR' },
      { zone: 'afrique', montant: 1500, devise: 'XAF' },
    ],
    ...partiel,
  };
}

describe('résolution du prix par zone', () => {
  it('sert la zone demandée', () => {
    const prix = [
      { zone: 'international' as const, montant: 499, devise: 'EUR' },
      { zone: 'afrique' as const, montant: 1500, devise: 'XAF' },
    ];

    expect(prixPourZone(prix, 'afrique')).toEqual({ zone: 'afrique', montant: 1500, devise: 'XAF' });
  });

  it('NE retombe PAS sur l’international quand la zone manque', () => {
    // Le repli de D4 point 8 a été retiré : il faisait passer silencieusement
    // un acheteur africain à la grille européenne. La protection est désormais
    // à la publication — un titre vendu à l'unité doit avoir un prix dans
    // chaque zone active — et le cas résiduel donne un refus nommé.
    const prix = [{ zone: 'international' as const, montant: 499, devise: 'EUR' }];

    expect(prixPourZone(prix, 'afrique')).toBeNull();
  });

  it('ne rend rien pour un titre sans aucun prix', () => {
    expect(prixPourZone([], 'international')).toBeNull();
  });

  it('ne convertit JAMAIS entre devises', () => {
    // D4 point 4 : aucun taux de change à l'exécution. 1500 XAF n'est pas
    // 1500 centimes d'euro, et rien ici ne doit le laisser croire.
    const prix = [{ zone: 'afrique' as const, montant: 1500, devise: 'XAF' }];

    expect(prixPourZone(prix, 'afrique')).toEqual({
      zone: 'afrique',
      montant: 1500,
      devise: 'XAF',
    });
  });
});

describe('zone tarifaire d’un pays de paiement', () => {
  it('sert la grille Afrique aux pays de la zone franc CFA', () => {
    // §3.3 — « Zone Afrique — paiement par Mobile Money ».
    for (const pays of ['SN', 'CI', 'CM', 'BF']) {
      expect(zonePourPays(pays), pays).toBe('afrique');
    }
  });

  it('sert la grille internationale partout ailleurs', () => {
    for (const pays of ['FR', 'BE', 'US', 'CA', 'JP']) {
      expect(zonePourPays(pays), pays).toBe('international');
    }
  });

  it('retombe sur l’INTERNATIONAL — la grille la plus chère — si le pays est inconnu', () => {
    // Le repli doit se faire vers le tarif le plus élevé : l'inverse ferait
    // d'une donnée manquante une remise automatique, et un prestataire qui
    // cesserait de renseigner le pays offrirait le tarif réduit à tout le monde.
    expect(zonePourPays(null)).toBe('international');
    expect(zonePourPays(undefined)).toBe('international');
    expect(zonePourPays('')).toBe('international');
    expect(zonePourPays('ZZ')).toBe('international');
  });

  it('ignore la casse et les espaces', () => {
    expect(zonePourPays(' sn ')).toBe('afrique');
  });

  it('ne liste que des codes ISO à deux lettres majuscules', () => {
    for (const pays of paysZoneAfrique()) {
      expect(pays, pays).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe('titre sans prix dans la zone d’encaissement', () => {
  it('est REFUSÉ, jamais reporté sur une autre grille', () => {
    // Un panier dont le total change de devise sans explication fait abandonner
    // l'acheteur. Le refus le nomme.
    const sansAfrique = titre({
      bookId: 'b',
      prix: [{ zone: 'international', montant: 699, devise: 'EUR' }],
    });

    const { lignes, refusees } = tarifer([titre({ bookId: 'a' }), sansAfrique], 'afrique');

    expect(lignes.map((l) => l.bookId)).toEqual(['a']);
    expect(refusees[0]).toEqual({
      bookId: 'b',
      titre: 'Conte b',
      raison: 'sans_prix_dans_la_zone',
    });
  });

  it('ne déplace jamais la zone des titres qui, eux, ont un prix', () => {
    const sansAfrique = titre({
      bookId: 'b',
      prix: [{ zone: 'international', montant: 699, devise: 'EUR' }],
    });

    const { lignes, zone } = tarifer([titre({ bookId: 'a' }), sansAfrique], 'afrique');

    expect(zone).toBe('afrique');
    expect(lignes[0]?.devise).toBe('XAF');
    expect(lignes[0]?.prixUnitaire).toBe(1500);
  });
});

describe('tarification du panier', () => {
  it('refuse un titre non publié', () => {
    const { lignes, refusees } = tarifer([titre({ bookId: 'a', publie: false })], 'international');

    expect(lignes).toHaveLength(0);
    expect(refusees[0]?.raison).toBe('non_publie');
  });

  it('refuse un titre non vendu à l’unité', () => {
    // `inclus_abonnement` et `disponible_achat` sont indépendants (§3.2) : un
    // titre peut être lisible par abonnement sans être vendu.
    const { refusees } = tarifer([titre({ bookId: 'a', disponibleAchat: false })], 'international');

    expect(refusees[0]?.raison).toBe('non_disponible_achat');
  });

  it('refuse un titre déjà possédé', () => {
    // Le revendre serait un débit indu : le droit est déjà acquis, et perpétuel.
    const { refusees } = tarifer([titre({ bookId: 'a', dejaPossede: true })], 'international');

    expect(refusees[0]?.raison).toBe('deja_possede');
  });

  it('refuse un titre sans aucun prix', () => {
    const { refusees } = tarifer([titre({ bookId: 'a', prix: [] })], 'international');

    expect(refusees[0]?.raison).toBe('sans_prix_dans_la_zone');
  });

  it('nomme le titre refusé, plutôt que de le retirer en silence', () => {
    // Un panier qui se vide sans explication est perçu comme une panne.
    const { refusees } = tarifer([titre({ bookId: 'a', dejaPossede: true })], 'international');

    expect(refusees[0]?.titre).toBe('Conte a');
  });

  it('tarife les titres valides et écarte les autres, dans le même passage', () => {
    const { lignes, refusees } = tarifer(
      [titre({ bookId: 'a' }), titre({ bookId: 'b', dejaPossede: true }), titre({ bookId: 'c' })],
      'international',
    );

    expect(lignes.map((l) => l.bookId)).toEqual(['a', 'c']);
    expect(refusees.map((r) => r.bookId)).toEqual(['b']);
  });
});

describe('total', () => {
  it('refuse un panier vide plutôt que de rendre zéro', () => {
    // Un total de 0 serait une commande gratuite valide. Le refus est explicite.
    const calcul = calculerTotal([], 'international', { maintenant: MAINTENANT });

    expect(calcul).toEqual({ ok: false, raison: 'panier_vide' });
  });

  it('additionne les lignes d’une même devise', () => {
    const { lignes } = tarifer([titre({ bookId: 'a' }), titre({ bookId: 'b' })], 'international');
    const calcul = calculerTotal(lignes, 'international', { maintenant: MAINTENANT });

    expect(calcul.ok && calcul.total.sousTotal).toBe(998);
    expect(calcul.ok && calcul.total.devise).toBe('EUR');
  });

  it('travaille en francs CFA sans jamais diviser par cent', () => {
    // 1 500 FCFA se stocke `1500` et vaut 1 500 FCFA — pas 15,00.
    const { lignes } = tarifer([titre({ bookId: 'a' }), titre({ bookId: 'b' })], 'afrique');
    const calcul = calculerTotal(lignes, 'afrique', { maintenant: MAINTENANT });

    expect(calcul.ok && calcul.total.total).toBe(3000);
    expect(calcul.ok && calcul.total.devise).toBe('XAF');
  });

  it('refuse d’additionner deux devises', () => {
    // Barrière de dernier recours : la résolution de zone garantit déjà
    // l'homogénéité. Si elle échouait, mieux vaut une erreur qu'un total faux.
    const lignes = [
      { bookId: 'a', titre: 'A', langue: 'fr' as const, prixUnitaire: 499, devise: 'EUR', zone: 'international' as const },
      { bookId: 'b', titre: 'B', langue: 'fr' as const, prixUnitaire: 1500, devise: 'XAF', zone: 'afrique' as const },
    ];

    expect(() => calculerTotal(lignes, 'international', { maintenant: MAINTENANT })).toThrow(
      /hétérogènes/,
    );
  });
});

describe('codes promotionnels', () => {
  const promo = (partiel: Partial<CodePromo>): CodePromo => ({
    id: 'p1',
    code: 'BIENVENUE',
    type: 'pourcentage',
    valeur: 20,
    devise: null,
    zone: null,
    expireLe: null,
    actif: true,
    usageMax: null,
    usageCount: 0,
    ...partiel,
  });

  it('applique un pourcentage', () => {
    expect(calculerRemise(promo({}), 1000, 'EUR', MAINTENANT, 'international')).toEqual({ ok: true, remise: 200 });
  });

  it('applique un pourcentage en francs CFA de la même façon', () => {
    // Un pourcentage n'a pas de devise : 20 % valent 20 % partout.
    expect(calculerRemise(promo({}), 3000, 'XAF', MAINTENANT, 'afrique')).toEqual({ ok: true, remise: 600 });
  });

  it('applique un montant fixe', () => {
    const code = promo({ type: 'montant', valeur: 200, devise: 'EUR', zone: 'international' });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT, 'international')).toEqual({ ok: true, remise: 200 });
  });

  it('PLAFONNE la remise au sous-total', () => {
    // Une remise de 10 € sur un panier de 4,99 € donnerait un total négatif,
    // c'est-à-dire un remboursement offert par un code de réduction.
    const code = promo({ type: 'montant', valeur: 1000, devise: 'EUR', zone: 'international' });

    expect(calculerRemise(code, 499, 'EUR', MAINTENANT, 'international')).toEqual({ ok: true, remise: 499 });
  });

  it('refuse un montant libellé dans une autre devise', () => {
    // L'appliquer reviendrait à convertir sans taux : 5 sur un panier en FCFA
    // retirerait cinq francs là où le code promettait cinq euros.
    const code = promo({ type: 'montant', valeur: 500, devise: 'EUR', zone: 'international' });

    expect(calculerRemise(code, 3000, 'XAF', MAINTENANT, 'afrique')).toEqual({
      ok: false,
      raison: 'devise_incompatible',
    });
  });

  it('refuse un montant fixe consenti pour une AUTRE zone', () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ LA DEVISE NE SUFFIT PAS À CANTONNER UNE REMISE.                        │
    // │                                                                      │
    // │ Le contrôle de devise attrape déjà la plupart des cas, la grille        │
    // │ actuelle associant une devise à chaque zone. Il ne les attrape pas     │
    // │ TOUS : la zone `afrique` couvre XAF et XOF, et rien n'interdit que     │
    // │ deux zones partagent un jour une devise — l'euro se pratique dans      │
    // │ plusieurs pays d'Afrique.                                             │
    // │                                                                      │
    // │ Ce test porte donc sur le contrôle de zone SEUL, devise identique :   │
    // │ sans lui, la règle ne serait tenue que par coïncidence de la grille.  │
    // └──────────────────────────────────────────────────────────────────┘
    const code = promo({ type: 'montant', valeur: 200, devise: 'EUR', zone: 'international' });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT, 'afrique')).toEqual({
      ok: false,
      raison: 'zone_incompatible',
    });
  });

  it('refuse un montant fixe SANS zone plutôt que de l’accepter partout', () => {
    // Les contraintes de la migration 0036 le rendent impossible en base. S'il
    // en apparaissait un malgré tout, l'appliquer dans toutes les zones serait
    // le pire des deux comportements.
    const code = promo({ type: 'montant', valeur: 200, devise: 'EUR', zone: null });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT, 'international')).toEqual({
      ok: false,
      raison: 'zone_incompatible',
    });
  });

  it('applique un POURCENTAGE dans n’importe quelle zone', () => {
    // Le pendant : un pourcentage est neutre en devise, donc jamais cantonné.
    const code = promo({ type: 'pourcentage', valeur: 20, zone: null });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT, 'afrique')).toEqual({
      ok: true,
      remise: 200,
    });
  });

  it('refuse un code expiré, à la seconde près', () => {
    const code = promo({ expireLe: MAINTENANT });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT, 'international')).toEqual({ ok: false, raison: 'expire' });
  });

  it('accepte un code qui expire une seconde plus tard', () => {
    const code = promo({ expireLe: new Date(MAINTENANT.getTime() + 1000) });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT, 'international').ok).toBe(true);
  });

  it('refuse un code désactivé', () => {
    expect(calculerRemise(promo({ actif: false }), 1000, 'EUR', MAINTENANT, 'international')).toEqual({
      ok: false,
      raison: 'inactif',
    });
  });

  it('refuse un code épuisé', () => {
    const code = promo({ usageMax: 10, usageCount: 10 });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT, 'international')).toEqual({ ok: false, raison: 'epuise' });
  });

  it('refuse un code inconnu', () => {
    expect(calculerRemise(null, 1000, 'EUR', MAINTENANT, 'international')).toEqual({ ok: false, raison: 'inconnu' });
  });

  it('n’empêche JAMAIS de commander : un code refusé laisse le total intact', () => {
    // Bloquer la commande sur un code expiré immobiliserait un panier valide.
    const { lignes } = tarifer([titre({ bookId: 'a' })], 'international');
    const calcul = calculerTotal(lignes, 'international', {
      promo: promo({ actif: false }),
      maintenant: MAINTENANT,
    });

    expect(calcul.ok && calcul.total.total).toBe(499);
    expect(calcul.ok && calcul.total.remise).toBe(0);
    expect(calcul.ok && calcul.refusPromo?.raison).toBe('inactif');
  });

  it('déduit la remise du total quand le code est retenu', () => {
    const { lignes } = tarifer([titre({ bookId: 'a' })], 'international');
    const calcul = calculerTotal(lignes, 'international', {
      // Un code a montant fixe porte sa zone : elle doit correspondre a celle
      // du panier, sans quoi il est refuse.
      promo: promo({ type: 'montant', valeur: 100, devise: 'EUR', zone: 'international' }),
      maintenant: MAINTENANT,
    });

    expect(calcul.ok && calcul.total.sousTotal).toBe(499);
    expect(calcul.ok && calcul.total.remise).toBe(100);
    expect(calcul.ok && calcul.total.total).toBe(399);
  });
});
