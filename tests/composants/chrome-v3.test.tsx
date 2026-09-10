import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { BarreOngletsV3, BarreUtilitaireV3 } from '@/components/enveloppe/v3';
import { SuiviDefilement } from '@/components/enveloppe/defilement';
import { MenuMobile } from '@/components/v2/menu-mobile';
import { traduire } from '@/i18n';

/**
 * LE CHROME DE LA V3 — barre utilitaire et barre d'onglets.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES DEUX PIÈCES N'EXISTENT QUE SOUS LA V3, ET C'EST TOUT LE PIÈGE.      │
 * │                                                                          │
 * │ `estV3()` lit une variable d'environnement. Sans elle, la barre          │
 * │ utilitaire rend un commutateur de thème que la V2 ne sait pas honorer.   │
 * │ Les tests posent donc la variable explicitement plutôt que d'espérer     │
 * │ celle de l'environnement de test.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('la barre utilitaire', () => {
  it('porte la promesse, le thème et la langue — et rien d’autre', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    render(<BarreUtilitaireV3 langue="fr" chemin="/fr" />);

    /*
     * La promesse est celle du prototype, mot pour mot. Le libellé est écrit
     * ici en clair plutôt que relu dans le dictionnaire : un test qui lit la
     * même source que le code ne peut pas voir une phrase changer.
     */
    expect(
      screen.getByText('Livraison numérique immédiate · PDF et EPUB à garder pour toujours'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /thème/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Langue du site' })).toBeTruthy();
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE COMMUTATEUR PORTE DEUX LIBELLÉS, ET ILS NE DISENT PAS LA MÊME     │
   * │ CHOSE.                                                               │
   * │                                                                      │
   * │ Le libellé VISIBLE nomme la destination — « Nuit » quand on est en   │
   * │ clair, c'est ce que le clic donnera. Le libellé ACCESSIBLE, lui,     │
   * │ reste la phrase complète : hors contexte, « Nuit » seul ne dit pas   │
   * │ qu'on peut cliquer, et un lecteur d'écran l'annoncerait comme une    │
   * │ étiquette.                                                           │
   * │                                                                      │
   * │ Le mot visible est donc masqué à l'assistance : sans cela, le nom    │
   * │ accessible du bouton deviendrait « Passer au thème sombre Nuit ».    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('le commutateur de thème est une pastille ÉTIQUETÉE', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    const { container } = render(<BarreUtilitaireV3 langue="fr" chemin="/fr" />);

    const bouton = screen.getByRole('button', { name: 'Passer au thème sombre' });
    expect(bouton.textContent).toContain('Nuit');

    const mot = container.querySelector('[class*=commutateurLibelle]');
    expect(mot?.getAttribute('aria-hidden')).toBe('true');
  });

  /**
   * La pastille de six pixels du prototype est décorative : la phrase qui la
   * suit dit tout. Annoncée, elle allongerait l'écoute sans rien apprendre.
   */
  it('la pastille devant la promesse est masquée à l’assistance', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    const { container } = render(<BarreUtilitaireV3 langue="fr" chemin="/fr" />);

    const point = container.querySelector('[class*=v3_point], [class*=point]');
    expect(point).toBeTruthy();
    expect(point?.getAttribute('aria-hidden')).toBe('true');
  });

  /**
   * Le sélecteur de langue garde la page courante, comme partout ailleurs.
   * Déplacé dans la barre utilitaire, il n'a aucune raison de perdre cette
   * propriété — et ce serait invisible tant que personne ne change de langue
   * depuis une page profonde.
   */
  it('le changement de langue CONSERVE la page et ses filtres', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    render(<BarreUtilitaireV3 langue="fr" chemin="/fr/contes" requete="?theme=ruse&tri=prix" />);

    expect(screen.getByRole('link', { name: 'EN' }).getAttribute('href')).toBe(
      '/en/contes?theme=ruse&tri=prix',
    );
  });
});

describe('la barre d’onglets', () => {
  const rendre = (chemin: string, nombre = 0) => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    return render(<BarreOngletsV3 langue="fr" chemin={chemin} panier={{ nombre }} />);
  };

  const actif = (): string | null =>
    screen.getByRole('navigation').querySelector('[aria-current="page"]')?.textContent ?? null;

  it('porte exactement cinq entrées', () => {
    rendre('/fr');
    expect(within(screen.getByRole('navigation')).getAllByRole('link')).toHaveLength(5);
  });

  it('allume l’accueil sur l’accueil, et lui seul', () => {
    rendre('/fr');
    expect(actif()).toBe('Accueil');
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN ONGLET RESTE ALLUMÉ SUR LES ÉCRANS QUI DÉCOULENT DE LUI.          │
   * │                                                                      │
   * │ C'est la règle que `04-screens-mobile.md` énonce, et c'est celle qui  │
   * │ se perd le plus facilement : une comparaison d'égalité stricte        │
   * │ éteint l'onglet dès le premier pas. Le visiteur perd alors le fil de  │
   * │ l'endroit où il est — dans un tunnel d'achat, au pire moment.         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('« Contes » reste allumé sur la fiche d’un conte', () => {
    rendre('/fr/contes/anansi-l-araignee-maligne');
    expect(actif()).toBe('Contes');
  });

  it('« Panier » reste allumé pendant le PAIEMENT', () => {
    rendre('/fr/paiement/abc-123');
    expect(actif()).toBe('Panier');
  });

  it('« Compte » reste allumé sur la connexion', () => {
    rendre('/fr/connexion');
    expect(actif()).toBe('Compte');
  });

  /**
   * Le contre-test : sans lui, une implémentation qui allumerait TOUT ce qui
   * commence par le même préfixe passerait les cinq cas ci-dessus.
   */
  it('n’allume qu’UN seul onglet à la fois', () => {
    rendre('/fr/livrets');
    const allumes = screen.getByRole('navigation').querySelectorAll('[aria-current="page"]');
    expect(allumes).toHaveLength(1);
    expect(allumes[0]?.textContent).toBe('Livrets');
  });

  /**
   * `/fr/contes` et `/en/contes` sont le même onglet : la comparaison porte
   * sur le chemin SANS la langue. Une implémentation qui l'oublierait
   * n'allumerait plus rien sur la moitié anglaise du site.
   */
  it('reconnaît l’onglet quelle que soit la langue', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    render(<BarreOngletsV3 langue="en" chemin="/en/livrets" panier={{ nombre: 0 }} />);
    expect(actif()).toBe('Kits');
  });

  it('les liens pointent dans la langue servie', () => {
    vi.stubEnv('NEXT_PUBLIC_DESIGN_VERSION', 'v3');
    render(<BarreOngletsV3 langue="en" chemin="/en" panier={{ nombre: 0 }} />);
    expect(screen.getByRole('link', { name: /Cart/ }).getAttribute('href')).toBe('/en/panier');
  });

  it('la pastille ne paraît QUE si le panier n’est pas vide', () => {
    rendre('/fr', 0);
    expect(screen.queryByText('3')).toBeNull();
  });

  it('la pastille porte le nombre d’articles', () => {
    rendre('/fr', 3);
    expect(screen.getByText('3')).toBeTruthy();
  });
});

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE FILET DE L'EN-TÊTE — ET LE SENS DE L'ATTRIBUT.                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
describe('le suivi du défilement', () => {
  function defiler(y: number): void {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
  }

  afterEach(() => {
    delete document.documentElement.dataset['sommet'];
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ L'ÉTAT SÛR EST L'ABSENCE D'ATTRIBUT, ET C'EST TOUT L'ENJEU.          │
   * │                                                                      │
   * │ Le dossier demande un `data-scrolled` qui AJOUTE le filet. On pose    │
   * │ l'inverse : sans JavaScript, l'attribut n'existe pas, et l'en-tête    │
   * │ translucide garde donc sa limite. Avec `data-scrolled`, un navigateur │
   * │ sans script n'aurait jamais eu de filet du tout.                      │
   * │                                                                      │
   * │ Ce test fige le SENS de l'attribut. Le retourner un jour par          │
   * │ commodité inverserait silencieusement le repli.                       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('marque le sommet dès le montage', () => {
    render(<SuiviDefilement />);
    expect(document.documentElement.dataset['sommet']).toBe('true');
  });

  it('retire la marque au-delà du seuil', () => {
    render(<SuiviDefilement />);
    defiler(40);
    expect(document.documentElement.dataset['sommet']).toBeUndefined();
  });

  /** Huit pixels, pas neuf : au seuil exact, on est encore au sommet. */
  it('huit pixels comptent encore comme le sommet', () => {
    render(<SuiviDefilement />);
    defiler(8);
    expect(document.documentElement.dataset['sommet']).toBe('true');
  });

  it('la remet en revenant en haut', () => {
    render(<SuiviDefilement />);
    defiler(200);
    defiler(0);
    expect(document.documentElement.dataset['sommet']).toBe('true');
  });

  /**
   * Démonté, le composant rend l'état SÛR — le filet, jamais son absence.
   * Sans ce nettoyage, une navigation qui retirerait la barre utilitaire
   * laisserait un `data-sommet` figé sur `<html>`, et l'en-tête resterait
   * sans limite pour le reste de la session.
   */
  it('le démontage rend l’état sûr', () => {
    const { unmount } = render(<SuiviDefilement />);
    expect(document.documentElement.dataset['sommet']).toBe('true');
    unmount();
    expect(document.documentElement.dataset['sommet']).toBeUndefined();
  });
});

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LA FEUILLE MONTANTE — le menu mobile d'Organic.                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * La forme — feuille plutôt que panneau plein écran — est du CSS, et un test
 * de rendu ne la voit pas. Ce qu'il voit, et ce qui compte, est la SURFACE DE
 * RETOUR que la feuille suppose : le voile. Sans lui, une feuille qui laisse
 * voir la page derrière elle n'offre aucun moyen de la rejoindre — sinon une
 * croix qu'il faut aller chercher en haut de l'écran.
 */
describe('la feuille du menu mobile', () => {
  function ouvrir(): void {
    render(<MenuMobile langue="fr" chemin="/fr/contes" connecte={false} />);
    fireEvent.click(screen.getByRole('button', { name: traduire('fr', 'navigation.principal') }));
  }

  it('le voile est rendu avec la feuille', () => {
    ouvrir();
    expect(document.querySelector('[role="presentation"]')).not.toBeNull();
  });

  /**
   * Le voile est DÉCORATIF : `Escape` et le bouton de fermeture sont les deux
   * chemins accessibles, et ils existent déjà. Un troisième bouton sans nom
   * n'allongerait que la liste annoncée par le lecteur d'écran — c'est la
   * règle qu'applique déjà le voile de la feuille de filtres.
   */
  it('le voile ne s’annonce pas', () => {
    ouvrir();
    const voile = document.querySelector('[role="presentation"]');
    expect(voile?.getAttribute('aria-hidden')).toBe('true');
  });

  it('toucher le voile referme la feuille', () => {
    ouvrir();
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(document.querySelector('[role="presentation"]') as Element);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * Le panneau reste un dialogue modal : la feuille change sa FORME, pas sa
   * nature. `aria-modal` et le retour du focus au bouton sont acquis depuis la
   * V2, et il ne faut pas les perdre en changeant de décor.
   */
  it('la feuille reste un dialogue modal', () => {
    ouvrir();
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  });

  it('le menu reste fermé tant qu’on ne l’ouvre pas', () => {
    render(<MenuMobile langue="fr" chemin="/fr" connecte={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[role="presentation"]')).toBeNull();
  });
});
