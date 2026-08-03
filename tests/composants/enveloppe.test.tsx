import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Entete, MenuCompte, PiedDePage, SelecteurLangue } from '@/components/enveloppe';
import type { Utilisateur } from '@/domain/api/contract';

/**
 * ENVELOPPE APPLICATIVE.
 */
const ADMIN: Utilisateur = {
  id: 'a',
  email: 'editeur@exemple.test',
  role: 'admin',
  langue_preferee: 'fr',
};

const LECTEUR: Utilisateur = { ...ADMIN, role: 'user', email: 'parent@exemple.test' };

describe('sélecteur de langue', () => {
  it('CONSERVE la page courante — c’est tout son intérêt', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Renvoyer à l'accueil est le défaut le plus répandu des sélecteurs   │
    // │ de langue. Un lecteur qui a filtré le catalogue par région et par   │
    // │ âge perd tout pour avoir voulu lire en anglais — il ne recommence   │
    // │ pas, il repart en français ou il part.                              │
    // └────────────────────────────────────────────────────────────────────┘
    render(<SelecteurLangue langue="fr" chemin="/fr/contes/anansi-l-araignee" />);

    expect(screen.getByRole('link', { name: 'English' }).getAttribute('href')).toBe(
      '/en/contes/anansi-l-araignee',
    );
  });

  it('conserve aussi les FILTRES', () => {
    render(
      <SelecteurLangue
        langue="fr"
        chemin="/fr/catalogue"
        requete="?region=sahel&age_min=6&page=3"
      />,
    );

    expect(screen.getByRole('link', { name: 'English' }).getAttribute('href')).toBe(
      '/en/catalogue?region=sahel&age_min=6&page=3',
    );
  });

  it('ne change QUE le premier segment', () => {
    // Un remplacement naïf de « fr » dans toute la chaîne casserait un slug
    // qui contiendrait ces deux lettres — « fr » apparaît dans « afrique ».
    render(<SelecteurLangue langue="fr" chemin="/fr/contes/le-fruit-defendu" />);

    expect(screen.getByRole('link', { name: 'English' }).getAttribute('href')).toBe(
      '/en/contes/le-fruit-defendu',
    );
  });

  it('la langue courante n’est PAS un lien', () => {
    // Cliquer sur « Français » quand on y est déjà ne mène nulle part, et un
    // lecteur d'écran annoncerait un choix qui n'en est pas un.
    render(<SelecteurLangue langue="fr" chemin="/fr/catalogue" />);

    expect(screen.queryByRole('link', { name: 'Français' })).toBeNull();
    expect(screen.getByText('Français').getAttribute('aria-current')).toBe('true');
  });

  it('porte `hreflang` et `lang` sur le lien sortant', () => {
    // Ils disent au navigateur ET aux moteurs quelle langue attend au bout —
    // §5.4.
    render(<SelecteurLangue langue="fr" chemin="/fr" />);

    const lien = screen.getByRole('link', { name: 'English' });
    expect(lien.getAttribute('hreflang')).toBe('en');
    expect(lien.getAttribute('lang')).toBe('en');
  });

  it('fonctionne dans l’autre sens — le contre-test', () => {
    // Sans lui, un sélecteur qui renverrait toujours vers `/en` passerait
    // tous les tests ci-dessus.
    render(<SelecteurLangue langue="en" chemin="/en/catalogue" />);

    expect(screen.getByRole('link', { name: 'Français' }).getAttribute('href')).toBe(
      '/fr/catalogue',
    );
  });
});

describe('état de connexion', () => {
  it('un visiteur se voit proposer la connexion', () => {
    render(<MenuCompte langue="fr" utilisateur={null} />);
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Mon compte' })).toBeNull();
  });

  it('un compte connecté voit son espace, jamais l’invite de connexion', () => {
    render(<MenuCompte langue="fr" utilisateur={LECTEUR} />);
    expect(screen.getByRole('link', { name: 'Mon compte' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Se connecter' })).toBeNull();
  });

  it('l’administration n’apparaît QUE pour un administrateur', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ CE LIEN N'EST PAS UNE PROTECTION, et ne doit pas être pris pour     │
    // │ telle : les routes d'administration relisent le rôle EN BASE à      │
    // │ chaque requête. Le cacher évite seulement de proposer une porte     │
    // │ qui se refermera au nez de qui la pousse.                           │
    // └────────────────────────────────────────────────────────────────────┘
    render(<MenuCompte langue="fr" utilisateur={LECTEUR} />);
    expect(screen.queryByRole('link', { name: 'Administration' })).toBeNull();
  });

  it('et elle apparaît bien pour lui — le contre-test', () => {
    render(<MenuCompte langue="fr" utilisateur={ADMIN} />);
    expect(screen.getByRole('link', { name: 'Administration' })).toBeDefined();
  });
});

describe('en-tête', () => {
  it('offre un lien d’évitement vers le contenu', () => {
    // Premier élément focalisable : un utilisateur au clavier atteint le
    // contenu sans traverser toute la navigation à chaque page. Critère AA.
    render(<Entete langue="fr" utilisateur={null} chemin="/fr" />);

    const evitement = screen.getByRole('link', { name: 'Aller au contenu' });
    expect(evitement.getAttribute('href')).toBe('#contenu');
  });

  it('nomme sa navigation principale', () => {
    // Une page peut porter plusieurs `<nav>` — principale, pied de page,
    // pagination. Sans nom, un lecteur d'écran les annonce toutes « navigation ».
    render(<Entete langue="fr" utilisateur={null} chemin="/fr" />);
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeDefined();
  });

  it('préfixe TOUS ses liens par la langue', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Un seul lien non préfixé renverrait au middleware, qui redirigerait │
    // │ — un aller-retour de plus sur une connexion lente, et une langue     │
    // │ potentiellement différente de celle qu'on lisait.                   │
    // └────────────────────────────────────────────────────────────────────┘
    const { container } = render(<Entete langue="en" utilisateur={LECTEUR} chemin="/en" />);

    const liens = [...container.querySelectorAll('a[href^="/"]')].map((a) =>
      a.getAttribute('href'),
    );

    expect(liens.length).toBeGreaterThanOrEqual(5);
    for (const lien of liens) {
      expect(lien, `lien non préfixé : ${String(lien)}`).toMatch(/^\/(fr|en)(\/|$)/);
    }
  });
});

describe('pied de page', () => {
  it('mène aux cinq pages éditoriales, préfixées', () => {
    render(<PiedDePage langue="fr" chemin="/fr" />);

    const navigation = screen.getByRole('navigation', { name: 'Liens utiles' });
    const liens = [...navigation.querySelectorAll('a')].map((a) => a.getAttribute('href'));

    expect(liens).toEqual([
      '/fr/a-propos',
      '/fr/questions-frequentes',
      '/fr/conditions-generales',
      '/fr/confidentialite',
      '/fr/contact',
    ]);
  });

  it('porte le sélecteur de langue en toutes lettres', () => {
    // Abrégé dans l'en-tête, où la place manque ; en toutes lettres ici, où
    // il est le plus susceptible d'être cherché.
    render(<PiedDePage langue="fr" chemin="/fr/catalogue" />);
    expect(screen.getByRole('link', { name: 'English' })).toBeDefined();
  });
});
