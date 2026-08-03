import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import {
  BarreFiltres,
  CarteLivre,
  CatalogueVide,
  ChampRecherche,
  GrilleCatalogue,
  SelecteurTri,
  type FiltresCatalogue,
  type Lien,
} from '@/components/catalogue';
import type { EntreeCatalogue } from '@/domain/catalog/types';
import type { ReponseFacettes } from '@/domain/api/contract';
import { messageErreur, traduire } from '@/i18n';

/**
 * Les libellés sont LUS DANS LE DICTIONNAIRE, jamais recopiés dans le test.
 *
 * Ce que ces tests éprouvent est QUELLE ligne s'affiche, pas sa rédaction : une
 * correction de copie — ou seulement d'apostrophe — ne doit pas les faire
 * tomber. Le contenu des dictionnaires, lui, a sa propre couverture dans
 * `tests/unit/i18n.test.ts`.
 */
const POSSEDE = traduire('fr', 'acces.purchase');
const ABONNEMENT = traduire('fr', 'acces.inclusAbonnement');
const GRATUIT = traduire('fr', 'acces.free');
const REGION_OUEST = traduire('fr', 'regions.afrique_ouest');
const REGION_SAHEL = traduire('fr', 'regions.sahel');
const HORS_ZONE_FR = messageErreur('fr', 'hors_zone');
const HORS_ZONE_EN = messageErreur('en', 'hors_zone');

/** Échappe un libellé pour l'employer dans une expression régulière. */
function motif(texte: string): RegExp {
  return new RegExp(texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

/**
 * CATALOGUE — étape F4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI DES FIXTURES ICI, ALORS QUE LA RÈGLE DIT « LE CORPUS RÉEL ».   │
 * │                                                                          │
 * │ PLAN-FRONTEND §1 exige que les tests d'interface consomment le corpus    │
 * │ servi par la base locale, et c'est ce que fait                           │
 * │ `tests/integration/catalogue-ssr.test.ts`, qui rend la grille avec les   │
 * │ titres réels.                                                            │
 * │                                                                          │
 * │ Ce fichier-ci éprouve une MATRICE : les croisements de `reason`, de      │
 * │ `prix` et d'`inclus_abonnement`. Le corpus ne les contient pas tous — il │
 * │ n'a aucune raison de contenir un titre à la fois acheté, vendu à l'unité │
 * │ ET inclus dans l'abonnement, qui est précisément le cas où la règle se   │
 * │ joue. Attendre du corpus qu'il les porte tous reviendrait à ne jamais    │
 * │ tester le croisement le plus dangereux.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const BASE: EntreeCatalogue = {
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
  region: 'afrique_ouest',
  couverture_url: null,
  couverture: {
    vignette: 'https://exemple.test/storage/covers/abc/vignette.webp',
    fiche: 'https://exemple.test/storage/covers/abc/fiche.webp',
    mise_en_avant: 'https://exemple.test/storage/covers/abc/mise-en-avant.webp',
  },
  nb_pages: 24,
  langues: ['fr'],
  publie_le: '2026-01-15T00:00:00.000Z',
  abonnement_a_partir_du: null,
  inclus_abonnement: false,
  disponible_achat: true,
  gratuit: false,
  prix: { montant: 499, devise: 'EUR', zone: 'international', affichage: '4,99 €' },
  achat_hors_zone: null,
  acces: { canRead: false, canDownload: false, reason: 'preview' },
};

function entree(modifications: Partial<EntreeCatalogue> = {}): EntreeCatalogue {
  return { ...BASE, ...modifications };
}

const LIEN: Lien = (modification) =>
  `/fr/catalogue?${new URLSearchParams(
    Object.entries(modification)
      .filter(([, valeur]) => valeur !== undefined)
      .map(([cle, valeur]) => [cle, String(valeur)]),
  ).toString()}`;

const FILTRES_VIDES: FiltresCatalogue = { tri: 'nouveautes', page: 1 };

// ═══════════════════════════════════════════════════════════════════════════
// LES TROIS LIGNES D'ACCÈS — LE CŒUR DE CET ÉCRAN
// ═══════════════════════════════════════════════════════════════════════════

describe('la carte porte TROIS lignes d’accès, pas deux', () => {
  it('1 — un titre vendu à l’unité affiche son PRIX', () => {
    render(<CarteLivre langue="fr" entree={entree()} />);

    expect(screen.getByText('4,99 €')).toBeDefined();
  });

  it('2 — un titre inclus dans l’abonnement affiche « Avec l’abonnement »', () => {
    render(
      <CarteLivre
        langue="fr"
        entree={entree({ inclus_abonnement: true, disponible_achat: false, prix: null })}
      />,
    );

    expect(screen.getByText(ABONNEMENT)).toBeDefined();
  });

  it('3 — un titre DÉJÀ POSSÉDÉ affiche « Dans votre bibliothèque »', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LA LIGNE QUE LA MAQUETTE N'AVAIT PAS.                              │
    // │                                                                    │
    // │ Elle n'en prévoyait que deux — un prix, ou « Avec l'abonnement ».   │
    // │ Aucune ne convient à qui détient déjà le titre, et TOUTES DEUX      │
    // │ l'invitent à obtenir ce qu'il a déjà payé.                          │
    // └────────────────────────────────────────────────────────────────────┘
    render(
      <CarteLivre
        langue="fr"
        entree={entree({ acces: { canRead: true, canDownload: true, reason: 'purchase' } })}
      />,
    );

    expect(screen.getByText(POSSEDE)).toBeDefined();
  });

  it('4 — un titre possédé n’affiche NI prix NI « Avec l’abonnement »', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE TEST QUI COMPTE LE PLUS DE CE FICHIER.                          │
    // │                                                                    │
    // │ Sans lui, une implémentation qui EMPILERAIT les trois lignes        │
    // │ passerait les trois tests précédents. Le titre est délibérément à   │
    // │ la fois acheté, vendu à l'unité ET inclus dans l'abonnement : les   │
    // │ trois lignes sont donc candidates, et une seule doit sortir.        │
    // └────────────────────────────────────────────────────────────────────┘
    render(
      <CarteLivre
        langue="fr"
        entree={entree({
          inclus_abonnement: true,
          disponible_achat: true,
          acces: { canRead: true, canDownload: true, reason: 'purchase' },
        })}
      />,
    );

    expect(screen.getByText(POSSEDE)).toBeDefined();
    expect(screen.queryByText('4,99 €')).toBeNull();
    expect(screen.queryByText(ABONNEMENT)).toBeNull();
  });

  it('un octroi d’administrateur vaut possession, comme un achat', () => {
    // `granted` et `purchase` sont deux motifs distincts et une seule
    // situation vécue : le titre est à moi. Les séparer à l'écran ferait
    // proposer un achat à qui s'est vu offrir le titre.
    render(
      <CarteLivre
        langue="fr"
        entree={entree({ acces: { canRead: true, canDownload: true, reason: 'granted' } })}
      />,
    );

    expect(screen.getByText(POSSEDE)).toBeDefined();
    expect(screen.queryByText('4,99 €')).toBeNull();
  });

  it('un ABONNÉ ACTIF n’est pas propriétaire — il voit l’abonnement', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LA RÈGLE MÉTIER CENTRALE, VUE DEPUIS LA GRILLE.                    │
    // │                                                                    │
    // │ `reason: 'subscription'` donne la lecture, jamais la propriété.     │
    // │ Afficher « Dans votre bibliothèque » à un abonné lui ferait croire  │
    // │ qu'il conserve le titre après l'expiration — le contresens le plus  │
    // │ coûteux de ce domaine.                                             │
    // └────────────────────────────────────────────────────────────────────┘
    render(
      <CarteLivre
        langue="fr"
        entree={entree({
          inclus_abonnement: true,
          acces: { canRead: true, canDownload: false, reason: 'subscription' },
        })}
      />,
    );

    expect(screen.getByText(ABONNEMENT)).toBeDefined();
    expect(screen.queryByText(POSSEDE)).toBeNull();
  });

  it('un titre gratuit le dit', () => {
    render(<CarteLivre langue="fr" entree={entree({ gratuit: true })} />);
    expect(screen.getByText(GRATUIT)).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACHAT HORS ZONE
// ═══════════════════════════════════════════════════════════════════════════

describe('un titre sans prix dans la zone du visiteur', () => {
  it('reste AFFICHÉ, et seul son achat est empêché', () => {
    // Le retirer du catalogue appauvrirait la découverte : il peut être
    // parfaitement lisible par abonnement. Et on ne montre jamais le prix
    // d'une autre zone, même à titre indicatif.
    render(
      <CarteLivre
        langue="fr"
        entree={entree({
          prix: null,
          achat_hors_zone: { code: 'hors_zone', message: 'peu importe' },
        })}
      />,
    );

    expect(screen.getByText('Anansi l’araignée')).toBeDefined();
    expect(
      screen.getByText(HORS_ZONE_FR),
    ).toBeDefined();
  });

  it('le message vient du CODE, jamais du `message` de l’API', () => {
    // L'API ne rédige qu'en français : afficher son `message` tel quel
    // rendrait l'anglais impossible. La preuve tient en une bascule de langue.
    render(
      <CarteLivre
        langue="en"
        entree={entree({
          prix: null,
          achat_hors_zone: { code: 'hors_zone', message: 'texte français de l’API' },
        })}
      />,
    );

    expect(
      screen.getByText(HORS_ZONE_EN),
    ).toBeDefined();
    expect(screen.queryByText('texte français de l’API')).toBeNull();
  });

  it('le même titre avec un prix montre le prix — le contre-test', () => {
    // Sans lui, une carte qui n'afficherait JAMAIS de prix passerait le test
    // précédent.
    render(<CarteLivre langue="fr" entree={entree()} />);

    expect(screen.getByText('4,99 €')).toBeDefined();
    expect(
      screen.queryByText(HORS_ZONE_FR),
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COUVERTURES
// ═══════════════════════════════════════════════════════════════════════════

describe('couvertures de la grille', () => {
  it('demande la VIGNETTE, jamais la taille « fiche »', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ 320 px CONTRE 800 px, SUR VINGT TITRES.                            │
    // │                                                                    │
    // │ L'écart se compte en mégaoctets, et §5.1 qualifie ce gaspillage de  │
    // │ critique pour un public en partie sur connexion lente. La grille    │
    // │ entière est parcourue : un seul titre servi en taille fiche suffit  │
    // │ à faire échouer.                                                    │
    // └────────────────────────────────────────────────────────────────────┘
    const { container } = render(
      <GrilleCatalogue
        langue="fr"
        entrees={[entree(), entree({ id: 'livre-2', slug: 'autre', titre: 'Le lion' })]}
      />,
    );

    const images = [...container.querySelectorAll('img')];
    expect(images.length).toBe(2);

    for (const image of images) {
      const source = `${image.getAttribute('src') ?? ''} ${image.getAttribute('srcset') ?? ''}`;
      expect(source, 'une image de grille demande la taille fiche').not.toContain('fiche');
      expect(source).toContain('vignette');
    }
  });

  it('réserve la place et diffère le chargement', () => {
    // `width`/`height` évitent le décalage à l'arrivée des images — sur
    // connexion lente, c'est ce décalage qui fait cliquer à côté.
    const { container } = render(<GrilleCatalogue langue="fr" entrees={[entree()]} />);

    const image = container.querySelector('img');
    expect(image?.getAttribute('width')).toBe('320');
    expect(image?.getAttribute('height')).toBe('480');
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('sizes')).toBeTruthy();
  });

  it('une couverture ABSENTE DU STOCKAGE retombe sur le substitut', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ UN JETON EN BASE NE PROUVE PAS QU'UN FICHIER EXISTE.               │
    // │                                                                    │
    // │ Le cas s'est produit sur le corpus de démonstration : huit titres   │
    // │ publiés portaient un `couverture_jeton`, le bucket `covers` était   │
    // │ vide, et la grille rendait huit images cassées. Le test            │
    // │ `couverture: null` ci-dessous ne l'aurait PAS vu — le jeton, lui,   │
    // │ était bien là.                                                     │
    // │                                                                    │
    // │ Seul l'échec de chargement dit la vérité, et c'est lui qu'on       │
    // │ éprouve ici.                                                       │
    // └────────────────────────────────────────────────────────────────────┘
    const { container } = render(<GrilleCatalogue langue="fr" entrees={[entree()]} />);

    const image = container.querySelector('img');
    expect(image).not.toBeNull();

    // jsdom ne charge aucune image : on déclenche l'échec que produirait un
    // objet manquant, un CDN en défaut ou une purge de stockage.
    fireEvent.error(image as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Couverture à venir')).toBeDefined();
  });

  it('une couverture qui se charge n’affiche PAS le substitut — le contre-test', () => {
    // Sans lui, un composant qui montrerait toujours le substitut passerait
    // le test précédent, et le catalogue n'aurait plus aucune image.
    render(<GrilleCatalogue langue="fr" entrees={[entree()]} />);

    expect(screen.queryByText('Couverture à venir')).toBeNull();
  });

  it('un titre sans couverture montre un substitut, pas une image cassée', () => {
    const { container } = render(
      <GrilleCatalogue langue="fr" entrees={[entree({ couverture: null })]} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Couverture à venir')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LES TROIS ÉTATS
// ═══════════════════════════════════════════════════════════════════════════

describe('les trois états du catalogue', () => {
  it('rempli — la grille rend une carte par titre', () => {
    render(
      <GrilleCatalogue
        langue="fr"
        entrees={[
          entree(),
          entree({ id: '2', slug: 'b', titre: 'Le lion et la souris' }),
          entree({ id: '3', slug: 'c', titre: 'Petit baobab' }),
        ]}
      />,
    );

    expect(screen.getAllByRole('article').length).toBe(3);
  });

  it('réduit — un seul résultat reste une grille valide', () => {
    render(<GrilleCatalogue langue="fr" entrees={[entree()]} />);

    expect(screen.getAllByRole('article').length).toBe(1);
  });

  it('vide — l’écran propose une ISSUE, jamais un cul-de-sac', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ « Aucun conte ne correspond » laisse le lecteur devant un écran     │
    // │ mort, alors qu'il vient probablement de croiser deux filtres        │
    // │ incompatibles. L'issue est offerte, pas suggérée.                   │
    // └────────────────────────────────────────────────────────────────────┘
    render(<CatalogueVide langue="fr" lienSansFiltres="/fr/catalogue" />);

    expect(screen.getByText('Aucun conte ne correspond')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Voir tout le catalogue' }).getAttribute('href')).toBe(
      '/fr/catalogue',
    );
  });

  it('un catalogue rempli n’affiche PAS l’état vide — le contre-test', () => {
    render(<GrilleCatalogue langue="fr" entrees={[entree()]} />);
    expect(screen.queryByText('Aucun conte ne correspond')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LES FILTRES VIVENT DANS L'URL
// ═══════════════════════════════════════════════════════════════════════════

const FACETTES: ReponseFacettes = {
  regions: [
    { valeur: 'afrique_ouest', nombre: 3 },
    { valeur: 'sahel', nombre: 1 },
  ],
  themes: [
    { valeur: 'ruse', nombre: 4 },
    { valeur: 'animaux', nombre: 2 },
  ],
  origines: [{ valeur: 'Ghana', nombre: 1 }],
  age: { min: 3, max: 12 },
  langues: ['fr', 'en'],
  total: 8,
};

describe('les filtres sont des LIENS, et vivent dans l’URL', () => {
  it('une pastille de région est un lien qui pose le filtre', () => {
    // Des boutons mutant un état en mémoire perdraient le partage, le
    // rechargement, et l'accès des moteurs aux pages filtrées (§5.4).
    render(
      <BarreFiltres langue="fr" facettes={FACETTES} filtres={FILTRES_VIDES} lien={LIEN} />,
    );

    const lien = screen.getByRole('link', { name: motif(REGION_OUEST) });
    expect(lien.getAttribute('href')).toContain('region=afrique_ouest');
  });

  it('la pastille ACTIVE porte `aria-current` et son lien RETIRE le filtre', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ L'ÉTAT ACTIF N'EST PAS PORTÉ PAR LA SEULE COULEUR.                 │
    // │                                                                    │
    // │ Un filtre actif qu'on ne voit pas est un catalogue qui ment — et    │
    // │ la couleur seule ne dit rien à qui ne la distingue pas.             │
    // │                                                                    │
    // │ Cliquer un filtre posé le retire : c'est la seule façon de revenir  │
    // │ en arrière sans chercher une croix minuscule.                       │
    // └────────────────────────────────────────────────────────────────────┘
    render(
      <BarreFiltres
        langue="fr"
        facettes={FACETTES}
        filtres={{ ...FILTRES_VIDES, region: 'afrique_ouest' }}
        lien={LIEN}
      />,
    );

    const lien = screen.getByRole('link', { name: motif(REGION_OUEST) });
    expect(lien.getAttribute('aria-current')).toBe('true');
    expect(lien.getAttribute('href')).not.toContain('region=');
  });

  it('une pastille inactive ne porte pas `aria-current` — le contre-test', () => {
    render(
      <BarreFiltres
        langue="fr"
        facettes={FACETTES}
        filtres={{ ...FILTRES_VIDES, region: 'afrique_ouest' }}
        lien={LIEN}
      />,
    );

    expect(screen.getByRole('link', { name: motif(REGION_SAHEL) }).getAttribute('aria-current')).toBeNull();
  });

  it('les pastilles annoncent l’EFFECTIF de chaque valeur', () => {
    // Il vient des facettes, jamais d'un décompte fait dans l'interface : une
    // liste figée se désynchroniserait du catalogue au premier titre ingéré.
    render(
      <BarreFiltres langue="fr" facettes={FACETTES} filtres={FILTRES_VIDES} lien={LIEN} />,
    );

    expect(screen.getByRole('link', { name: motif(`${REGION_OUEST} (3)`) })).toBeDefined();
  });

  it('les thèmes se CUMULENT, contrairement à la région', () => {
    // On cherche « ruse ET animaux », pas l'un puis l'autre.
    render(
      <BarreFiltres
        langue="fr"
        facettes={FACETTES}
        filtres={{ ...FILTRES_VIDES, themes: ['ruse'] }}
        lien={LIEN}
      />,
    );

    const ajout = screen.getByRole('link', { name: /animaux/ });
    expect(decodeURIComponent(ajout.getAttribute('href') ?? '')).toContain('themes=ruse,animaux');

    // Et le thème déjà posé se retire, sans emporter l'autre.
    const retrait = screen.getByRole('link', { name: /ruse/ });
    expect(retrait.getAttribute('href')).not.toContain('themes=');
  });

  it('poser un filtre RAMÈNE À LA PREMIÈRE PAGE', () => {
    // Sans cela, filtrer depuis la page 4 afficherait la page 4 d'un
    // résultat qui n'en compte qu'une — c'est-à-dire un écran vide.
    render(
      <BarreFiltres
        langue="fr"
        facettes={FACETTES}
        filtres={{ ...FILTRES_VIDES, page: 4 }}
        lien={LIEN}
      />,
    );

    expect(screen.getByRole('link', { name: motif(REGION_SAHEL) }).getAttribute('href')).not.toContain('page=');
  });
});

describe('tri et recherche', () => {
  it('le tri est une liste de liens, l’actif étant signalé', () => {
    render(<SelecteurTri langue="fr" tri="popularite" lien={LIEN} />);

    const actif = screen.getByRole('link', { name: 'Les plus lus' });
    expect(actif.getAttribute('aria-current')).toBe('true');

    const autre = screen.getByRole('link', { name: 'Nouveautés' });
    expect(autre.getAttribute('aria-current')).toBeNull();
    expect(autre.getAttribute('href')).toContain('tri=nouveautes');
  });

  it('la recherche est un formulaire GET — elle écrit dans l’URL', () => {
    // `method="get"` fonctionne sans JavaScript et rend l'adresse partageable.
    const { container } = render(
      <ChampRecherche langue="fr" action="/fr/catalogue" filtres={FILTRES_VIDES} />,
    );

    const formulaire = container.querySelector('form');
    expect(formulaire?.getAttribute('method')).toBe('get');
    expect(formulaire?.getAttribute('action')).toBe('/fr/catalogue');
    expect(screen.getByLabelText('Rechercher un conte').getAttribute('name')).toBe('q');
  });

  it('chercher n’efface PAS les filtres déjà posés', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉFAUT LE PLUS COURANT DES CATALOGUES FILTRABLES.               │
    // │                                                                    │
    // │ Un formulaire `GET` n'envoie que ses propres champs : sans report   │
    // │ en champs cachés, lancer une recherche remettrait la région et les  │
    // │ thèmes à zéro, silencieusement.                                    │
    // └────────────────────────────────────────────────────────────────────┘
    const { container } = render(
      <ChampRecherche
        langue="fr"
        action="/fr/catalogue"
        filtres={{ ...FILTRES_VIDES, region: 'sahel', themes: ['ruse', 'animaux'], acces: 'gratuit' }}
      />,
    );

    const caches = [...container.querySelectorAll('input[type="hidden"]')].map((champ) => [
      champ.getAttribute('name'),
      champ.getAttribute('value'),
    ]);

    expect(caches).toContainEqual(['region', 'sahel']);
    expect(caches).toContainEqual(['acces', 'gratuit']);
    // Une seule entrée, séparée par des virgules : des champs répétés
    // seraient lus comme la seule dernière valeur par le schéma du catalogue.
    expect(caches).toContainEqual(['themes', 'ruse,animaux']);
  });

  it('sans filtre posé, aucun champ caché — le contre-test', () => {
    // Sans lui, un composant qui émettrait toujours des champs vides
    // passerait le test précédent en polluant chaque URL de recherche.
    const { container } = render(
      <ChampRecherche langue="fr" action="/fr/catalogue" filtres={FILTRES_VIDES} />,
    );

    expect(container.querySelectorAll('input[type="hidden"]').length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACCESSIBILITÉ DE LA CARTE
// ═══════════════════════════════════════════════════════════════════════════

describe('accessibilité de la carte', () => {
  it('le lien couvre le titre, et mène à la fiche préfixée par la langue', () => {
    render(<CarteLivre langue="en" entree={entree()} />);

    const lien = screen.getByRole('link');
    expect(lien.getAttribute('href')).toBe('/en/contes/anansi-l-araignee');
    expect(within(lien).getByRole('heading', { level: 2 }).textContent).toBe('Anansi l’araignée');
  });

  it('la couverture est décorative — le titre porte le nom', () => {
    // Un `alt` reprenant le titre le ferait annoncer DEUX FOIS par un lecteur
    // d'écran, puisque le titre est déjà dans le lien.
    const { container } = render(<CarteLivre langue="fr" entree={entree()} />);

    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });
});
