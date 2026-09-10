import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FicheV2 } from '@/components/v2/fiche';
import type { FicheLivre } from '@/domain/catalog/types';
import { traduire } from '@/i18n';

/**
 * LA BARRE D'ACHAT FLOTTANTE — lot 6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE EST RENDUE TOUJOURS, ET DESSINÉE PAR LE SEUL ÉCRAN ÉTROIT.         │
 * │                                                                          │
 * │ C'est la mécanique des deux chromes, reprise à l'échelle d'un écran :    │
 * │ le document porte les deux emplacements, la feuille en montre un. Un     │
 * │ test de rendu ne voit donc PAS laquelle est visible — c'est du CSS.      │
 * │                                                                          │
 * │ Ce qu'il voit, et ce qui compte, est que les deux portent LE MÊME        │
 * │ verdict de droits. Le raccourci tentant, en écrivant la barre, aurait    │
 * │ été de lui faire recalculer « achetable » : elle aurait alors proposé    │
 * │ d'acheter à un abonné, ou de lire à qui n'en a pas le droit — et le      │
 * │ défaut n'aurait paru que sur téléphone.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const LIRE = traduire('fr', 'fiche.lireEnLigne');
const AJOUTER = traduire('fr', 'fiche.ajouterAuPanier');

const BASE: FicheLivre = {
  id: 'livre-1',
  slug: 'anansi-l-araignee',
  titre: 'Anansi l’araignée',
  resume: 'Une araignée rusée.',
  auteur: 'Ama Serwaa',
  illustrateur: null,
  age_min: 6,
  age_max: 9,
  origine_culturelle: 'conte akan — Ghana',
  themes: ['ruse'],
  niveau: null,
  objectifs: [],
  type_document: 'conte',
  orientation: 'portrait',
  couverture_url: null,
  couverture: null,
  nb_pages: 24,
  langues: ['fr'],
  publie_le: '2026-01-15T00:00:00.000Z',
  inclus_abonnement: false,
  disponible_achat: true,
  gratuit: false,
  prix: { montant: 499, devise: 'EUR', zone: 'international', affichage: '4,99 €' },
  achat_hors_zone: null,
  acces: { canRead: false, canDownload: false, reason: 'preview' },
  description: null,
  suggestions: [],
  pages_extrait: 3,
  avis: null,
};

function fiche(modifications: Partial<FicheLivre> = {}): FicheLivre {
  return { ...BASE, ...modifications };
}

const ajout = (): void => {};

describe('la barre d’achat porte la MÊME décision que le bloc d’achat', () => {
  /**
   * Un visiteur qui ne détient rien : les deux emplacements proposent
   * d'acheter, et rien d'autre. Deux boutons dans le document, un seul
   * dessiné — c'est la feuille qui tranche, à 860 px.
   */
  it('propose d’acheter, deux fois, à qui ne détient rien', () => {
    render(<FicheV2 langue="fr" fiche={fiche()} actionAjout={ajout} />);
    expect(screen.getAllByRole('button', { name: AJOUTER })).toHaveLength(2);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ L'ABONNÉ EST LE CAS QUI COMPTE.                                      │
   * │                                                                      │
   * │ Il LIT sans pouvoir conserver : `canRead` vrai, `canDownload` faux.   │
   * │ C'est la règle métier centrale du produit, et la barre flottante est  │
   * │ exactement le genre de pièce écrite à part qui la retrouve à l'envers.│
   * │                                                                      │
   * │ Son action PRINCIPALE est donc de LIRE, aux deux emplacements.        │
   * │ L'achat lui reste offert — il donne le téléchargement, que            │
   * │ l'abonnement n'ouvre jamais — mais en SECOND, et dans le bloc seul :  │
   * │ la barre flottante ne porte qu'une action, et ce doit être la bonne.  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('propose de LIRE à l’abonné, aux deux places', () => {
    render(
      <FicheV2
        langue="fr"
        fiche={fiche({ acces: { canRead: true, canDownload: false, reason: 'subscription' } })}
        actionAjout={ajout}
      />,
    );

    expect(screen.getAllByRole('link', { name: LIRE })).toHaveLength(2);
  });

  /**
   * Le contre-test du précédent, et il porte la règle métier centrale : la
   * barre ne double PAS l'offre d'achat secondaire. Elle porte une action, la
   * principale. L'achat reste dans le bloc, une seule fois — sans quoi
   * l'écran d'un abonné pousserait deux fois à repayer ce qu'il lit déjà.
   */
  it('la barre ne double pas l’offre d’achat SECONDAIRE', () => {
    render(
      <FicheV2
        langue="fr"
        fiche={fiche({ acces: { canRead: true, canDownload: false, reason: 'subscription' } })}
        actionAjout={ajout}
      />,
    );

    expect(screen.getAllByRole('button', { name: AJOUTER })).toHaveLength(1);
  });

  /** L'acheteur aussi lit — et la barre le suit sans le renvoyer à la caisse. */
  it('propose de LIRE à qui a acheté', () => {
    render(
      <FicheV2
        langue="fr"
        fiche={fiche({ acces: { canRead: true, canDownload: true, reason: 'purchase' } })}
        actionAjout={ajout}
      />,
    );

    expect(screen.getAllByRole('link', { name: LIRE }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: AJOUTER })).toBeNull();
  });

  /**
   * Sans action possible — un titre ni lisible ni achetable — la barre n'est
   * PAS rendue. Une barre flottante vide occuperait 80 px du bas de l'écran
   * pour ne rien proposer, et sa réserve en volerait 80 de plus.
   */
  it('elle n’est pas rendue quand il n’y a rien à faire', () => {
    const { container } = render(
      <FicheV2
        langue="fr"
        fiche={fiche({ prix: null, disponible_achat: false })}
      />,
    );

    expect(container.textContent).toContain('Anansi');
    expect(screen.queryByRole('button', { name: AJOUTER })).toBeNull();
    expect(screen.queryByRole('link', { name: LIRE })).toBeNull();
  });

  /**
   * Le prix de la barre est celui que le SERVEUR a formaté — jamais un nombre
   * remis en forme ici. Le franc CFA n'a pas de sous-unité, et une division
   * par cent écrite dans une barre flottante multiplierait l'erreur par cent
   * sur l'écran d'achat lui-même.
   */
  it('le prix de la barre est celui du serveur, à la lettre', () => {
    render(<FicheV2 langue="fr" fiche={fiche()} actionAjout={ajout} />);
    expect(screen.getAllByText('4,99 €').length).toBeGreaterThanOrEqual(2);
  });
});
