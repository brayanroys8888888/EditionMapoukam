import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { Rafraichissement } from '@/components/admin/rafraichissement';
import { traduire } from '@/i18n';

import { routeurSimule } from '../setup/routeur';

/**
 * LE SUIVI EN DIRECT DU TABLEAU DE BORD.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AVEC UNE HORLOGE SIMULÉE, ET NON EN ATTENDANT.                          │
 * │                                                                          │
 * │ L'intervalle vaut une minute. Un test qui l'attendrait vraiment mettrait │
 * │ trois minutes à éprouver trois assertions, et serait le premier qu'on    │
 * │ désactiverait « en attendant ». C'est la même règle que pour les         │
 * │ scénarios d'abonnement : on déplace le temps, on ne le subit pas.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const UNE_MINUTE = 60_000;

/** Pose `document.hidden`, que jsdom ne laisse pas écrire directement. */
function poserVisibilite(cache: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => cache });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('le tableau de bord se remet à jour tout seul', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    poserVisibilite(false);
  });

  it('redemande l’arbre serveur à chaque intervalle', () => {
    render(<Rafraichissement langue="fr" />);

    // Rien tout de suite : la page vient d'être rendue par le serveur.
    expect(routeurSimule.refresh).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(UNE_MINUTE);
    });
    expect(routeurSimule.refresh).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(UNE_MINUTE);
    });
    expect(routeurSimule.refresh).toHaveBeenCalledTimes(2);
  });

  it('s’arrête quand l’onglet passe à l’arrière-plan', () => {
    // ┌──────────────────────────────────────────────────────────────────┐
    // │ CE TEST EST LA RAISON D'ÊTRE DU COMPOSANT AUTANT QUE LE PREMIER. │
    // │                                                                  │
    // │ Un back-office reste ouvert des journées entières. Sans cette    │
    // │ pause, il relancerait une douzaine d'agrégats SQL toutes les     │
    // │ minutes pendant des heures, pour personne — et sur le forfait    │
    // │ mobile du §5.1.                                                  │
    // └──────────────────────────────────────────────────────────────────┘
    render(<Rafraichissement langue="fr" />);

    act(() => {
      poserVisibilite(true);
    });

    act(() => {
      vi.advanceTimersByTime(UNE_MINUTE * 5);
    });

    expect(routeurSimule.refresh).not.toHaveBeenCalled();
  });

  it('rafraîchit IMMÉDIATEMENT au retour sur l’onglet', () => {
    // Revenir sur un écran pour y lire des chiffres d'il y a une heure serait
    // pire que de ne rien rafraîchir : rien ne dirait qu'ils sont vieux.
    render(<Rafraichissement langue="fr" />);

    act(() => {
      poserVisibilite(true);
    });
    act(() => {
      poserVisibilite(false);
    });

    expect(routeurSimule.refresh).toHaveBeenCalledTimes(1);
  });

  it('dit lequel des deux états il est dans', () => {
    // La couleur du point ne suffit pas : elle n'est pas lue par tout le monde,
    // et l'état est une information, pas une décoration.
    render(<Rafraichissement langue="fr" />);
    expect(screen.getByText(traduire('fr', 'admin.enDirect'))).toBeDefined();

    act(() => {
      poserVisibilite(true);
    });
    expect(screen.getByText(traduire('fr', 'admin.enDirectSuspendu'))).toBeDefined();
  });
});
