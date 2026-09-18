import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { GabaritAdmin } from '@/components/admin';
import type { Appelant } from '@/lib/auth/session';

/**
 * LE GABARIT D'ADMINISTRATION — rail groupé, barre supérieure, pied d'identité.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CES TESTS DÉFENDENT, ET QUI NE SE VOIT PAS À LA RELECTURE.       │
 * │                                                                          │
 * │ Le rail a cessé d'être une liste plate le 18 septembre 2026 : ses onze   │
 * │ entrées sont désormais réparties en quatre groupes. Une entrée qu'un     │
 * │ remaniement ferait tomber d'un groupe sans la reposer dans un autre      │
 * │ DISPARAÎTRAIT du rail — l'écran resterait joignable par son adresse, et  │
 * │ rien, nulle part, ne signalerait la perte.                               │
 * │                                                                          │
 * │ D'où le contrôle d'EFFECTIF : onze entrées, quels que soient les groupes.│
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** La Server Action de déconnexion n'a rien à faire dans un rendu jsdom. */
vi.mock('@/app/[langue]/admin/actions', () => ({
  deconnecter: vi.fn(),
}));

const ADMIN: Appelant = {
  id: '1a37719c-30b3-49ee-afa6-842a20798a67',
  email: 'admin@editionmapoukam.test',
  role: 'admin',
  langue_preferee: 'fr',
  statut: 'actif',
  nom_complet: 'Royce Brayan',
  accessToken: 'jeton-de-test',
};

function rendreGabarit(supplement: Record<string, unknown> = {}) {
  return render(
    <GabaritAdmin
      langue="fr"
      administrateur={ADMIN}
      section="/contes"
      titre="Contes"
      sousTitre="Le catalogue."
      {...supplement}
    >
      <p>contenu</p>
    </GabaritAdmin>,
  );
}

describe('le rail range ses onze entrées en quatre groupes', () => {
  it('rend les trois intertitres, dans l’ordre du prototype', () => {
    rendreGabarit();
    const rail = screen.getByRole('navigation', { name: 'Administration' });

    const intertitres = within(rail)
      .getAllByText(/^(Catalogue|Ventes|Communauté)$/)
      .map((n) => n.textContent);

    expect(intertitres).toEqual(['Catalogue', 'Ventes', 'Communauté']);
  });

  it('ne perd AUCUNE des onze entrées en les répartissant', () => {
    rendreGabarit();
    const rail = screen.getByRole('navigation', { name: 'Administration' });

    /*
     * Le compte, et non la liste des libellés : un test qui énumère les noms
     * se réécrit à chaque renommage et cesse alors de défendre quoi que ce
     * soit. Ce qui compte est qu'aucune entrée ne tombe entre deux groupes.
     */
    const entrees = within(rail)
      .getAllByRole('link')
      .filter((a) => (a.getAttribute('href') ?? '').includes('/admin'));

    // Onze sections, plus le nom de marque qui mène à l'accueil du back-office.
    expect(entrees).toHaveLength(12);
  });

  it('marque l’onglet courant, et lui seul', () => {
    rendreGabarit();
    const rail = screen.getByRole('navigation', { name: 'Administration' });

    const courants = within(rail)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');

    expect(courants).toHaveLength(1);
    expect(courants[0]?.textContent).toBe('Contes');
  });
});

describe('le pied du rail dit sous quel compte on agit', () => {
  it('porte le nom, le rôle, et un BOUTON de déconnexion', () => {
    rendreGabarit();

    expect(screen.getByText('Royce Brayan')).toBeTruthy();
    expect(screen.getByText('Éditeur')).toBeTruthy();

    /*
     * Un bouton, jamais un lien : une déconnexion change l'état du serveur, et
     * un `<a>` se déclenche au pré-chargement d'un navigateur ou à l'aperçu
     * d'un lien. Le test vise donc le RÔLE, qui est ce qui porte la garantie.
     */
    expect(screen.getByRole('button', { name: 'Sortir' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sortir' })).toBeNull();
  });

  it('remplace un nom vide plutôt que d’afficher une pastille muette', () => {
    rendreGabarit({ administrateur: { ...ADMIN, nom_complet: null } });

    // `nomUtilisateurEffectif` fabrique « user#### » depuis l'identifiant.
    expect(screen.getByText(/^user\d+$/)).toBeTruthy();
  });
});

describe('la barre supérieure', () => {
  it('compose son fil d’Ariane à partir du titre de l’écran', () => {
    rendreGabarit();
    expect(screen.getByText('Administration · Contes')).toBeTruthy();
  });

  it('porte l’action principale, et l’en-tête porte les actions de traverse', () => {
    rendreGabarit({
      actions: <button type="button">Ajouter un conte</button>,
      enteteActions: <a href="/fr/admin/livrets/nouveau">Ajouter un livret</a>,
    });

    const principal = screen.getByRole('button', { name: 'Ajouter un conte' });
    const traverse = screen.getByRole('link', { name: 'Ajouter un livret' });

    /*
     * La distinction n'est pas décorative : la barre est COLLANTE, l'en-tête
     * ne l'est pas. Une action principale posée à côté du titre défile hors de
     * vue au premier écran de tableau — c'est le défaut que le prototype
     * corrige, et le seul moyen de le figer est de vérifier l'ancêtre.
     */
    expect(principal.closest('[class*="barreSuperieure"]')).not.toBeNull();
    expect(traverse.closest('[class*="barreSuperieure"]')).toBeNull();
    expect(traverse.closest('[class*="entete"]')).not.toBeNull();
  });
});
