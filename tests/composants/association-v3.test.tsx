import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { AssociationV3 } from '@/components/v2/association-v3';
import { lirePresentationAssociation } from '@/content/association';
import type { ContenuAssociatif } from '@/lib/association/service';
import { traduire } from '@/i18n';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ L'ASSOCIATION DAVE — L'ÉCRAN ORGANIC.                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Les mesures se vérifient dans un navigateur, contre le prototype — jsdom ne
 * calcule pas de mise en page. Ce fichier défend ce qu'un remaniement
 * casserait sans bruit : le cadenas LU plutôt que déduit, les textes du
 * propriétaire affichés tels qu'ils sont écrits, l'ancre qui tombe quelque
 * part, et les contenus qui ne se perdent pas au-delà du troisième.
 */
const FR = lirePresentationAssociation('fr');

/** Un contenu de démonstration — tout est faux sauf la FORME. */
function contenu(partiel: Partial<ContenuAssociatif> & { slug: string }): ContenuAssociatif {
  return {
    categorie: 'actions',
    acces: 'libre',
    publieLe: '2026-09-01T00:00:00.000Z',
    minutes: 3,
    imageUrl: null,
    vedette: false,
    titre: `Titre ${partiel.slug}`,
    chapeau: `Chapeau ${partiel.slug}`,
    peutLire: true,
    motif: 'free',
    ...partiel,
  };
}

/** Le nombre de contenus que la maquette dessine : un en grand, deux à côté. */
const TROIS = [contenu({ slug: 'a' }), contenu({ slug: 'b' }), contenu({ slug: 'c' })];

describe('le héros', () => {
  it('porte le sur-titre, le titre et les deux paragraphes du propriétaire', () => {
    render(<AssociationV3 langue="fr" contenus={TROIS} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(FR.titre);
    expect(screen.getByText(FR.chapeau)).toBeTruthy();
    expect(screen.getByText(FR.chapeauSecond)).toBeTruthy();
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ AUCUN MONTANT N'EST ÉCRIT SUR CET ÉCRAN.                             │
   * │                                                                      │
   * │ Les formules et leurs prix vivent dans `subscription_plans` /         │
   * │ `plan_prices` depuis la migration 0068, et dépendent de la zone       │
   * │ d'encaissement. Les deux boutons mènent au TUNNEL, avec le domaine    │
   * │ dans l'adresse : c'est lui qui lit les offres.                        │
   * │                                                                      │
   * │ Le domaine est `association`, jamais `lecture` — les deux abonnements │
   * │ sont étanches, et se tromper de domaine vendrait le catalogue à qui   │
   * │ voulait adhérer.                                                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('le bouton d’adhésion mène au tunnel, avec le domaine « association »', () => {
    render(<AssociationV3 langue="fr" contenus={TROIS} />);

    expect(screen.getByRole('link', { name: FR.appel.action }).getAttribute('href')).toBe(
      '/fr/abonnement/souscrire?domaine=association',
    );
  });

  /**
   * Une ancre qui ne trouve pas sa cible ne lève rien : le clic ne fait
   * simplement rien, et personne ne s'en aperçoit avant un utilisateur.
   */
  it('le bouton des récits descend jusqu’à une ancre qui EXISTE', () => {
    const { container } = render(<AssociationV3 langue="fr" contenus={TROIS} />);

    const ancre = screen.getByRole('link', { name: FR.actionRecits }).getAttribute('href') ?? '';

    expect(ancre.startsWith('#')).toBe(true);
    expect(container.querySelector(`[id="${ancre.slice(1)}"]`)).toBeTruthy();
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE LOGO PORTE LE NOM ET LA DEVISE — EN PIXELS.                       │
   * │                                                                      │
   * │ Son `alt` les écrit, et c'est `logoAlt` : une donnée éditoriale       │
   * │ nommée pour cet usage, l'exception que `images-discipline` énonce      │
   * │ lui-même. Les deux photographies décrivent ce qu'elles montrent.      │
   * │                                                                      │
   * │ Le test vérifie aussi que les trois textes sont DISTINCTS : trois     │
   * │ images qui se présentent de la même façon ne disent rien de plus      │
   * │ qu'une seule.                                                         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('le collage nomme ses trois images, et les trois différemment', () => {
    const { container } = render(<AssociationV3 langue="fr" contenus={TROIS} />);
    const collage = container.querySelector('[class*="_collage_"]') as HTMLElement;

    const textes = [...collage.querySelectorAll('img')].map((image) => image.getAttribute('alt'));

    expect(textes).toEqual([FR.logoAlt, ...FR.collage.map((photo) => photo.alt)]);
    expect(new Set(textes).size).toBe(3);
  });
});

describe('la bande de l’action de terrain', () => {
  it('porte les trois axes, avec leur numéro caché aux lecteurs d’écran', () => {
    const { container } = render(<AssociationV3 langue="fr" contenus={TROIS} />);
    const bande = container.querySelector('[class*="_bande_"]') as HTMLElement;

    expect(within(bande).getByRole('heading', { level: 2 }).textContent).toBe(
      FR.sections[0]?.titre,
    );

    const axes = within(bande).getAllByRole('listitem');
    expect(axes).toHaveLength(FR.axes.length);

    for (const [rang, axe] of FR.axes.entries()) {
      const carte = axes[rang] as HTMLElement;
      expect(within(carte).getByText(axe.titre)).toBeTruthy();
      expect(within(carte).getByText(axe.corps)).toBeTruthy();
      // Le numéro est un ORNEMENT : la liste est déjà ordonnée.
      expect(carte.querySelector(`[aria-hidden="true"]`)?.textContent).toBe(axe.numero);
    }
  });
});

describe('adhérer', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LES TROIS MISES EN GARDE SONT LA RÈGLE MÉTIER CENTRALE.              │
   * │                                                                      │
   * │ Deux abonnements étanches, et aucun des deux n'ouvre le               │
   * │ téléchargement. C'est ce que le cahier des charges §3.6 pose et ce    │
   * │ qu'on se trompe à supposer. Les perdre au fil d'un remaniement de     │
   * │ mise en page laisserait la page promettre le contraire de la base.    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la carte de mises en garde porte les trois notes, telles qu’elles sont écrites', () => {
    const { container } = render(<AssociationV3 langue="fr" contenus={TROIS} />);
    const notes = container.querySelector('[class*="_notes_"]') as HTMLElement;

    expect(within(notes).getByText(FR.notesTitre)).toBeTruthy();

    const attendues = FR.sections[1]?.points ?? [];
    const rendues = within(notes)
      .getAllByRole('listitem')
      .map((item) => item.textContent);

    expect(attendues.length).toBeGreaterThan(0);
    expect(rendues).toEqual([...attendues]);
  });

  it('les trois façons de soutenir portent chacune leur pictogramme', () => {
    const { container } = render(<AssociationV3 langue="fr" contenus={TROIS} />);
    const cartes = container.querySelectorAll('[class*="_soutien_"]');

    expect(cartes).toHaveLength(FR.soutiens.length);
    for (const [rang, soutien] of FR.soutiens.entries()) {
      const carte = cartes[rang] as HTMLElement;
      expect(within(carte).getByText(soutien.titre)).toBeTruthy();
      expect(within(carte).getByText(soutien.corps)).toBeTruthy();
      expect(carte.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    }
  });

  /**
   * La rangée n'a PAS de titre visible — le prototype ne lui en donne pas.
   * Elle en a un caché, sans quoi elle n'a pas d'étiquette dans la liste des
   * repères d'un lecteur d'écran.
   */
  it('la rangée sans titre visible en porte quand même un', () => {
    render(<AssociationV3 langue="fr" contenus={TROIS} />);

    const titres = screen
      .getAllByRole('heading', { level: 2 })
      .map((titre) => titre.textContent);

    expect(titres).toContain(FR.sections[2]?.titre);
  });

  it('la citation ferme la page, et son bouton mène au même tunnel', () => {
    render(<AssociationV3 langue="fr" contenus={TROIS} />);

    expect(screen.getByText(FR.citation)).toBeTruthy();
    expect(screen.getByText(FR.citationRelance)).toBeTruthy();
    expect(screen.getByRole('link', { name: FR.appel.titre }).getAttribute('href')).toBe(
      '/fr/abonnement/souscrire?domaine=association',
    );
  });
});

describe('les contenus', () => {
  it('la liste vide le DIT, plutôt que de disparaître', () => {
    const { container } = render(<AssociationV3 langue="fr" contenus={[]} />);

    expect(screen.getByText(traduire('fr', 'v2.assoVide'))).toBeTruthy();

    // Aucun contenu — donc aucune carte, dans la section des contenus.
    const section = container.querySelector('[class*="_sectionArticles_"]') as HTMLElement;
    expect(within(section).queryAllByRole('listitem')).toEqual([]);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ AUCUN CONTENU NE SE PERD AU-DELÀ DU TROISIÈME.                       │
   * │                                                                      │
   * │ La maquette en dessine trois — un en grand, deux à côté. La base en   │
   * │ a huit. Les suivants prennent la même carte-ligne dans une grille en  │
   * │ dessous ; ils ne sont ni tronqués ni renvoyés à une page qui          │
   * │ n'existe pas.                                                         │
   * │                                                                      │
   * │ C'est la coupure qu'un remaniement fait sans bruit : `slice(0, 2)`    │
   * │ suffit à faire disparaître cinq récits publiés.                       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('les huit contenus sont TOUS rendus, chacun avec son lien', () => {
    const huit = Array.from({ length: 8 }, (_, rang) =>
      contenu({ slug: `contenu-${String(rang)}` }),
    );

    render(<AssociationV3 langue="fr" contenus={huit} />);

    for (const item of huit) {
      expect(screen.getByRole('link', { name: new RegExp(item.titre) })).toBeTruthy();
    }
  });

  it('chaque lien pointe la fiche du contenu, dans la langue servie', () => {
    render(<AssociationV3 langue="en" contenus={TROIS} />);

    for (const item of TROIS) {
      expect(
        screen.getByRole('link', { name: new RegExp(item.titre) }).getAttribute('href'),
      ).toBe(`/en/association/${item.slug}`);
    }
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE CADENAS EST LU, JAMAIS DÉDUIT.                                    │
   * │                                                                      │
   * │ La pastille suit `peutLire` — la valeur rendue par                    │
   * │ `access_for_association` — et RIEN D'AUTRE. Les deux contenus de ce   │
   * │ test portent le même `acces`, `abonnes` : si l'écran regardait ce     │
   * │ champ plutôt que le verdict, il poserait deux cadenas ou aucun.       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('la pastille ne paraît que sur ce qui est fermé À CE LECTEUR', () => {
    const ferme = contenu({ slug: 'ferme', acces: 'abonnes', peutLire: false, motif: 'preview' });
    const ouvert = contenu({ slug: 'ouvert', acces: 'abonnes', peutLire: true, motif: 'subscription' });

    render(<AssociationV3 langue="fr" contenus={[ferme, ouvert]} />);

    const pastilles = screen.getAllByText(traduire('fr', 'v2.assoReserve'));
    expect(pastilles).toHaveLength(1);

    const carte = screen.getByRole('link', { name: new RegExp(ferme.titre) });
    expect(carte.textContent).toContain(traduire('fr', 'v2.assoReserve'));
  });

  /**
   * Les vignettes sont DÉCORATIVES : le titre est écrit à côté, et la carte
   * entière est le lien. Un `alt` qui reprendrait le titre ferait annoncer
   * deux fois la même phrase, la première annoncée comme une image.
   */
  it('les vignettes des contenus sont décoratives', () => {
    const { container } = render(<AssociationV3 langue="fr" contenus={TROIS} />);
    const section = container.querySelector('[class*="_sectionArticles_"]') as HTMLElement;

    const images = [...section.querySelectorAll('img')];
    expect(images.length).toBe(TROIS.length);
    for (const image of images) expect(image.getAttribute('alt')).toBe('');
  });

  /**
   * La date est formatée en UTC : sans le fuseau explicite, une date à minuit
   * recule d'un jour pour tout lecteur à l'ouest de Greenwich — et le récit
   * publié le 1er septembre s'affiche daté du 31 août.
   */
  it('la date d’un contenu ne recule pas d’un jour', () => {
    render(
      <AssociationV3
        langue="fr"
        contenus={[contenu({ slug: 'date', publieLe: '2026-09-01T00:00:00.000Z' })]}
      />,
    );

    expect(screen.getByText(/1 septembre 2026/)).toBeTruthy();
  });
});
