import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { OffresV3 } from '@/components/v2/offres-v3';
import { lirePageEditoriale } from '@/content/editorial';
import { traduire } from '@/i18n';
import type { Offre, ReponseOffres } from '@/domain/api/contract';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LES OFFRES — L'ÉCRAN ORGANIC.                                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Les mesures se vérifient dans un navigateur, contre le prototype. Ce fichier
 * défend ce qu'un remaniement casserait sans bruit : aucun montant écrit dans
 * le code, la phrase du téléchargement LUE et non recopiée, la variante de
 * lancement, la garde sur l'adhésion sans prix, et le domaine dans l'adresse
 * du tunnel.
 */

function offre(partiel: Partial<Offre> & { code: string }): Offre {
  return {
    domaine: 'lecture',
    montant: 799,
    devise: 'EUR',
    affichage: '7,99 €',
    periode: 'mois',
    libelle: 'Abonnement mensuel',
    descriptif: null,
    ...partiel,
  };
}

/** Une réponse d'offres de démonstration — tout est faux sauf la FORME. */
function reponse(ajustements: Partial<ReponseOffres> = {}): ReponseOffres {
  return {
    zone: 'international',
    devise: 'EUR',
    abonnement: {
      ouvert: true,
      jours_essai: 0,
      offres: [
        offre({ code: 'lecture-mensuel' }),
        offre({ code: 'lecture-annuel', affichage: '69,00 €', periode: 'an' }),
      ],
      donne_telechargement: false,
    },
    association: {
      offres: [
        offre({
          code: 'association-mensuel',
          domaine: 'association',
          affichage: '4,00 €',
          periode: 'mois',
        }),
      ],
      donne_telechargement: false,
    },
    achat_unite: {
      a_partir_de: 499,
      devise: 'EUR',
      affichage: '4,99 €',
      donne_telechargement: true,
    },
    ...ajustements,
  };
}

/** Les cartes, dans l'ordre où l'écran les rend. */
function cartes(conteneur: HTMLElement): HTMLElement[] {
  return [...conteneur.querySelectorAll('[class*="_formule_"]')] as HTMLElement[];
}

describe('le bandeau', () => {
  it('porte le sur-titre, le titre et le chapeau', () => {
    render(<OffresV3 langue="fr" offres={reponse()} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      traduire('fr', 'offres.titrePage'),
    );
    expect(screen.getByText(traduire('fr', 'offres.introPage'))).toBeTruthy();
  });
});

describe('les trois formules', () => {
  it('rend trois cartes quand l’adhésion est tarifée', () => {
    const { container } = render(<OffresV3 langue="fr" offres={reponse()} />);
    expect(cartes(container)).toHaveLength(3);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ L'ADHÉSION N'EST AFFICHÉE QUE SI UNE OFFRE EXISTE.                   │
   * │                                                                      │
   * │ `offres_publiques` ne rend que les formules actives QUI ONT UN PRIX  │
   * │ dans la zone demandée. Une carte « Adhérer » posée sans cette garde  │
   * │ mènerait, les jours où l'éditeur n'a encore rien tarifé, à un tunnel │
   * │ qui refuse — l'exacte impasse que le bouton de l'abonnement a déjà   │
   * │ eue une fois.                                                        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la carte d’adhésion disparaît quand aucune formule n’est tarifée', () => {
    const sans = reponse();
    sans.association.offres = [];

    const { container } = render(<OffresV3 langue="fr" offres={sans} />);

    expect(cartes(container)).toHaveLength(2);
    expect(
      screen.queryByRole('link', { name: traduire('fr', 'offres.associationAdherer') }),
    ).toBe(null);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ AUCUN MONTANT N'EST ÉCRIT DANS LE CODE.                              │
   * │                                                                      │
   * │ Les trois prix affichés sont exactement les trois `affichage` de la  │
   * │ réponse, déjà mis en forme par le serveur avec leur monnaie et leur  │
   * │ zone. Un montant recopié ici serait une seconde grille tarifaire :   │
   * │ celle que le client lit avant de payer l'autre.                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('les trois prix sont ceux du serveur, affichés tels quels', () => {
    const { container } = render(<OffresV3 langue="fr" offres={reponse()} />);
    const [achat, lecture, adhesion] = cartes(container);

    expect(within(achat as HTMLElement).getByText(/4,99 €/)).toBeTruthy();
    expect(within(lecture as HTMLElement).getByText(/7,99 €/)).toBeTruthy();
    expect(within(adhesion as HTMLElement).getByText(/4,00 €/)).toBeTruthy();
  });

  it('la seconde périodicité de l’abonnement devient la note du prix', () => {
    const { container } = render(<OffresV3 langue="fr" offres={reponse()} />);
    const lecture = cartes(container)[1] as HTMLElement;

    expect(within(lecture).getByText(/69,00 €/)).toBeTruthy();
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA PHRASE DU TÉLÉCHARGEMENT EST LUE, JAMAIS ÉCRITE.                  │
   * │                                                                      │
   * │ `donne_telechargement` est rendu explicitement par l'API — toujours   │
   * │ `false` pour l'abonnement, toujours `true` pour l'achat. L'écran      │
   * │ pourrait écrire les deux phrases en dur ; il ne le fait pas, pour que │
   * │ la page ne dépende pas de la mémoire de qui l'édite.                  │
   * │                                                                      │
   * │ Le test renverse les deux valeurs : si l'écran les avait recopiées,   │
   * │ il afficherait la même chose dans les deux sens.                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la limite de l’abonnement suit `donne_telechargement`', () => {
    const nominal = render(<OffresV3 langue="fr" offres={reponse()} />);
    expect(
      nominal.container.textContent?.includes(traduire('fr', 'offres.abonnementLimite')),
    ).toBe(true);
    nominal.unmount();

    // Le jour improbable où l'abonnement ouvrirait le téléchargement, la
    // page ne doit pas continuer à affirmer le contraire.
    const renverse = reponse();
    (renverse.abonnement as { donne_telechargement: boolean }).donne_telechargement = true;

    const { container } = render(<OffresV3 langue="fr" offres={renverse} />);
    expect(container.textContent?.includes(traduire('fr', 'offres.abonnementLimite'))).toBe(
      false,
    );
  });

  it('la promesse du fichier suit `donne_telechargement` de l’achat', () => {
    const sans = reponse();
    (sans.achat_unite as { donne_telechargement: boolean }).donne_telechargement = false;

    const { container } = render(<OffresV3 langue="fr" offres={sans} />);

    expect(container.textContent?.includes(traduire('fr', 'offres.achatDonne1'))).toBe(false);
  });
});

describe('les boutons', () => {
  /**
   * Le domaine est DANS l'adresse : les deux abonnements sont étanches, et se
   * tromper de domaine vendrait le catalogue à qui voulait adhérer.
   */
  it('l’adhésion mène au tunnel avec son domaine, l’abonnement sans', () => {
    render(<OffresV3 langue="fr" offres={reponse()} />);

    expect(
      screen
        .getByRole('link', { name: traduire('fr', 'offres.associationAdherer') })
        .getAttribute('href'),
    ).toBe('/fr/abonnement/souscrire?domaine=association');

    expect(
      screen
        .getByRole('link', { name: traduire('fr', 'offres.abonnementSouscrire') })
        .getAttribute('href'),
    ).toBe('/fr/abonnement/souscrire');
  });

  it('l’achat mène au catalogue, dans la langue servie', () => {
    render(<OffresV3 langue="en" offres={reponse()} />);

    expect(
      screen
        .getByRole('link', { name: traduire('en', 'offres.achatParcourir') })
        .getAttribute('href'),
    ).toBe('/en/catalogue');
  });

  it('l’essai gratuit est annoncé avec son nombre de jours', () => {
    const avecEssai = reponse();
    avecEssai.abonnement.jours_essai = 7;

    render(<OffresV3 langue="fr" offres={avecEssai} />);

    expect(
      screen.getByRole('link', {
        name: traduire('fr', 'offres.abonnementCommencerEssai').replace('{jours}', '7'),
      }),
    ).toBeTruthy();
  });
});

describe('la variante de lancement', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ L'INTERRUPTEUR EST COMMERCIAL, ET IL EST LU.                         │
   * │                                                                      │
   * │ `business_settings.abonnement_ouvert` ferme la formule tant que le    │
   * │ catalogue ne la justifie pas (§3.3). L'écran ne compte pas les titres │
   * │ pour en déduire quoi que ce soit : il lit le booléen.                 │
   * │                                                                      │
   * │ Fermée, la carte ne doit porter NI prix NI bouton — un bouton qui     │
   * │ mène à un tunnel qui refuse est pire que pas de bouton du tout.       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('l’abonnement fermé n’affiche ni prix ni bouton', () => {
    const ferme = reponse();
    ferme.abonnement.ouvert = false;

    const { container } = render(<OffresV3 langue="fr" offres={ferme} />);
    const lecture = cartes(container)[1] as HTMLElement;

    expect(within(lecture).getByText(traduire('fr', 'offres.abonnementFermeTitre'))).toBeTruthy();
    expect(within(lecture).getByText(traduire('fr', 'offres.abonnementFermeCorps'))).toBeTruthy();
    expect(within(lecture).queryByRole('link')).toBe(null);
    expect(lecture.textContent).not.toContain('7,99');
  });

  it('les deux autres cartes restent entières', () => {
    const ferme = reponse();
    ferme.abonnement.ouvert = false;

    const { container } = render(<OffresV3 langue="fr" offres={ferme} />);

    expect(cartes(container)).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: traduire('fr', 'offres.achatParcourir') }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: traduire('fr', 'offres.associationAdherer') }),
    ).toBeTruthy();
  });
});

describe('les questions fréquentes', () => {
  /**
   * Elles viennent de la page éditoriale, et non d'une seconde liste écrite
   * pour cet écran : deux listes divergeraient à la première correction, et
   * c'est celle de l'écran de vente qui aurait l'air d'avoir raison.
   */
  it('reprennent la page éditoriale, question pour question', () => {
    const page = lirePageEditoriale('fr', 'questions-frequentes');
    render(<OffresV3 langue="fr" offres={reponse()} />);

    expect(page).not.toBe(null);
    for (const section of page?.sections ?? []) {
      expect(screen.getByText(section.titre)).toBeTruthy();
    }
  });

  it('et mènent à la page complète', () => {
    render(<OffresV3 langue="fr" offres={reponse()} />);

    expect(
      screen
        .getByRole('link', { name: traduire('fr', 'offres.questionsToutes') })
        .getAttribute('href'),
    ).toBe('/fr/questions-frequentes');
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA RÈGLE DU DÉLAI DE NOUVEAUTÉ A ÉTÉ RETIRÉE — ET LA FAQ LE DISAIT    │
   * │ ENCORE.                                                              │
   * │                                                                      │
   * │ La migration `0064` a supprimé `fenetre_nouveaute_jours`,             │
   * │ `abonnement_a_partir_du` et `fenetre_de_vente_ecoulee` le 2 septembre │
   * │ 2026. La réponse « les nouveautés sont d'abord vendues seules pendant │
   * │ quelques mois » promettait donc une date d'entrée qui n'existe plus   │
   * │ sur aucune fiche.                                                     │
   * │                                                                      │
   * │ Ce test tient la correction : il échoue si la règle revient dans le   │
   * │ texte, dans l'une ou l'autre langue.                                  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('aucune réponse ne ressuscite le délai de nouveauté', () => {
    for (const langue of ['fr', 'en'] as const) {
      const page = lirePageEditoriale(langue, 'questions-frequentes');
      const texte = (page?.sections ?? [])
        .flatMap((section) => [section.titre, ...(section.paragraphes ?? [])])
        .join(' ');

      expect(texte).not.toMatch(/vendues seules|sold on their own/i);
      expect(texte).not.toMatch(/rejoignent l’abonnement|join the subscription/i);
    }
  });
});
