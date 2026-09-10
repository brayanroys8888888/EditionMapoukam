import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

import { adresseSimulee, routeurSimule } from '../setup/routeur';
import { Toaster, poserToast, codeToastValide } from '@/components/toast';
import { traduire } from '@/i18n';


/**
 * LE TOAST — lot 11, effet 11, et la moitié de l'inventaire du lot 12.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE RISQUE DE CETTE PIÈCE N'EST PAS SON APPARENCE.                       │
 * │                                                                          │
 * │ Un bandeau qui apparaît en bas d'écran se vérifie d'un coup d'œil. Ce    │
 * │ qui ne se voit pas, c'est ce qu'il accepte d'AFFICHER : le message part  │
 * │ d'une Server Action et traverse une redirection, donc l'adresse. Si      │
 * │ l'adresse portait le texte, n'importe quel lien ferait dire au site ce   │
 * │ qu'il veut, avec sa police et sa couleur officielles.                    │
 * │                                                                          │
 * │ Ces tests portent d'abord là-dessus.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

beforeEach(() => {
  adresseSimulee.chemin = '/fr/catalogue';
  adresseSimulee.requete = '';
});

/** La région vivante, quelle que soit son contenu. */
function region(): HTMLElement {
  return screen.getByRole('status');
}

describe('l’adresse ne porte qu’un code, jamais un texte', () => {
  it('un code connu affiche SA phrase, tirée du dictionnaire', () => {
    adresseSimulee.requete = 'toast=connexion';
    render(<Toaster langue="fr" />);
    expect(region().textContent).toBe(traduire('fr', 'toast.connexion'));
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE CONTRE-TEST QUI COMPTE.                                           │
   * │                                                                      │
   * │ Un code absent de la liste n'affiche RIEN — pas un repli, pas le     │
   * │ code brut, pas une clé de traduction. Afficher la valeur reçue       │
   * │ serait exactement la faille : « ?toast=Votre paiement a échoué,      │
   * │ appelez ce numéro » dans le bandeau officiel du produit.             │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('un code inconnu n’affiche RIEN', () => {
    adresseSimulee.requete = 'toast=Votre%20paiement%20a%20échoué';
    render(<Toaster langue="fr" />);
    expect(region().textContent).toBe('');
  });

  it('et la validation le refuse aussi hors du rendu', () => {
    expect(codeToastValide('connexion')).toBe('connexion');
    expect(codeToastValide('n’existe pas')).toBeNull();
    expect(codeToastValide(null)).toBeNull();
    expect(codeToastValide('')).toBeNull();
  });

  /**
   * Le paramètre est retiré de l'adresse AUSSITÔT consommé. Sans ce retrait,
   * recharger la page rejouerait « Connexion réussie » indéfiniment, et
   * l'adresse partagée porterait un message qui ne concerne pas celui qui la
   * reçoit. `replace` et non `push` : sinon le retour arrière y revient.
   */
  it('le paramètre est retiré de l’adresse, sans entrée d’historique', () => {
    adresseSimulee.requete = 'toast=connexion&tri=prix';
    render(<Toaster langue="fr" />);

    expect(routeurSimule.replace).toHaveBeenCalledWith('/fr/catalogue?tri=prix', {
      scroll: false,
    });
    expect(routeurSimule.push).not.toHaveBeenCalled();
  });

  it('et l’adresse redevient nue quand il était seul', () => {
    adresseSimulee.requete = 'toast=connexion';
    render(<Toaster langue="fr" />);
    expect(routeurSimule.replace).toHaveBeenCalledWith('/fr/catalogue', { scroll: false });
  });
});

describe('la région vivante', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ELLE EXISTE MÊME VIDE, ET C'EST LA CONDITION DE SON ANNONCE.         │
   * │                                                                      │
   * │ Un lecteur d'écran surveille les régions DÉJÀ PRÉSENTES. Une région  │
   * │ insérée en même temps que son texte n'est jamais annoncée — et le    │
   * │ défaut est invisible : à l'écran, le message s'affiche parfaitement. │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('elle est là avant tout message', () => {
    render(<Toaster langue="fr" />);
    expect(region()).toBeTruthy();
    expect(region().textContent).toBe('');
  });

  it('elle est polie et atomique', () => {
    render(<Toaster langue="fr" />);
    expect(region().getAttribute('aria-live')).toBe('polite');
    expect(region().getAttribute('aria-atomic')).toBe('true');
  });
});

describe('une seule place, jamais une pile', () => {
  it('un second message REMPLACE le premier', () => {
    render(<Toaster langue="fr" />);

    act(() => {
      poserToast('connexion');
    });
    act(() => {
      poserToast('panierAjout');
    });

    expect(region().textContent).toBe(traduire('fr', 'toast.panierAjout'));
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CES DEUX TESTS ATTENDENT VRAIMENT — ET C'EST UN CHOIX.               │
   * │                                                                      │
   * │ `vi.useFakeTimers()` serait plus rapide, et il fait mourir le worker  │
   * │ de ce projet sans exécuter un seul test : le rapport ne dit alors     │
   * │ que « Worker exited unexpectedly », après trois minutes d'attente.    │
   * │                                                                      │
   * │ Trois secondes d'exécution réelle valent mieux qu'une panne dont le   │
   * │ message ne nomme ni le fichier ni la cause.                           │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Sans le rang, un second message posé juste avant l'échéance du premier
   * serait effacé par la minuterie de celui qu'il a remplacé.
   */
  it('la minuterie du premier n’emporte pas le second', async () => {
    render(<Toaster langue="fr" />);

    act(() => {
      poserToast('connexion');
    });

    await new Promise((suite) => setTimeout(suite, 2400));

    act(() => {
      poserToast('panierAjout');
    });

    await new Promise((suite) => setTimeout(suite, 400));

    expect(region().textContent).toBe(traduire('fr', 'toast.panierAjout'));
  }, 10_000);

  it('il s’efface tout seul', async () => {
    render(<Toaster langue="fr" />);

    act(() => {
      poserToast('connexion');
    });
    expect(region().textContent).not.toBe('');

    await waitFor(() => {
      expect(region().textContent).toBe('');
    }, { timeout: 5000 });
  }, 10_000);
});

describe('le nombre ne vient jamais de l’adresse', () => {
  it('la reprise de lecture porte sa page', () => {
    render(<Toaster langue="fr" />);
    act(() => {
      poserToast('reprise', { nombre: 12 });
    });
    expect(region().textContent).toBe('Reprise à la page 12.');
  });

  /**
   * Le contre-test : `?toast=reprise` sans appel client ne peut pas fabriquer
   * un numéro. Le gabarit rend une chaîne vide plutôt qu'un `{n}` littéral —
   * ce qui serait la trace visible d'un texte à trous laissé au public.
   */
  it('venue de l’adresse, elle n’invente aucun numéro', () => {
    adresseSimulee.requete = 'toast=reprise';
    render(<Toaster langue="fr" />);
    expect(region().textContent).not.toContain('{n}');
  });
});
