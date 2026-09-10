import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SceneV3 } from '@/components/lecteur/scene-v3';
import type { Etat } from '@/components/lecteur/etat';
import { traduire } from '@/i18n';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LA SCÈNE DE LECTURE, ET SON PLEIN ÉCRAN.                                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Demande du propriétaire, 8 septembre 2026 : « un visionnage plein écran,
 * rien autour, juste des boutons pour avancer ou reculer ».
 *
 * Ce fichier défend quatre choses qu'un remaniement casserait sans bruit :
 * l'absence de toute sortie de fichier, la mention d'extrait qui ne s'adresse
 * qu'aux non-acheteurs, le bouton de plein écran qui n'existe que si le
 * navigateur l'accorde, et l'état de plein écran RELU du document plutôt que
 * tenu par le bouton.
 */

const PAGE: Etat = {
  sorte: 'page',
  donnees: {
    page: { numero: 3, largeur: 1200, hauteur: 1600, au_titre_de_l_extrait: false },
    url: 'http://exemple.test/page-3.webp',
    expire_le: new Date(Date.now() + 300_000).toISOString(),
    motif: 'purchase',
  },
};

/**
 * jsdom n'implémente NI l'API plein écran NI `document.fullscreenEnabled`.
 *
 * On la pose donc à la main, et c'est exactement ce que le composant
 * interroge : `disponible` vient du document, jamais d'une supposition sur le
 * navigateur.
 */
function accorderPleinEcran(accorde: boolean): void {
  Object.defineProperty(document, 'fullscreenEnabled', {
    value: accorde,
    configurable: true,
  });
}

/** Fait comme si le navigateur venait d'entrer (ou de sortir) du plein écran. */
function poserElementPleinEcran(element: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', {
    value: element,
    configurable: true,
  });
  fireEvent(document, new Event('fullscreenchange'));
}

function rendre(props: Partial<Parameters<typeof SceneV3>[0]> = {}) {
  return render(
    <SceneV3
      langue="fr"
      slug="anansi-l-araignee"
      titre="Anansi l’araignée"
      page={3}
      total={24}
      etat={PAGE}
      aller={vi.fn()}
      possedeAuChargement
      libellePosition="Page 3 sur 24"
      {...props}
    />,
  );
}

afterEach(() => {
  poserElementPleinEcran(null);
  accorderPleinEcran(false);
});

describe('la scène', () => {
  it('AUCUN téléchargement, aucune impression, aucun partage', () => {
    /*
     * La règle métier centrale : la lecture en ligne et le téléchargement sont
     * deux droits, et le second ne s'obtient que par l'achat. Le plein écran
     * n'y change rien — il montre la même page signée, en plus grand.
     */
    const { container } = rendre();

    expect(container.querySelector('a[download]')).toBeNull();
    expect(screen.queryByText(traduire('fr', 'fiche.telecharger'))).toBeNull();

    // Le SEUL lien sortant.
    const liens = [...container.querySelectorAll('a')];
    expect(liens).toHaveLength(1);
    expect(liens[0]?.getAttribute('href')).toBe('/fr/contes/anansi-l-araignee');
  });

  it('porte une pastille par page, et marque la page courante', () => {
    rendre();

    const courante = screen.getByRole('button', { current: true });
    expect(courante.textContent).toBe('3');
  });

  it('désactive la flèche à chaque extrémité, sans la faire disparaître', () => {
    /*
     * Un bouton qui s'évapore en première page déplace l'autre, et l'enfant
     * qui visait « suivante » touche autre chose.
     */
    const { unmount } = rendre({ page: 1 });
    expect(
      screen.getAllByRole('button', { name: traduire('fr', 'lecteur.pagePrecedente') })[0],
    ).toHaveProperty('disabled', true);
    unmount();

    rendre({ page: 24 });
    expect(
      screen.getAllByRole('button', { name: traduire('fr', 'lecteur.pageSuivante') })[0],
    ).toHaveProperty('disabled', true);
  });

  it('tourne la page par les flèches', () => {
    const aller = vi.fn();
    rendre({ aller });

    fireEvent.click(
      screen.getAllByRole('button', { name: traduire('fr', 'lecteur.pageSuivante') })[0] as Element,
    );
    expect(aller).toHaveBeenCalledWith(4);

    fireEvent.click(
      screen.getAllByRole('button', {
        name: traduire('fr', 'lecteur.pagePrecedente'),
      })[0] as Element,
    );
    expect(aller).toHaveBeenCalledWith(2);
  });
});

describe('la mention d’extrait', () => {
  it('ne s’adresse QU’À qui n’a pas acheté', () => {
    /*
     * Le prototype l'écrit toujours. Sous cette phrase, un client qui a payé
     * lirait qu'il lui reste à payer — le même défaut que le message de
     * session perdue corrige, et il se règle avec la même valeur : `canRead`.
     */
    const { unmount } = rendre({ possedeAuChargement: true });
    expect(screen.queryByText(traduire('fr', 'lecteur.extraitLibre'))).toBeNull();
    unmount();

    rendre({ possedeAuChargement: false });
    expect(screen.getByText(traduire('fr', 'lecteur.extraitLibre'))).toBeTruthy();
  });
});

describe('les messages', () => {
  it('une session perdue N’INVITE PAS à l’achat', () => {
    /*
     * Le conte est déjà payé ; le proposer à la vente serait accuser un client
     * de ne pas l'avoir fait, en pleine lecture.
     */
    rendre({ etat: { sorte: 'sessionPerdue' } });

    expect(screen.getByText(traduire('fr', 'lecteur.sessionPerdue'))).toBeTruthy();
    expect(screen.queryByText(traduire('fr', 'lecteur.finExtraitAction'))).toBeNull();
    expect(
      screen
        .getByRole('link', { name: traduire('fr', 'lecteur.sessionPerdueAction') })
        .getAttribute('href'),
    ).toBe('/fr/connexion');
  });

  it('une fin d’extrait mène à la fiche, pour l’acheter', () => {
    rendre({ etat: { sorte: 'finExtrait' }, possedeAuChargement: false });

    expect(
      screen
        .getByRole('link', { name: traduire('fr', 'lecteur.finExtraitAction') })
        .getAttribute('href'),
    ).toBe('/fr/contes/anansi-l-araignee');
  });
});

describe('le plein écran', () => {
  it('n’offre PAS de bouton quand le navigateur ne l’accorde pas', () => {
    /*
     * Sur iPhone, Safari ne l'accorde qu'aux vidéos. Un bouton qui ne fait
     * rien est pire que pas de bouton.
     */
    accorderPleinEcran(false);
    rendre();

    expect(screen.queryByRole('button', { name: traduire('fr', 'lecteur.pleinEcran') })).toBeNull();
  });

  it('offre le bouton quand il l’accorde, et le demande sur la SECTION entière', () => {
    accorderPleinEcran(true);
    const demande = vi.fn();
    Element.prototype.requestFullscreen = demande;

    const { container } = rendre();
    const bouton = screen.getByRole('button', { name: traduire('fr', 'lecteur.pleinEcran') });
    fireEvent.click(bouton);

    expect(demande).toHaveBeenCalledOnce();
    /*
     * La demande porte sur la SECTION, et non sur l'image : le navigateur ne
     * montre que l'élément demandé et ses descendants — l'image seule
     * arriverait sans ses commandes.
     */
    expect(demande.mock.instances[0]).toBe(container.querySelector('section'));
  });

  it('relit son état DU DOCUMENT — Échap sort sans passer par le bouton', () => {
    accorderPleinEcran(true);
    const { container } = rendre();
    const scene = container.querySelector('section');

    expect(scene?.getAttribute('data-plein')).toBe('non');

    poserElementPleinEcran(scene);
    expect(scene?.getAttribute('data-plein')).toBe('oui');

    // Échap, ou une fenêtre réduite : le document change sans nous prévenir.
    poserElementPleinEcran(null);
    expect(scene?.getAttribute('data-plein')).toBe('non');
  });

  it('fait paraître la barre flottante EN PLEIN ÉCRAN, et là seulement', () => {
    /*
     * En page, elle doublerait la barre de tête et les pastilles. En plein
     * écran, elles ont disparu : c'est le seul endroit où l'on peut encore
     * lire où l'on en est et en sortir autrement qu'avec Échap.
     */
    accorderPleinEcran(true);
    const { container } = rendre();

    expect(
      screen.queryByRole('button', { name: traduire('fr', 'lecteur.quitterPleinEcran') }),
    ).toBeNull();

    poserElementPleinEcran(container.querySelector('section'));

    expect(
      screen.getByRole('button', { name: traduire('fr', 'lecteur.quitterPleinEcran') }),
    ).toBeTruthy();
    // La position reste lisible : c'est la seule chose que le plein écran garde.
    expect(screen.getAllByText('Page 3 sur 24').length).toBeGreaterThan(1);
  });

  it('les flèches restent en plein écran, et tournent toujours la page', () => {
    accorderPleinEcran(true);
    const aller = vi.fn();
    const { container } = rendre({ aller });

    poserElementPleinEcran(container.querySelector('section'));

    const suivantes = screen.getAllByRole('button', {
      name: traduire('fr', 'lecteur.pageSuivante'),
    });
    // La flèche du plateau ET celle de la barre flottante.
    expect(suivantes.length).toBe(2);

    fireEvent.click(suivantes[1] as Element);
    expect(aller).toHaveBeenCalledWith(4);
  });

  it('sort du plein écran par le bouton dédié', () => {
    accorderPleinEcran(true);
    const sortir = vi.fn();
    Object.defineProperty(document, 'exitFullscreen', { value: sortir, configurable: true });

    const { container } = rendre();
    poserElementPleinEcran(container.querySelector('section'));

    fireEvent.click(
      screen.getByRole('button', { name: traduire('fr', 'lecteur.quitterPleinEcran') }),
    );
    expect(sortir).toHaveBeenCalledOnce();
  });
});
