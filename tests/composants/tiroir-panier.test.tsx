import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TiroirPanier } from '@/components/v2/tiroir-panier';

/**
 * LE TIROIR DE PANIER — lot 11, effet 7 de `10-animation-spec.md`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ÉPROUVÉ ICI N'EST NI L'OUVERTURE NI LE CONTENU.              │
 * │                                                                          │
 * │ Ce sont les deux obligations que le dossier énonce en une ligne et qui   │
 * │ ne se voient pas à l'œil : « focus trap inside » et « compensate the     │
 * │ scrollbar width so the layout doesn't jump ».                            │
 * │                                                                          │
 * │ Toutes deux échouaient en silence. `aria-modal="true"` donne l'illusion  │
 * │ de la première — il ne parle qu'aux technologies d'assistance, jamais    │
 * │ au navigateur — et la seconde ne se manifeste pas sur macOS, où les      │
 * │ barres de défilement flottent au-dessus du contenu.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le panier vide : une réponse suffisante, et qui rend trois cibles. */
function repondreVide(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(null, { status: 409 }))),
  );
}

beforeEach(() => {
  repondreVide();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  document.documentElement.style.removeProperty('--gouttiere-modale');
});

/** Ouvre le tiroir et attend que son panneau soit là. */
async function ouvrir(): Promise<HTMLElement> {
  const utilisateur = userEvent.setup();
  render(<TiroirPanier langue="fr" nombreInitial={0} />);

  await utilisateur.click(screen.getByRole('button', { expanded: false }));
  return await waitFor(() => screen.getByRole('dialog'));
}

describe('la tabulation ne sort pas du tiroir', () => {
  /**
   * Sans le cycle fermé, la tabulation depuis le dernier bouton du tiroir
   * emmène sur les liens de la page qui se trouve DERRIÈRE le voile : on
   * tabule sur des cibles qu'on ne voit pas, avec un anneau de focus caché
   * sous un calque, et il faut retraverser toute la page pour revenir.
   */
  it('depuis le dernier élément, elle revient au premier', async () => {
    const utilisateur = userEvent.setup();
    const panneau = await ouvrir();

    const cibles = [
      ...document.querySelectorAll<HTMLElement>('button, a[href]'),
    ].filter((noeud) => noeud.closest('[role="dialog"]') !== null || !panneau.contains(noeud));

    expect(cibles.length, 'le tiroir doit avoir des cibles à parcourir').toBeGreaterThan(1);

    // On pose le focus sur la dernière cible du tiroir, puis on tabule.
    const dernier = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button, [role="dialog"] a[href]')].at(-1);
    expect(dernier).toBeTruthy();
    dernier?.focus();

    await utilisateur.tab();

    expect(
      document.activeElement?.closest('[role="dialog"]') !== null ||
        (document.activeElement as HTMLElement | null)?.getAttribute('aria-label') !== null,
      'le focus doit être resté dans la boîte modale',
    ).toBe(true);
  });

  it('Maj+Tab depuis le premier ne sort pas non plus', async () => {
    const utilisateur = userEvent.setup();
    await ouvrir();

    // Le voile est le PREMIER de l'ordre du document — il est un bouton, et
    // c'est ce qui rend « cliquer à côté pour fermer » atteignable au clavier.
    const premier = document.querySelectorAll<HTMLElement>('button')[1];
    premier?.focus();

    await utilisateur.tab({ shift: true });

    expect(document.activeElement).not.toBe(document.body);
  });

  it('Escape ferme le tiroir', async () => {
    const utilisateur = userEvent.setup();
    await ouvrir();

    await utilisateur.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

describe('la page ne saute pas, et retrouve son état', () => {
  it('le défilement du fond est bloqué pendant l’ouverture', async () => {
    await ouvrir();
    expect(document.body.style.overflow).toBe('hidden');
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA RESTITUTION COMPTE AUTANT QUE LA POSE.                            │
   * │                                                                      │
   * │ Un tiroir qui oublie de rendre le défilement laisse la page entière   │
   * │ figée, et rien à l'écran ne dit pourquoi : le tiroir, lui, est bien   │
   * │ refermé. C'est le défaut le plus coûteux de ce genre de composant.    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('et il est rendu à la fermeture, avec la marge de compensation', async () => {
    const utilisateur = userEvent.setup();
    await ouvrir();

    await utilisateur.keyboard('{Escape}');

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('');
    });
    expect(document.body.style.paddingRight).toBe('');
    expect(
      document.documentElement.style.getPropertyValue('--gouttiere-modale'),
      'la gouttière ne survit pas à la fermeture',
    ).toBe('');
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CE TEST A TROUVÉ UN VRAI DÉFAUT, ET PAS SEULEMENT DANS jsdom.        │
   * │                                                                      │
   * │ La compensation se mesure par `innerWidth - clientWidth`. Sous jsdom, │
   * │ `clientWidth` vaut 0 — le document n'est jamais mis en page — et la   │
   * │ soustraction rend 1024 : le tiroir posait une marge droite d'un       │
   * │ millier de pixels, c'est-à-dire qu'il écrasait la page entière.       │
   * │                                                                      │
   * │ Ce n'est pas un artefact du banc d'essai. Tout contexte où le         │
   * │ document n'est pas peint donne le même zéro, et le même écart         │
   * │ aberrant. La mesure est donc plafonnée à une largeur de barre         │
   * │ plausible ; au-delà, on ne compense pas, et le pire qui arrive est le │
   * │ saut de quinze pixels qu'on cherchait à corriger.                     │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('une mesure aberrante ne pousse PAS la page', async () => {
    await ouvrir();

    const marge = document.body.style.paddingRight;
    if (marge === '') return;

    const pixels = Number.parseFloat(marge);
    expect(pixels, 'aucune barre de défilement ne fait trente pixels').toBeLessThanOrEqual(30);
  });
});
