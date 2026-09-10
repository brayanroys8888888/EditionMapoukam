import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Marque } from '@/components/v2/marque';
import { traduire } from '@/i18n';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE MOT-SYMBOLE, ET SA SIGNATURE.                                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « CONTES D'AFRIQUE » N'EST PAS UN SECOND NOM.                           │
 * │                                                                          │
 * │ Le prototype pose cette ligne sous le nom, dans l'en-tête de bureau      │
 * │ seulement. Le pied, lui, porte la baseline complète juste sous la        │
 * │ marque : les deux l'une sur l'autre diraient la même chose deux fois,    │
 * │ en plus court et en plus long.                                           │
 * │                                                                          │
 * │ D'où un DRAPEAU plutôt qu'une ligne toujours rendue — et d'où ce test,   │
 * │ qui éprouve les deux sens : présente quand on la demande, absente        │
 * │ quand on ne la demande pas.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('la marque', () => {
  it('écrit toujours le nom, et le lit dans le dictionnaire', () => {
    render(<Marque langue="fr" />);
    expect(screen.getByRole('link').textContent).toContain(traduire('fr', 'marque.nom'));
  });

  it('sans le drapeau, aucune signature', () => {
    render(<Marque langue="fr" />);
    expect(screen.queryByText(traduire('fr', 'marque.signature'))).toBeNull();
  });

  it('avec le drapeau, la signature suit le nom', () => {
    render(<Marque langue="fr" signature />);
    expect(screen.getByText(traduire('fr', 'marque.signature'))).toBeTruthy();
  });

  /**
   * Le nom et la signature restent DANS le lien.
   *
   * Les sortir en ferait deux blocs voisins, et le lien de retour à l'accueil
   * n'aurait plus la surface qu'on croit cliquer.
   */
  it('la signature fait partie du lien vers l’accueil', () => {
    render(<Marque langue="fr" signature />);
    const lien = screen.getByRole('link');

    expect(lien.getAttribute('href')).toBe('/fr');
    expect(lien.textContent).toContain(traduire('fr', 'marque.signature'));
  });

  /**
   * Le sceau ne dit rien : le nom écrit à côté porte l'information. S'il
   * cessait d'être masqué, un lecteur d'écran annoncerait une image avant le
   * nom, sur chaque page du site.
   */
  it('le sceau est décoratif', () => {
    const { container } = render(<Marque langue="fr" />);
    const sceau = container.querySelector('[class*=sceau]');

    expect(sceau).toBeTruthy();
    expect(sceau?.getAttribute('aria-hidden')).toBe('true');
  });

  it('la signature est traduite, comme le reste', () => {
    render(<Marque langue="en" signature />);
    expect(screen.getByText(traduire('en', 'marque.signature'))).toBeTruthy();
    expect(traduire('en', 'marque.signature')).not.toBe(traduire('fr', 'marque.signature'));
  });
});
