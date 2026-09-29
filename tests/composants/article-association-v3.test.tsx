import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ArticleAssociationV3 } from '@/components/v2/article-association-v3';
import type { ContenuAssociatifDetaille } from '@/lib/association/service';

/**
 * L'ARTICLE DE L'ESPACE ADHÉRENT — ce que la refonte ne doit jamais perdre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL DÉFAUT COMPTE ICI, ET IL EST SILENCIEUX.                        │
 * │                                                                          │
 * │ Si le corps d'un contenu réservé se rendait à un visiteur, l'écran       │
 * │ n'aurait l'air de rien : il montrerait un article, ce qui est            │
 * │ exactement ce qu'on attend d'une page d'article. Personne ne le          │
 * │ signalerait — surtout pas le lecteur qui en profite.                     │
 * │                                                                          │
 * │ La garde réelle est en base : `corps` n'est accordé ni à `anon` ni à     │
 * │ `authenticated`, et `sections` vaut `null` quand `can_read` est faux.    │
 * │ Ces tests éprouvent le MAILLON D'AFFICHAGE — qu'un composant redessiné   │
 * │ ne se mette pas à rendre ce qu'on ne lui a pas donné, par exemple en     │
 * │ repliant sur une valeur par défaut.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const BASE: ContenuAssociatifDetaille = {
  slug: 'sur-le-terrain',
  titre: 'Sur le terrain avec l’Association DAVE',
  chapeau: 'Ce que trois ans de missions nous ont appris.',
  categorie: 'actions',
  acces: 'abonnes',
  publieLe: '2026-09-01T09:00:00.000Z',
  minutes: 3,
  imageUrl: null,
  peutLire: false,
  /* LU, jamais déduit : c'est la base qui dit pourquoi l'accès est fermé. */
  motif: 'none',
  blocs: null,
};

const OUVERT: ContenuAssociatifDetaille = {
  ...BASE,
  peutLire: true,
  motif: 'subscription',
  /*
   * Les SEPT types de blocs, pour que le rendu de CHACUN soit éprouvé. Un
   * `switch` à qui il manque une branche ne rend rien pour ce type — et une
   * citation qui disparaît ne laisse aucune trace à l'écran.
   */
  blocs: [
    { type: 'intertitre', texte: 'La puissance d’un outil adapté' },
    { type: 'paragraphe', texte: 'Sur le terrain, nous mesurons chaque jour la puissance du conte.' },
    { type: 'liste', elements: ['Un atelier par trimestre', 'Deux écoles partenaires'] },
    { type: 'citation', texte: 'Un livre lu à voix haute change une salle entière.' },
    { type: 'photo', url: '/images/association/logo-dave.jpg', legende: 'Atelier de Douala' },
    { type: 'video', url: '/medias/atelier-douala.mp4', legende: 'Trois minutes d’atelier' },
    { type: 'audio', url: '/medias/temoignage-awa.mp3', legende: 'Awa, mère de deux enfants' },
  ],
};

describe('l’article de l’espace adhérent', () => {
  it('rend le corps quand la base l’a donné', () => {
    render(<ArticleAssociationV3 langue="fr" contenu={OUVERT} aLireEnsuite={[]} />);

    expect(screen.getByText('La puissance d’un outil adapté')).toBeTruthy();
    expect(screen.getByText(/nous mesurons chaque jour/)).toBeTruthy();
    expect(screen.getByText('Deux écoles partenaires')).toBeTruthy();
    expect(screen.getByText(/change une salle entière/)).toBeTruthy();
    expect(screen.getByText('Atelier de Douala')).toBeTruthy();
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN MÉDIA QUI NE SE REND PAS NE LAISSE PAS DE TROU — IL NE LAISSE     │
   * │ RIEN.                                                                 │
   * │                                                                      │
   * │ Une branche manquante du `switch` rend `undefined`, et React n'écrit  │
   * │ alors rien du tout. La page reste parfaitement présentable, avec la   │
   * │ vidéo en moins — et la légende avec elle, donc pas même une phrase    │
   * │ orpheline pour le signaler.                                           │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('rend la VIDÉO et le SON du corps, chacun avec sa légende', () => {
    const { container } = render(
      <ArticleAssociationV3 langue="fr" contenu={OUVERT} aLireEnsuite={[]} />,
    );

    const video = container.querySelector('video');
    const audio = container.querySelector('audio');

    expect(video?.getAttribute('src')).toBe('/medias/atelier-douala.mp4');
    expect(audio?.getAttribute('src')).toBe('/medias/temoignage-awa.mp3');
    expect(screen.getByText('Trois minutes d’atelier')).toBeTruthy();
    expect(screen.getByText('Awa, mère de deux enfants')).toBeTruthy();
  });

  it('ne télécharge AUCUN média avant qu’on appuie — §5.1', () => {
    /*
     * Une part importante du public est sur réseau mobile lent. Un média qui
     * se charge de lui-même dépense un forfait que personne n'a engagé, et la
     * perte ne se voit que sur la facture.
     *
     * `playsInline` compte autant : sans lui, Safari sur iPhone passe en
     * plein écran dès la lecture et arrache le lecteur à l'article.
     */
    const { container } = render(
      <ArticleAssociationV3 langue="fr" contenu={OUVERT} aLireEnsuite={[]} />,
    );

    for (const media of container.querySelectorAll('video, audio')) {
      expect(media.getAttribute('preload')).toBe('none');
    }
    expect(container.querySelector('video')?.hasAttribute('playsinline')).toBe(true);
  });

  it('NE REND AUCUN corps quand `sections` est nul — il rend le mur', () => {
    const { container } = render(
      <ArticleAssociationV3 langue="fr" contenu={BASE} aLireEnsuite={[]} />,
    );

    /*
     * On n'interroge pas « le mur est-il là » : on vérifie que le conteneur
     * du corps n'existe PAS. Un composant qui replierait sur un corps vide
     * passerait le premier contrôle et raterait celui-ci.
     *
     * Viser le conteneur et non les balises : le MUR porte lui aussi un `h2`
     * et des `p`, et un sélecteur qui les compterait trouverait trois
     * éléments sur une page où rien n'a fuité.
     */
    const corps = container.querySelector('[class*="corps"]');
    expect(corps).toBeNull();
    expect(screen.queryByText(/nous mesurons chaque jour/)).toBeNull();
  });

  it('dit dans la ligne de méta que le contenu est réservé, avant de le montrer', () => {
    // « Réservé aux adhérents » se lit AVEC la date, pas après le chapeau :
    // le lecteur sait ce qu'il n'a pas avant d'avoir fini de lire l'accroche.
    render(<ArticleAssociationV3 langue="fr" contenu={BASE} aLireEnsuite={[]} />);

    expect(screen.getByText('Réservé aux adhérents')).toBeTruthy();
  });

  it('ne dit PAS « réservé » sur un contenu ouvert', () => {
    render(<ArticleAssociationV3 langue="fr" contenu={OUVERT} aLireEnsuite={[]} />);

    expect(screen.queryByText('Réservé aux adhérents')).toBeNull();
  });

  it('offre les DEUX portes du mur : adhérer, et se connecter', () => {
    /*
     * Un adhérent déjà inscrit qui tombe sur ce mur n'a pas besoin d'adhérer,
     * il a besoin de se connecter. Sans le second lien, il repartirait en
     * croyant devoir payer une seconde fois.
     */
    render(<ArticleAssociationV3 langue="fr" contenu={BASE} aLireEnsuite={[]} />);

    expect(screen.getByRole('link', { name: 'Adhérer à l’association' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'J’ai déjà un compte' })).toBeTruthy();
  });

  it('garde le lien de retour vers la liste, dans la langue de la page', () => {
    render(<ArticleAssociationV3 langue="en" contenu={OUVERT} aLireEnsuite={[]} />);

    const retour = screen.getByRole('link', { name: 'All contents' });
    expect(retour.getAttribute('href')).toBe('/en/association');
  });

  it('rend la date en UTC — une date à minuit ne recule pas d’un jour', () => {
    /*
     * `publieLe` vaut le 1ᵉʳ septembre à 09:00 UTC. Sans `timeZone: 'UTC'`,
     * un lecteur à l'ouest de Greenwich lirait « 31 août » — et la liste,
     * rendue ailleurs, afficherait l'autre date pour le même contenu.
     */
    render(<ArticleAssociationV3 langue="fr" contenu={OUVERT} aLireEnsuite={[]} />);

    expect(screen.getByText('1 septembre 2026')).toBeTruthy();
  });
});
