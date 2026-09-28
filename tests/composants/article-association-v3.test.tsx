import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ArticleAssociationV3 } from '@/components/v2/article-association-v3';
import type { ContenuAssociatifDetaille } from '@/lib/association/service';

/**
 * L'ARTICLE DE L'ESPACE ADHÉRENT — ce que la refonte ne doit jamais perdre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL DÉFAUT COMPTE ICI, ET IL EST SILENCIEUX.                        │
 * │                                                                          │
 * │ Si le corps d'un contenu réservé se rendait à un visiteur, l'écran       │
 * │ n'aurait l'air de rien : il montrerait un article, ce qui est            │
 * │ exactement ce qu'on attend d'une page d'article. Personne ne le          │
 * │ signalerait — surtout pas le lecteur qui en profite.                     │
 * │                                                                          │
 * │ La garde réelle est en base : `corps` n'est accordé ni à `anon` ni à     │
 * │ `authenticated`, et `sections` vaut `null` quand `can_read` est faux.    │
 * │ Ces tests éprouvent le MAILLON D'AFFICHAGE — qu'un composant redessiné   │
 * │ ne se mette pas à rendre ce qu'on ne lui a pas donné, par exemple en     │
 * │ repliant sur une valeur par défaut.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const BASE: ContenuAssociatifDetaille = {
  slug: 'sur-le-terrain',
  titre: 'Sur le terrain avec l’Association DAVE',
  chapeau: 'Ce que trois ans de missions nous ont appris.',
  categorie: 'actions',
  acces: 'abonnes',
  publieLe: '2026-09-01T09:00:00.000Z',
  minutes: 3,
  imageUrl: null,
  peutLire: false,
  /* LU, jamais déduit : c'est la base qui dit pourquoi l'accès est fermé. */
  motif: 'none',
  sections: null,
};

const OUVERT: ContenuAssociatifDetaille = {
  ...BASE,
  peutLire: true,
  motif: 'subscription',
  sections: [
    {
      titre: 'La puissance d’un outil adapté',
      paragraphes: ['Sur le terrain, nous mesurons chaque jour la puissance du conte.'],
      points: ['Un atelier par trimestre', 'Deux écoles partenaires'],
    },
  ],
};

describe('l’article de l’espace adhérent', () => {
  it('rend le corps quand la base l’a donné', () => {
    render(<ArticleAssociationV3 langue="fr" contenu={OUVERT} aLireEnsuite={[]} />);

    expect(screen.getByText('La puissance d’un outil adapté')).toBeTruthy();
    expect(screen.getByText(/nous mesurons chaque jour/)).toBeTruthy();
    expect(screen.getByText('Deux écoles partenaires')).toBeTruthy();
  });

  it('NE REND AUCUN corps quand `sections` est nul — il rend le mur', () => {
    const { container } = render(
      <ArticleAssociationV3 langue="fr" contenu={BASE} aLireEnsuite={[]} />,
    );

    /*
     * On n'interroge pas « le mur est-il là » : on vérifie qu'AUCUN
     * paragraphe d'article n'a été rendu. Un composant qui replierait sur un
     * corps vide passerait le premier contrôle et raterait celui-ci.
     */
    expect(container.querySelectorAll('article section').length).toBe(0);
    expect(screen.queryByText(/nous mesurons chaque jour/)).toBeNull();
  });

  it('dit dans la ligne de méta que le contenu est réservé, avant de le montrer', () => {
    // « Réservé aux adhérents » se lit AVEC la date, pas après le chapeau :
    // le lecteur sait ce qu'il n'a pas avant d'avoir fini de lire l'accroche.
    render(<ArticleAssociationV3 langue="fr" contenu={BASE} aLireEnsuite={[]} />);

    expect(screen.getByText('Réservé aux adhérents')).toBeTruthy();
  });

  it('ne dit PAS « réservé » sur un contenu ouvert', () => {
    render(<ArticleAssociationV3 langue="fr" contenu={OUVERT} aLireEnsuite={[]} />);

    expect(screen.queryByText('Réservé aux adhérents')).toBeNull();
  });

  it('offre les DEUX portes du mur : adhérer, et se connecter', () => {
    /*
     * Un adhérent déjà inscrit qui tombe sur ce mur n'a pas besoin d'adhérer,
     * il a besoin de se connecter. Sans le second lien, il repartirait en
     * croyant devoir payer une seconde fois.
     */
    render(<ArticleAssociationV3 langue="fr" contenu={BASE} aLireEnsuite={[]} />);

    expect(screen.getByRole('link', { name: 'Adhérer à l’association' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'J’ai déjà un compte' })).toBeTruthy();
  });

  it('garde le lien de retour vers la liste, dans la langue de la page', () => {
    render(<ArticleAssociationV3 langue="en" contenu={OUVERT} aLireEnsuite={[]} />);

    const retour = screen.getByRole('link', { name: 'All contents' });
    expect(retour.getAttribute('href')).toBe('/en/association');
  });

  it('rend la date en UTC — une date à minuit ne recule pas d’un jour', () => {
    /*
     * `publieLe` vaut le 1ᵉʳ septembre à 09:00 UTC. Sans `timeZone: 'UTC'`,
     * un lecteur à l'ouest de Greenwich lirait « 31 août » — et la liste,
     * rendue ailleurs, afficherait l'autre date pour le même contenu.
     */
    render(<ArticleAssociationV3 langue="fr" contenu={OUVERT} aLireEnsuite={[]} />);

    expect(screen.getByText('1 septembre 2026')).toBeTruthy();
  });
});
