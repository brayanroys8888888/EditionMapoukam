import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { AproposV3 } from '@/components/v2/apropos-v3';
import { traduire } from '@/i18n';
import { lireIllustrationApropos } from '@/content/apropos';
import type { EntreeCatalogue } from '@/domain/catalog/types';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ À PROPOS — L'ÉCRAN ORGANIC.                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Les MESURES se vérifient dans un navigateur, contre le prototype. Ce que ce
 * fichier défend est ce qu'un remaniement casserait sans bruit : le récit qui
 * monte dans le héros, la preuve prise au catalogue RÉEL, et les deux
 * ornements qui ne doivent jamais s'annoncer.
 */

/** Deux entrées de catalogue, réduites à ce que l'écran lit. */
function entree(id: string, titre: string, avecCouverture = true): EntreeCatalogue {
  return {
    id,
    slug: `conte-${id}`,
    titre,
    resume: null,
    region: null,
    themes: [],
    ageMin: null,
    ageMax: null,
    pages: null,
    typeDocument: 'conte',
    gratuit: false,
    inclusAbonnement: true,
    disponibleAchat: true,
    publieLe: '2026-01-01',
    prix: null,
    couverture: avecCouverture
      ? { vignette: `/couvertures/${id}.jpg`, largeur: 268, hauteur: 403 }
      : null,
  } as unknown as EntreeCatalogue;
}

const CATALOGUE = [entree('a', 'L’oiseau de feu'), entree('b', 'La tortue et le lapin')];

describe('le héros', () => {
  /**
   * Les deux paragraphes du texte fourni par le propriétaire : l'accueil et
   * la mission. Ils remplacent trois paragraphes inventés, dont le dernier
   * n'a plus de clé du tout.
   */
  it('porte les deux paragraphes RÉELS du récit', () => {
    render(<AproposV3 langue="fr" couvertures={[]} />);

    for (const cle of ['v2.aproposH1', 'v2.aproposH2'] as const) {
      expect(screen.getByText(traduire('fr', cle))).toBeTruthy();
    }
  });

  it('le titre de la page est un `h1`, et il n’y en a qu’un', () => {
    render(<AproposV3 langue="fr" couvertures={[]} />);

    const titres = screen.getAllByRole('heading', { level: 1 });
    expect(titres).toHaveLength(1);
    expect(titres[0]?.textContent).toBe(traduire('fr', 'v2.aproposTitre'));
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CETTE IMAGE-LÀ N'EST PAS DÉCORATIVE.                                 │
   * │                                                                      │
   * │ Les autres images du site illustrent un texte qui dit déjà tout, et  │
   * │ leur `alt` est vide à dessein. Celle-ci met en scène et NOMME les    │
   * │ quatre univers de la maison : elle porte une information que rien    │
   * │ d'autre ne porte à cet endroit de la page.                           │
   * │                                                                      │
   * │ Le disque terre cuite, lui, reste une tache de couleur.              │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('l’image porte un vrai texte de remplacement, le disque non', () => {
    const { container } = render(<AproposV3 langue="fr" couvertures={[]} />);

    const image = container.querySelector('[class*=hero] img');
    expect(image?.getAttribute('alt')).toBe(lireIllustrationApropos('fr').alt);
    expect(image?.getAttribute('alt')?.length).toBeGreaterThan(20);

    const cercle = container.querySelector('[class*=heroCercle]');
    expect(cercle?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('la devise', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UNE DEVISE N'EST ATTRIBUÉE À PERSONNE.                               │
   * │                                                                      │
   * │ La version précédente signait une phrase INVENTÉE du nom de la       │
   * │ fondatrice. C'est le défaut que le dépôt a déjà rencontré sur les    │
   * │ textes de l'association : vraisemblable, bien écrit, et faux — et    │
   * │ cette fois il engageait une personne réelle.                          │
   * │                                                                      │
   * │ Ce test tient les deux bouts : la devise est bien là, et le nom de   │
   * │ la fondatrice n'y est PAS.                                            │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('porte la devise de la maison, et ne la signe de personne', () => {
    const { container } = render(<AproposV3 langue="fr" couvertures={[]} />);

    const panneau = container.querySelector('figure');
    expect(panneau?.textContent).toContain(traduire('fr', 'v2.aproposCitation'));
    expect(panneau?.textContent).toContain(traduire('fr', 'v2.aproposSignature'));
    expect(panneau?.textContent).not.toContain(traduire('fr', 'v2.aproposFondatrice'));
  });

  it('le sceau de la devise est décoratif', () => {
    const { container } = render(<AproposV3 langue="fr" couvertures={[]} />);

    const sceau = container.querySelector('figcaption [class*=sceau]');
    expect(sceau).toBeTruthy();
    expect(sceau?.getAttribute('aria-hidden')).toBe('true');
    // Un emblème posé en masque : il ne porte aucun texte.
    expect(sceau?.textContent).toBe('');
  });
});

describe('les quatre univers', () => {
  /**
   * Les quatre cartes sont les activités RÉELLES de la maison, et non les
   * quatre « principes » que le prototype avait imaginés. Le test cite les
   * clés plutôt que les libellés : c'est leur contenu qui a changé, pas leur
   * place.
   */
  it('nomment les quatre univers du texte fourni', () => {
    render(<AproposV3 langue="fr" couvertures={[]} />);

    for (const cle of [
      'v2.aproposValeur1Titre',
      'v2.aproposValeur2Titre',
      'v2.aproposValeur3Titre',
      'v2.aproposValeur4Titre',
    ] as const) {
      expect(screen.getByText(traduire('fr', cle))).toBeTruthy();
    }
  });
});

describe('la grille des quatre cartes', () => {
  it('sont une liste ORDONNÉE de quatre entrées', () => {
    const { container } = render(<AproposV3 langue="fr" couvertures={[]} />);

    const liste = container.querySelector('ol');
    expect(liste).toBeTruthy();
    expect(within(liste as HTMLElement).getAllByRole('listitem')).toHaveLength(4);
  });

  /**
   * Le numéro est un ORNEMENT : la liste est déjà ordonnée et un lecteur
   * d'écran annonce « élément 2 sur 4 ». L'énoncer une seconde fois ferait
   * entendre « deux, deux, des cultures nommées ».
   */
  it('les numéros ne s’annoncent pas', () => {
    const { container } = render(<AproposV3 langue="fr" couvertures={[]} />);

    const numeros = [...container.querySelectorAll('[class*=principeNumero]')];
    expect(numeros).toHaveLength(4);
    expect(numeros.every((n) => n.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});

describe('le catalogue en preuve', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA PREUVE VIENT DU CATALOGUE, ET DISPARAÎT QUAND IL SE TAIT.         │
   * │                                                                      │
   * │ La page « à propos » doit s'afficher même quand la base tousse —      │
   * │ c'est la page qu'on ouvre justement quand on doute. Une section       │
   * │ « Les histoires que nous publions » suivie d'un vide dirait le        │
   * │ contraire de ce qu'elle annonce.                                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la section entière disparaît si le catalogue est muet', () => {
    render(<AproposV3 langue="fr" couvertures={[]} />);
    expect(screen.queryByText(traduire('fr', 'v2.aproposCatalogueTitre'))).toBeNull();
  });

  it('chaque couverture mène à sa fiche, et porte son titre EN TOUTES LETTRES', () => {
    render(<AproposV3 langue="fr" couvertures={CATALOGUE} />);

    const lien = screen.getByRole('link', { name: 'L’oiseau de feu' });
    expect(lien.getAttribute('href')).toBe('/fr/contes/conte-a');

    /*
     * Le prototype MONTRE le titre sous la couverture ; la V2 le cachait aux
     * seuls lecteurs d'écran. Montré, il est le libellé du lien — l'image ne
     * doit donc pas le répéter.
     */
    expect(lien.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('un titre sans couverture reste atteignable', () => {
    render(<AproposV3 langue="fr" couvertures={[entree('c', 'Sans image', false)]} />);

    const lien = screen.getByRole('link', { name: 'Sans image' });
    expect(lien.querySelector('img')).toBeNull();
  });
});
