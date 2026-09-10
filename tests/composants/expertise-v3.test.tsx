import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ExpertiseV3 } from '@/components/v2/expertise-v3';
import { REALISATIONS, lirePresentationConsulting } from '@/content/consulting';
import { IDENTITE_EDITEUR } from '@/content/editorial';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ EXPERTISE & CONSEIL — L'ÉCRAN ORGANIC.                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Les mesures se vérifient dans un navigateur, contre le prototype. Ce fichier
 * défend ce qu'un remaniement casserait sans bruit : les tarifs affichés tels
 * qu'ils sont écrits, la recommandation portée par UNE seule carte, et les
 * deux ornements qui ne doivent jamais s'annoncer.
 */
const FR = lirePresentationConsulting('fr');

describe('le héros', () => {
  it('porte le titre, la promesse et son argument', () => {
    render(<ExpertiseV3 langue="fr" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(FR.titre);
    expect(screen.getByText(FR.accroche)).toBeTruthy();
    expect(screen.getByText(FR.argument)).toBeTruthy();
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE SECOND BOUTON EST UNE ANCRE, ET ELLE DOIT TOMBER QUELQUE PART.    │
   * │                                                                      │
   * │ « Voir les tarifs » descend jusqu'au bloc des offres. Une ancre qui   │
   * │ ne trouve pas sa cible ne lève rien : le clic ne fait simplement     │
   * │ rien, et personne ne s'en aperçoit avant un utilisateur.             │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('le bouton des tarifs descend jusqu’à une ancre qui EXISTE', () => {
    const { container } = render(<ExpertiseV3 langue="fr" />);

    const lien = screen.getByRole('link', { name: FR.actionTarifs });
    const ancre = lien.getAttribute('href') ?? '';

    expect(ancre.startsWith('#')).toBe(true);
    expect(container.querySelector(`[id="${ancre.slice(1)}"]`)).toBeTruthy();
  });

  it('le bouton d’appel mène à la page de contact', () => {
    render(<ExpertiseV3 langue="fr" />);
    expect(
      screen.getByRole('link', { name: FR.actionAccompagnement }).getAttribute('href'),
    ).toBe('/fr/contact');
  });

  /**
   * Le panneau porte la certification ET les trois engagements. Le prototype
   * n'a pas les seconds ; ce sont les trois objections qu'un directeur
   * d'école oppose à un cabinet, et les perdre pour tenir une hauteur
   * reviendrait à laisser une maquette décider d'un argument de vente.
   */
  it('le panneau de preuve porte les deux paragraphes ET les trois engagements', () => {
    const { container } = render(<ExpertiseV3 langue="fr" />);
    const panneau = container.querySelector('[class*=preuve]') as HTMLElement;
    const section = FR.sections[0];

    for (const paragraphe of section?.paragraphes ?? []) {
      expect(within(panneau).getByText(paragraphe)).toBeTruthy();
    }
    expect(within(panneau).getAllByRole('listitem')).toHaveLength(section?.points?.length ?? 0);
  });

  it('le disque du héros est décoratif', () => {
    const { container } = render(<ExpertiseV3 langue="fr" />);
    expect(container.querySelector('[class*=heroCercle]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});

describe('les trois prestations', () => {
  it('sont une liste ORDONNÉE de trois entrées', () => {
    const { container } = render(<ExpertiseV3 langue="fr" />);
    const liste = container.querySelector('ol') as HTMLElement;

    /*
     * Les ENFANTS DIRECTS, et non tous les `listitem` : chaque carte porte
     * elle-même une liste de bénéfices, et un parcours par rôle en compterait
     * douze. C'est le genre de test qui passe au vert pour la mauvaise raison
     * si on ne le regarde pas de près.
     */
    const cartes = [...liste.children].filter((n) => n.tagName === 'LI');
    expect(cartes).toHaveLength(FR.prestations.length);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE TARIF EST UNE PHRASE, PAS UN NOMBRE.                              │
   * │                                                                      │
   * │ « À partir de 75 000 FCFA » s'affiche tel qu'il est écrit dans        │
   * │ `src/content/consulting.ts`. Rien ici ne le reformate : le franc CFA  │
   * │ n'a pas de sous-unité, et une division par cent écrite dans un écran  │
   * │ multiplierait l'erreur par cent sur chaque ligne. C'est la même règle │
   * │ que `prix.affichage` sur le catalogue, et un test d'architecture la   │
   * │ tient déjà pour les montants qui viennent du serveur.                 │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('affichent le tarif TEL QU’IL EST ÉCRIT, sa réserve comprise', () => {
    render(<ExpertiseV3 langue="fr" />);

    for (const prestation of FR.prestations) {
      expect(screen.getByText(prestation.tarif)).toBeTruthy();
      if (prestation.tarifPrecision) {
        expect(screen.getByText(prestation.tarifPrecision)).toBeTruthy();
      }
    }
  });

  /**
   * UNE SEULE pastille « Le plus demandé ».
   *
   * Trois cartes toutes recommandées ne recommandent rien. Ce test tient les
   * deux bouts : la pastille existe, et elle est unique.
   */
  it('une seule carte porte la recommandation', () => {
    const { container } = render(<ExpertiseV3 langue="fr" />);
    const pastilles = container.querySelectorAll('[class*=pastilleVedette]');

    expect(pastilles).toHaveLength(1);
    expect(pastilles[0]?.textContent).toBe(
      FR.prestations.find((p) => p.vedette)?.vedette,
    );
  });

  /**
   * Le numéro est un ORNEMENT : la liste est déjà ordonnée, et un lecteur
   * d'écran annonce « élément 2 sur 3 ». L'énoncer une seconde fois ferait
   * entendre « deux, deux, la formation des équipes ».
   */
  it('les numéros ne s’annoncent pas, la recommandation si', () => {
    const { container } = render(<ExpertiseV3 langue="fr" />);

    const rangs = [...container.querySelectorAll('[class*=_rang_]')];
    expect(rangs).toHaveLength(3);
    expect(rangs.every((r) => r.getAttribute('aria-hidden') === 'true')).toBe(true);

    // La pastille, elle, porte une information qu'aucun autre élément ne donne.
    const pastille = container.querySelector('[class*=pastilleVedette]');
    expect(pastille?.getAttribute('aria-hidden')).toBeNull();
  });

  it('chaque carte mène au devis, c’est-à-dire au contact', () => {
    render(<ExpertiseV3 langue="fr" />);

    const boutons = screen.getAllByRole('link', { name: FR.actionDevis });
    expect(boutons).toHaveLength(FR.prestations.length);
    expect(boutons.every((b) => b.getAttribute('href') === '/fr/contact')).toBe(true);
  });
});

describe('les réalisations', () => {
  it('montrent les onze visuels, chacun légendé', () => {
    const { container } = render(<ExpertiseV3 langue="fr" />);
    const mosaique = container.querySelector('[class*=mosaique]') as HTMLElement;

    expect(mosaique.querySelectorAll('figure')).toHaveLength(REALISATIONS.length);
    for (const realisation of REALISATIONS) {
      expect(within(mosaique).getByText(FR.legendes[realisation.cle])).toBeTruthy();
    }
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA LÉGENDE EST VISIBLE — DONC L'IMAGE NE LA RÉPÈTE PAS.              │
   * │                                                                      │
   * │ Le prototype met la même phrase dans `alt` ET dans `figcaption`. Un   │
   * │ lecteur d'écran l'entend alors deux fois de suite, la première        │
   * │ annoncée comme une image. C'est précisément ce que                    │
   * │ `tests/unit/images-discipline.test.ts` interdit, et c'est l'un des    │
   * │ rares points où suivre le dossier à la lettre serait une faute.       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('aucune image ne recopie sa légende', () => {
    const { container } = render(<ExpertiseV3 langue="fr" />);
    const images = [...container.querySelectorAll('[class*=mosaique] img')];

    expect(images).toHaveLength(REALISATIONS.length);
    expect(images.every((i) => i.getAttribute('alt') === '')).toBe(true);
    // Les dimensions réservent la place : onze images sur une même page.
    expect(images.every((i) => i.hasAttribute('width') && i.hasAttribute('height'))).toBe(true);
  });

  /**
   * La vidéo pèse un mégaoctet et demi. §5.1 : une part importante du public
   * est sur réseau mobile lent, et une vidéo qui se télécharge d'elle-même
   * dépense un forfait que personne n'a engagé.
   */
  it('la vidéo ne se télécharge pas toute seule', () => {
    const { container } = render(<ExpertiseV3 langue="fr" />);
    const video = container.querySelector('video');

    expect(video?.getAttribute('preload')).toBe('none');
    expect(video?.getAttribute('poster')).toBeTruthy();
  });
});

describe('l’appel au contact', () => {
  it('écrit le numéro en toutes lettres, et le rend composable', () => {
    render(<ExpertiseV3 langue="fr" />);

    const appel = screen.getByRole('link', { name: IDENTITE_EDITEUR.telephone });
    expect(appel.getAttribute('href')).toBe(
      `tel:${IDENTITE_EDITEUR.telephone.replace(/\s/g, '')}`,
    );
  });

  it('le second bouton mène à la page de contact', () => {
    render(<ExpertiseV3 langue="fr" />);
    expect(screen.getByRole('link', { name: FR.appel.action }).getAttribute('href')).toBe(
      '/fr/contact',
    );
  });
});

describe('les deux langues', () => {
  /**
   * Les tarifs sont les MÊMES des deux côtés — ce sont des montants, pas des
   * traductions. Le reste change ; eux non.
   */
  it('les montants ne se traduisent pas', () => {
    const en = lirePresentationConsulting('en');

    for (const [rang, prestation] of FR.prestations.entries()) {
      const chiffresFr = prestation.tarif.replace(/\D/g, '');
      const chiffresEn = en.prestations[rang]?.tarif.replace(/\D/g, '');
      expect(chiffresEn).toBe(chiffresFr);
    }
  });

  it('l’écran anglais rend l’anglais', () => {
    const en = lirePresentationConsulting('en');
    render(<ExpertiseV3 langue="en" />);

    expect(screen.getByText(en.accroche)).toBeTruthy();
    expect(screen.getByRole('link', { name: en.actionTarifs })).toBeTruthy();
  });
});
