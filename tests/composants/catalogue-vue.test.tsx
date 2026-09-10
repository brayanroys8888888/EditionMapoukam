import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { BoutiqueV2, vueDepuisRequete } from '@/components/v2/boutique';
import { CarteConteV2 } from '@/components/v2/carte-conte';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import type { ReponseFacettes } from '@/domain/api/contract';
import type { FiltresCatalogue, Lien } from '@/components/catalogue';
import { traduire } from '@/i18n';

/**
 * LA BASCULE GRILLE / LISTE — lot 5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST LA SEULE PIÈCE DU DOSSIER QUI N'EXISTAIT PAS DU TOUT.             │
 * │                                                                          │
 * │ Les filtres, le tri et la pagination passaient déjà par `searchParams` : │
 * │ cette partie de `09-nextjs-implementation.md` était acquise. La bascule, │
 * │ elle, est un AJOUT — d'où ces tests, qui portent sur trois choses que    │
 * │ rien d'autre ne surveille : qu'elle vive dans l'URL, qu'elle n'écrase    │
 * │ pas les filtres posés, et qu'elle ne s'invite pas sous la V2.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const AFFICHAGE = traduire('fr', 'catalogue.vue');
const GRILLE = traduire('fr', 'catalogue.vueGrille');
const LISTE = traduire('fr', 'catalogue.vueListe');
const AJOUTER = traduire('fr', 'fiche.ajouterAuPanier');
const EXTRAIT = traduire('fr', 'fiche.lireExtrait');

const ENTREE: EntreeCatalogue = {
  id: 'livre-1',
  slug: 'anansi-l-araignee',
  titre: 'Anansi l’araignée',
  resume: null,
  auteur: 'Ama Serwaa',
  illustrateur: null,
  age_min: 6,
  age_max: 9,
  origine_culturelle: 'conte akan — Ghana',
  themes: ['ruse'],
  niveau: null,
  objectifs: [],
  type_document: 'conte',
  orientation: 'portrait',
  couverture_url: null,
  couverture: null,
  nb_pages: 24,
  langues: ['fr'],
  publie_le: '2026-01-15T00:00:00.000Z',
  inclus_abonnement: false,
  disponible_achat: true,
  gratuit: false,
  prix: { montant: 499, devise: 'EUR', zone: 'international', affichage: '4,99 €' },
  achat_hors_zone: null,
  acces: { canRead: false, canDownload: false, reason: 'preview' },
};

const FACETTES: ReponseFacettes = {
  types: [{ valeur: 'conte', nombre: 1 }],
  themes: [{ valeur: 'ruse', nombre: 1 }],
  // Vide : ces essais portent sur un CONTE, et un conte n'a pas de niveau.
  niveaux: [],
  origines: [],
  age: { min: 3, max: 9 },
  langues: ['fr'],
  total: 1,
};

const FILTRES: FiltresCatalogue = { tri: 'nouveautes', page: 1 };

/**
 * Le lien reconstruit l'URL à partir des paramètres DÉJÀ POSÉS.
 *
 * C'est ce que fait la vraie fabrique des écrans, et c'est ce qui est éprouvé
 * ici : une bascule qui repartirait d'une URL vierge effacerait les filtres.
 */
function lienDepuis(brut: Record<string, string>): Lien {
  return (modification) => {
    const suivants = new URLSearchParams(brut);
    for (const [cle, valeur] of Object.entries(modification)) {
      if (valeur === undefined) suivants.delete(cle);
      else suivants.set(cle, String(valeur));
    }
    const chaine = suivants.toString();
    return chaine.length > 0 ? `/fr/contes?${chaine}` : '/fr/contes';
  };
}

function rendreBoutique(
  vue: 'grille' | 'liste' | undefined,
  brut: Record<string, string> = {},
): void {
  render(
    <BoutiqueV2
      langue="fr"
      page={{ entrees: [ENTREE], page: 1, pages: 1, total: 1 }}
      facettes={FACETTES}
      filtres={FILTRES}
      poses={[]}
      lien={lienDepuis(brut)}
      base="/fr/contes"
      compte="1 conte disponible"
      {...(vue ? { vue } : {})}
    />,
  );
}

/** La bascule, retrouvée par son libellé de navigation. */
function bascule(): HTMLElement | null {
  return screen.queryByRole('navigation', { name: AFFICHAGE });
}

describe('la bascule n’existe que là où l’écran la demande', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE CONTRE-TEST QUI PROTÈGE LA V2.                                    │
   * │                                                                      │
   * │ Sans `vue`, la boutique doit rendre exactement ce qu'elle rendait     │
   * │ avant : sa rangée d'outils porte déjà cinq liens de tri, et une       │
   * │ sixième commande y tiendrait mal. C'est l'écran — donc la couche des  │
   * │ routes — qui décide, jamais ce composant.                             │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('aucune bascule quand l’écran n’en passe pas', () => {
    rendreBoutique(undefined);
    expect(bascule()).toBeNull();
  });

  it('la bascule paraît dès qu’une vue est passée', () => {
    rendreBoutique('grille');
    expect(bascule()).not.toBeNull();
  });

  it('elle porte exactement deux choix', () => {
    rendreBoutique('grille');
    expect(within(bascule() as HTMLElement).getAllByRole('link')).toHaveLength(2);
  });
});

describe('la vue vit dans l’URL', () => {
  /**
   * La grille est le défaut : elle n'écrit RIEN dans l'adresse. Sans cela,
   * chaque lien partagé porterait `?vue=grille`, et l'URL la plus courante du
   * site deviendrait la plus longue.
   */
  it('revenir à la grille RETIRE le paramètre', () => {
    rendreBoutique('liste', { vue: 'liste' });
    const lien = within(bascule() as HTMLElement).getByRole('link', { name: GRILLE });
    expect(lien.getAttribute('href')).toBe('/fr/contes');
  });

  it('passer à la liste POSE le paramètre', () => {
    rendreBoutique('grille');
    const lien = within(bascule() as HTMLElement).getByRole('link', { name: LISTE });
    expect(lien.getAttribute('href')).toBe('/fr/contes?vue=liste');
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ CHANGER DE VUE NE DÉFAIT PAS LA RECHERCHE.                           │
   * │                                                                      │
   * │ C'est le défaut classique d'une bascule d'affichage : elle repart de  │
   * │ l'écran nu et efface les filtres. Le lecteur qui a croisé « ruse » et │
   * │ « 6-8 ans » perdrait son travail pour avoir voulu voir des lignes.    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('elle CONSERVE les filtres et le tri déjà posés', () => {
    rendreBoutique('grille', { themes: 'ruse', tri: 'prix' });
    const lien = within(bascule() as HTMLElement).getByRole('link', { name: LISTE });
    const url = new URL(lien.getAttribute('href') ?? '', 'https://exemple.test');

    expect(url.searchParams.get('themes')).toBe('ruse');
    expect(url.searchParams.get('tri')).toBe('prix');
    expect(url.searchParams.get('vue')).toBe('liste');
  });

  it('le choix courant est annoncé, et lui seul', () => {
    rendreBoutique('liste', { vue: 'liste' });
    const allumes = (bascule() as HTMLElement).querySelectorAll('[aria-current]');
    expect(allumes).toHaveLength(1);
    expect(allumes[0]?.textContent).toContain(LISTE);
  });
});

describe('vueDepuisRequete', () => {
  it('rend la grille quand rien n’est demandé', () => {
    expect(vueDepuisRequete({})).toBe('grille');
  });

  it('rend la liste quand elle est demandée', () => {
    expect(vueDepuisRequete({ vue: 'liste' })).toBe('liste');
  });

  /**
   * Une valeur inconnue retombe sur la grille SANS erreur : c'est un réglage
   * d'affichage, et opposer une page d'erreur à `?vue=cartes` serait absurde.
   */
  it('une valeur inconnue retombe sur la grille', () => {
    expect(vueDepuisRequete({ vue: 'cartes' })).toBe('grille');
  });
});

describe('la carte en rangée porte les MÊMES faits', () => {
  const ajout = (): void => {};

  it('le bouton d’ajout survit au passage en rangée', () => {
    render(
      <CarteConteV2 langue="fr" entree={ENTREE} disposition="liste" actionAjout={ajout} />,
    );
    expect(screen.getByRole('button', { name: AJOUTER })).toBeTruthy();
  });

  it('le prix reste celui que le SERVEUR a formaté', () => {
    render(
      <CarteConteV2 langue="fr" entree={ENTREE} disposition="liste" actionAjout={ajout} />,
    );
    expect(screen.getByText('4,99 €')).toBeTruthy();
  });

  /**
   * Le voile décoratif ne suit PAS en rangée : « Lire un extrait » écrit sur
   * une vignette de 96 px serait illisible, et le lien étiré couvre déjà toute
   * la rangée. En grille, il reste — le contre-test le prouve.
   */
  it('le voile décoratif disparaît en rangée', () => {
    render(<CarteConteV2 langue="fr" entree={ENTREE} disposition="liste" />);
    expect(screen.queryByText(EXTRAIT)).toBeNull();
  });

  it('et il demeure en grille', () => {
    render(<CarteConteV2 langue="fr" entree={ENTREE} disposition="grille" />);
    expect(screen.getByText(EXTRAIT)).toBeTruthy();
  });

  /**
   * La grille reste la disposition par défaut du composant : un appelant qui
   * ne dit rien obtient ce qu'il obtenait avant.
   */
  it('la grille est le défaut du composant', () => {
    render(<CarteConteV2 langue="fr" entree={ENTREE} />);
    expect(screen.getByText(EXTRAIT)).toBeTruthy();
  });
});

describe('la liste est annoncée au CSS par un attribut, pas par une classe', () => {
  /**
   * `data-vue` est ce qui permet à la feuille de choisir la mise en page sans
   * qu'aucun composant n'ait à connaître la direction servie. Un test le fige :
   * l'attribut est le contrat entre le JSX et la feuille.
   */
  it('la vue courante est portée par la liste des résultats', () => {
    rendreBoutique('liste', { vue: 'liste' });
    expect(document.querySelector('ul[data-vue="liste"]')).not.toBeNull();
  });

  it('et vaut « grille » quand l’écran n’offre aucun choix', () => {
    rendreBoutique(undefined);
    expect(document.querySelector('ul[data-vue="grille"]')).not.toBeNull();
  });
});
