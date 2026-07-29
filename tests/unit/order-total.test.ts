import { describe, expect, it } from 'vitest';

import { prixPourZone, tarifer, zoneApplicable, ZONE_DE_REPLI } from '@/domain/orders/pricing';
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

  it('retombe sur l’international quand la zone manque', () => {
    // D4 point 8 : « on retombe sur la zone internationale plutôt que d'échouer ».
    const prix = [{ zone: 'international' as const, montant: 499, devise: 'EUR' }];

    expect(prixPourZone(prix, 'afrique')?.zone).toBe(ZONE_DE_REPLI);
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

describe('zone applicable à une commande entière', () => {
  it('garde la zone demandée quand tous les titres y ont un prix', () => {
    expect(zoneApplicable([titre({ bookId: 'a' }), titre({ bookId: 'b' })], 'afrique')).toBe(
      'afrique',
    );
  });

  it('bascule TOUTE la commande en repli si un seul titre manque à l’appel', () => {
    // Appliqué ligne par ligne, le repli produirait un panier facturé moitié en
    // FCFA moitié en euros — or une commande ne porte qu'une devise, et
    // additionner deux devises sans taux de change n'a aucun sens.
    const sansAfrique = titre({
      bookId: 'b',
      prix: [{ zone: 'international', montant: 699, devise: 'EUR' }],
    });

    expect(zoneApplicable([titre({ bookId: 'a' }), sansAfrique], 'afrique')).toBe('international');
  });

  it('ignore les titres sans aucun prix dans ce choix', () => {
    // Un titre sans prix sera refusé ensuite : il n'a pas à faire basculer la
    // zone des titres qui, eux, sont vendables.
    const sansPrix = titre({ bookId: 'c', prix: [] });

    expect(zoneApplicable([titre({ bookId: 'a' }), sansPrix], 'afrique')).toBe('afrique');
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

  it('refuse un titre sans prix', () => {
    const { refusees } = tarifer([titre({ bookId: 'a', prix: [] })], 'international');

    expect(refusees[0]?.raison).toBe('sans_prix');
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
    expireLe: null,
    actif: true,
    usageMax: null,
    usageCount: 0,
    ...partiel,
  });

  it('applique un pourcentage', () => {
    expect(calculerRemise(promo({}), 1000, 'EUR', MAINTENANT)).toEqual({ ok: true, remise: 200 });
  });

  it('applique un pourcentage en francs CFA de la même façon', () => {
    // Un pourcentage n'a pas de devise : 20 % valent 20 % partout.
    expect(calculerRemise(promo({}), 3000, 'XAF', MAINTENANT)).toEqual({ ok: true, remise: 600 });
  });

  it('applique un montant fixe', () => {
    const code = promo({ type: 'montant', valeur: 200, devise: 'EUR' });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT)).toEqual({ ok: true, remise: 200 });
  });

  it('PLAFONNE la remise au sous-total', () => {
    // Une remise de 10 € sur un panier de 4,99 € donnerait un total négatif,
    // c'est-à-dire un remboursement offert par un code de réduction.
    const code = promo({ type: 'montant', valeur: 1000, devise: 'EUR' });

    expect(calculerRemise(code, 499, 'EUR', MAINTENANT)).toEqual({ ok: true, remise: 499 });
  });

  it('refuse un montant libellé dans une autre devise', () => {
    // L'appliquer reviendrait à convertir sans taux : 5 sur un panier en FCFA
    // retirerait cinq francs là où le code promettait cinq euros.
    const code = promo({ type: 'montant', valeur: 500, devise: 'EUR' });

    expect(calculerRemise(code, 3000, 'XAF', MAINTENANT)).toEqual({
      ok: false,
      raison: 'devise_incompatible',
    });
  });

  it('refuse un code expiré, à la seconde près', () => {
    const code = promo({ expireLe: MAINTENANT });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT)).toEqual({ ok: false, raison: 'expire' });
  });

  it('accepte un code qui expire une seconde plus tard', () => {
    const code = promo({ expireLe: new Date(MAINTENANT.getTime() + 1000) });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT).ok).toBe(true);
  });

  it('refuse un code désactivé', () => {
    expect(calculerRemise(promo({ actif: false }), 1000, 'EUR', MAINTENANT)).toEqual({
      ok: false,
      raison: 'inactif',
    });
  });

  it('refuse un code épuisé', () => {
    const code = promo({ usageMax: 10, usageCount: 10 });

    expect(calculerRemise(code, 1000, 'EUR', MAINTENANT)).toEqual({ ok: false, raison: 'epuise' });
  });

  it('refuse un code inconnu', () => {
    expect(calculerRemise(null, 1000, 'EUR', MAINTENANT)).toEqual({ ok: false, raison: 'inconnu' });
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
      promo: promo({ type: 'montant', valeur: 100, devise: 'EUR' }),
      maintenant: MAINTENANT,
    });

    expect(calcul.ok && calcul.total.sousTotal).toBe(499);
    expect(calcul.ok && calcul.total.remise).toBe(100);
    expect(calcul.ok && calcul.total.total).toBe(399);
  });
});
