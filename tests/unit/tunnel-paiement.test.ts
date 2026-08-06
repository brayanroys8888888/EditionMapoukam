import { describe, expect, it } from 'vitest';

import fr from '@/i18n/fr.json';
import en from '@/i18n/en.json';
import { traduire } from '@/i18n';
import {
  MOYENS_PAIEMENT,
  estMoyenPaiement,
  exigeTelephone,
  paysDeLOperateur,
  paysMobileMoney,
  telephonePlausible,
} from '@/domain/payments/moyens';
import { champsEnDefaut, verifierCoordonnees } from '@/lib/tunnel/coordonnees';
import { zonePourPays } from '@/domain/orders/zones';

/**
 * LE TUNNEL DE PAIEMENT — moyens, pays et coordonnées.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES TESTS PROTÈGENT, ET QUI N'EST PAS ÉVIDENT.                   │
 * │                                                                          │
 * │ Un écran de paiement se démontre en cliquant, et tout y paraît marcher   │
 * │ tant qu'on remplit les champs correctement. Les défauts de cette         │
 * │ famille ne se voient qu'au formulaire soumis DE TRAVERS — un pays que le │
 * │ menu ne proposait pas, un moyen inventé, une case décochée qui           │
 * │ n'envoie rien.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Un formulaire, tel que le navigateur l'enverrait. */
function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [nom, valeur] of Object.entries(champs)) donnees.set(nom, valeur);
  return donnees;
}

const VALIDE = {
  orange: {
    moyen: 'orange_money',
    nom: 'Awa Diallo',
    email: 'awa@exemple.test',
    pays: 'CM',
    telephone: '+237 6 55 12 34 56',
  },
  carte: {
    moyen: 'carte',
    nom: 'Awa Diallo',
    email: 'awa@exemple.test',
  },
};

describe('les moyens de paiement', () => {
  it('reconnaît les trois moyens, et rien d’autre', () => {
    for (const moyen of MOYENS_PAIEMENT) expect(estMoyenPaiement(moyen)).toBe(true);

    // Ce qui arrive par l'URL n'est jamais de confiance : `?moyen=` est écrit
    // par qui veut, et un moyen inconnu doit ramener au CHOIX du moyen, pas
    // rendre un formulaire aux champs indéterminés.
    for (const brut of ['paypal', '', 'ORANGE_MONEY', null, undefined, 42, {}]) {
      expect(estMoyenPaiement(brut)).toBe(false);
    }
  });

  it('le TÉLÉPHONE se décide sur un prédicat, jamais sur le nom d’un opérateur', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ C'est ce qui permet d'ajouter un troisième opérateur de Mobile      │
    // │ Money sans toucher un seul écran. Une comparaison à                 │
    // │ `moyen === 'orange_money'` écrite dans une page aurait dû être      │
    // │ retrouvée dans les deux tunnels, et l'un des deux aurait été oublié.│
    // └────────────────────────────────────────────────────────────────────┘
    expect(exigeTelephone('orange_money')).toBe(true);
    expect(exigeTelephone('mtn_momo')).toBe(true);
    expect(exigeTelephone('carte')).toBe(false);
  });

  it('la CARTE n’est liée à aucun pays — c’est le prestataire qui le lira', () => {
    expect(paysDeLOperateur('carte')).toEqual([]);
  });

  it('chaque pays d’opérateur est bien en zone AFRIQUE', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉFAUT QUE CE TEST ATTRAPE.                                     │
    // │                                                                    │
    // │ Proposer Orange Money dans un pays absent de la grille Afrique      │
    // │ offrirait un moyen de paiement local sur des prix internationaux —  │
    // │ et surtout, sur un titre dont la publication n'exige un prix que    │
    // │ dans les zones actives, il n'y aurait peut-être aucun prix du tout. │
    // │                                                                    │
    // │ Les deux listes vivent dans deux modules, et rien ne les compare    │
    // │ hors d'ici.                                                        │
    // └────────────────────────────────────────────────────────────────────┘
    const horsZone = paysMobileMoney().filter((code) => zonePourPays(code) !== 'afrique');

    expect(horsZone).toEqual([]);
  });

  it('les deux dictionnaires nomment CHAQUE pays offert', () => {
    // Un code sans traduction s'afficherait tel quel — « CM » dans un menu
    // déroulant — et personne ne le verrait sur un poste francophone, puisque
    // le repli rend le français.
    const sansNom: string[] = [];

    for (const code of paysMobileMoney()) {
      for (const [langue, dictionnaire] of [
        ['fr', fr],
        ['en', en],
      ] as const) {
        const nom = (dictionnaire.pays as Record<string, string>)[code];
        if (!nom || nom === code) sansNom.push(`${langue} : ${code}`);
      }
    }

    expect(sansNom).toEqual([]);
    // Garde d'effectif : une liste vide de pays rendrait ce test muet.
    expect(paysMobileMoney().length).toBeGreaterThanOrEqual(6);
  });

  it('les deux dictionnaires nomment chaque moyen, et sa note', () => {
    for (const moyen of MOYENS_PAIEMENT) {
      for (const langue of ['fr', 'en'] as const) {
        expect(traduire(langue, `moyens.${moyen}`).length).toBeGreaterThan(2);
        expect(traduire(langue, `moyens.${moyen}Note`).length).toBeGreaterThan(10);
      }
    }
  });
});

describe('un numéro de téléphone plausible', () => {
  it('accepte les formes réellement saisies', () => {
    for (const numero of [
      '+237655123456',
      '+237 6 55 12 34 56',
      '655123456',
      '06.55.12.34.56',
      '(237) 655-123-456',
    ]) {
      expect(telephonePlausible(numero), numero).toBe(true);
    }
  });

  it('refuse ce qui n’est manifestement pas un numéro', () => {
    for (const numero of ['', 'pas un numéro', '12345', 'awa@exemple.test', '+']) {
      expect(telephonePlausible(numero), numero).toBe(false);
    }
  });

  it('reste PERMISSIF — seul l’opérateur sait si un numéro existe', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Les plans de numérotation changent : le Cameroun est passé de huit  │
    // │ à neuf chiffres en 2014, et une expression trop stricte aurait      │
    // │ alors rejeté des numéros parfaitement valides. Ce contrôle          │
    // │ n'attrape que la faute de frappe manifeste.                         │
    // └────────────────────────────────────────────────────────────────────┘
    expect(telephonePlausible('12345678')).toBe(true);
    expect(telephonePlausible('123456789012345')).toBe(true);
  });
});

describe('les coordonnées de règlement', () => {
  it('acceptent un formulaire complet, Mobile Money comme carte', () => {
    expect(verifierCoordonnees(formulaire(VALIDE.orange))).toEqual([]);
    expect(verifierCoordonnees(formulaire(VALIDE.carte))).toEqual([]);
  });

  it('refusent TOUT quand le moyen est inconnu', () => {
    // Le moyen décide des champs exigés : sans lui, la validation ne sait pas
    // ce qu'elle contrôle. Un seul défaut est rendu, et il nomme la cause.
    expect(verifierCoordonnees(formulaire({ ...VALIDE.orange, moyen: 'paypal' }))).toEqual([
      'moyen',
    ]);
    expect(verifierCoordonnees(new FormData())).toEqual(['moyen']);
  });

  it('n’exigent NI pays NI téléphone pour une carte', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ L'écran de la carte n'affiche pas ces deux champs. Les exiger       │
    // │ quand même aurait rendu tout règlement par carte impossible, sur    │
    // │ des champs invisibles — le pire des refus, celui qu'on ne peut pas  │
    // │ corriger.                                                          │
    // └────────────────────────────────────────────────────────────────────┘
    expect(verifierCoordonnees(formulaire({ moyen: 'carte', nom: 'Awa', email: 'a@b.test' })))
      .toEqual([]);
  });

  it('refusent un pays où l’OPÉRATEUR CHOISI n’est pas présent', () => {
    // Le menu déroulant est déjà filtré par opérateur ; un formulaire soumis à
    // la main ne doit pas pouvoir demander « Orange Money au Rwanda ».
    expect(paysDeLOperateur('orange_money')).not.toContain('RW');
    expect(paysDeLOperateur('mtn_momo')).toContain('RW');

    expect(verifierCoordonnees(formulaire({ ...VALIDE.orange, pays: 'RW' }))).toEqual(['pays']);
    expect(
      verifierCoordonnees(formulaire({ ...VALIDE.orange, moyen: 'mtn_momo', pays: 'RW' })),
    ).toEqual([]);
  });

  it('refusent un pays inventé', () => {
    expect(verifierCoordonnees(formulaire({ ...VALIDE.orange, pays: 'ZZ' }))).toEqual(['pays']);
    expect(verifierCoordonnees(formulaire({ ...VALIDE.orange, pays: '' }))).toEqual(['pays']);
  });

  it('nomment CHAQUE champ en défaut, et non le premier', () => {
    // Un formulaire qui signale une faute à la fois se remplit en autant
    // d'allers-retours qu'il a de champs — sur la connexion lente de §5.1,
    // c'est ce qui fait abandonner un paiement.
    const defauts = verifierCoordonnees(
      formulaire({ moyen: 'orange_money', nom: 'A', email: 'pas-une-adresse', pays: '', telephone: 'x' }),
    );

    expect(defauts).toEqual(['nom', 'email', 'pays', 'telephone']);
  });

  it('refusent une adresse email sans arobase ni domaine', () => {
    for (const email of ['', 'awa', 'awa@', '@exemple.test', 'awa@exemple']) {
      expect(
        verifierCoordonnees(formulaire({ ...VALIDE.orange, email })),
        email,
      ).toContain('email');
    }
  });

  it('les deux dictionnaires portent un message pour chaque champ en défaut', () => {
    // Un champ signalé sans message est une bordure rouge muette — le critère
    // 1.4.1 de WCAG interdit précisément de ne compter que sur la couleur.
    for (const champ of ['moyen', 'nom', 'email', 'pays', 'telephone']) {
      for (const langue of ['fr', 'en'] as const) {
        const message = traduire(langue, `coordonnees.erreur_${champ}` as never);
        expect(message, `${langue}.${champ}`).not.toBe(`coordonnees.erreur_${champ}`);
        expect(message.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('les champs en défaut voyagent par l’URL', () => {
  it('relit ce que l’action a écrit', () => {
    expect(champsEnDefaut('nom,email')).toEqual(['nom', 'email']);
  });

  it('IGNORE ce qui n’est pas un champ connu', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ `?champs=` est écrit par qui veut. Sans ce filtre, une valeur       │
    // │ arbitraire traverserait jusqu'à une clé de traduction fabriquée par │
    // │ concaténation — et de là jusqu'au texte affiché.                    │
    // └────────────────────────────────────────────────────────────────────┘
    expect(champsEnDefaut('nom,motdepasse,<script>')).toEqual(['nom']);
    expect(champsEnDefaut('')).toEqual([]);
    expect(champsEnDefaut(undefined)).toEqual([]);
  });
});
