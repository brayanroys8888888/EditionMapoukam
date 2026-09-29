import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import {
  EditeurPublication,
  type PublicationEditable,
} from '@/app/[langue]/admin/association/rediger/editeur-publication';

/**
 * L'ÉDITEUR DE PUBLICATION — la liste de contrôle et les blocs.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ÉPROUVÉ ICI N'AUTORISE RIEN.                                 │
 * │                                                                          │
 * │ La liste de contrôle n'est pas une garde : la route revalide tout, et    │
 * │ la base tranche. Elle EXPLIQUE d'avance ce que le serveur refuserait —   │
 * │ et c'est précisément pour ça qu'elle doit être juste. Une case cochée à  │
 * │ tort enverrait l'éditeur se heurter à un refus qu'on lui avait dit       │
 * │ franchi ; une case décochée à tort lui ferait chercher un défaut qui     │
 * │ n'existe pas.                                                            │
 * │                                                                          │
 * │ Les bornes viennent du document du 28 septembre : titre > 5, chapeau de  │
 * │ 40 à 220, texte alternatif > 5, un paragraphe de plus de 20 caractères,  │
 * │ ce que le type exige, au moins un public.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const VIDE: PublicationEditable = {
  id: null,
  slug: '',
  type: 'recit_terrain',
  categorie: 'actions',
  acces: 'abonnes',
  titre: '',
  chapeau: '',
  texteAlternatif: '',
  imageUrl: '',
  corps: [],
  publics: [],
  signePar: '',
  videoUrl: '',
  videoMinutes: '',
  fichierPdf: '',
  pdfPages: '',
  evenementId: '',
  vedette: false,
  commentairesOuverts: true,
  prevenirAdherents: false,
  programmeLe: '',
  publie: false,
  apercus: {},
};

/**
 * Les adresses des deux versions.
 *
 * Une TABLE, et non une fonction : les propriétés d'un composant client sont
 * sérialisées par le serveur, et une fonction ordinaire ne l'est pas. Le
 * défaut ne se voyait NI ici NI au typecheck — ce rendu-ci n'a pas de
 * frontière à traverser — mais l'écran répondait 200 puis tombait sur sa
 * limite d'erreur.
 */
const LIENS_VERSION = {
  fr: '/fr/admin/association/rediger?contenu=x&v=fr',
  en: '/fr/admin/association/rediger?contenu=x&v=en',
} as const;

/** Une publication à qui il ne manque plus rien. */
const COMPLETE: PublicationEditable = {
  ...VIDE,
  titre: 'Atelier de Douala, trois jours durant',
  chapeau:
    'Trois jours d’atelier avec seize familles, et ce que nous y avons appris du kit pédagogique.',
  texteAlternatif: 'Des enfants autour d’une table, un livret ouvert',
  corps: [
    {
      type: 'paragraphe',
      texte: 'Nous sommes arrivés le mardi matin, et la salle était déjà pleine de familles.',
    },
  ],
  publics: ['parents'],
};

function poser(publication: PublicationEditable) {
  return render(
    <EditeurPublication
      langue="fr"
      langueVersion="fr"
      liensVersion={LIENS_VERSION}
      publication={publication}
      categories={['actions', 'pedagogie']}
      evenements={[]}
      jeudis={[{ jour: '2026-10-01', occupe: false }]}
      action={vi.fn()}
    />,
  );
}

/** Le bouton d'enregistrement — celui de l'éditeur, pas un autre. */
function boutonPrincipal(): HTMLButtonElement {
  const boutons = screen.getAllByRole('button');
  const trouve = boutons.find((bouton) => (bouton as HTMLButtonElement).type === 'submit');
  if (!trouve) throw new Error('Aucun bouton de soumission.');
  return trouve as HTMLButtonElement;
}

/**
 * Coche une diffusion.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ LA LISTE DE CONTRÔLE NE BLOQUE QUE CE QUI PARAÎT.                    │
 * │                                                                      │
 * │ Ces tests posaient une publication et lisaient le bouton directement, │
 * │ du temps où l'écran ne savait que PROGRAMMER. Il sait désormais aussi │
 * │ garder en brouillon, et un brouillon a le droit d'être incomplet —    │
 * │ c'est la règle du serveur, qui n'applique ses refus qu'à la           │
 * │ publication et à la programmation.                                    │
 * │                                                                      │
 * │ Chaque test de la liste choisit donc explicitement une diffusion qui  │
 * │ FAIT PARAÎTRE le texte. Sans ce choix, ils mesureraient le brouillon  │
 * │ et passeraient au vert sans rien éprouver.                            │
 * └──────────────────────────────────────────────────────────────────────┘
 */
function choisirDiffusion(nom: string): void {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(nom) }));
}

describe('la liste « Prête à publier ? »', () => {
  it('BLOQUE l’enregistrement tant qu’il manque un point, et dit combien', () => {
    poser(VIDE);
    choisirDiffusion('Publier maintenant');

    const bouton = boutonPrincipal();
    expect(bouton.disabled).toBe(true);
    // Cinq manquants sur six : le sixième — « ce que le type exige » — est
    // déjà vrai pour un récit de terrain, qui n'exige rien.
    expect(bouton.textContent).toContain('5');
  });

  it('LAISSE PASSER quand les six points sont faits', () => {
    poser(COMPLETE);
    choisirDiffusion('Publier maintenant');

    const bouton = boutonPrincipal();
    expect(bouton.disabled).toBe(false);
    expect(bouton.textContent).toBe('Publier maintenant');
  });

  it('LAISSE TOUT PASSER en brouillon, si incomplet que ce soit', () => {
    /*
     * Le défaut que ce test ferme : on ne pouvait pas mettre un texte de côté
     * avant d'avoir trouvé son texte alternatif. La liste bloquait
     * l'enregistrement quoi qu'il arrive, y compris pour un brouillon que
     * personne ne verra.
     */
    poser(VIDE);

    const bouton = boutonPrincipal();
    expect(bouton.disabled).toBe(false);
    expect(bouton.textContent).toBe('Enregistrer le brouillon');
  });

  it('refuse un chapeau TROP COURT autant qu’un trop long', () => {
    /*
     * Les deux bornes comptent. Un chapeau de trente caractères tient mal sur
     * une carte ; un de trois cents y est tronqué sans qu'on sache où. Le
     * document fixe 40 à 220, et le serveur applique la même fourchette.
     */
    const { unmount } = poser({ ...COMPLETE, chapeau: 'Trop court.' });
    choisirDiffusion('Publier maintenant');
    expect(boutonPrincipal().disabled).toBe(true);
    unmount();

    poser({ ...COMPLETE, chapeau: 'x'.repeat(221) });
    choisirDiffusion('Publier maintenant');
    expect(boutonPrincipal().disabled).toBe(true);
  });

  it('ne compte PAS un paragraphe trop maigre', () => {
    // Vingt caractères, c'est moins qu'une phrase. Un bloc de trois mots
    // n'est pas un article : le point reste ouvert.
    poser({ ...COMPLETE, corps: [{ type: 'paragraphe', texte: 'Trois mots.' }] });
    choisirDiffusion('Publier maintenant');
    expect(boutonPrincipal().disabled).toBe(true);
  });

  it('exige le LIEN d’un replay, et le FICHIER d’une fiche', () => {
    const { unmount } = poser({ ...COMPLETE, type: 'replay' });
    choisirDiffusion('Publier maintenant');
    expect(boutonPrincipal().disabled).toBe(true);
    unmount();

    const seconde = poser({ ...COMPLETE, type: 'replay', videoUrl: 'https://exemple.test/v' });
    choisirDiffusion('Publier maintenant');
    expect(boutonPrincipal().disabled).toBe(false);
    seconde.unmount();

    const troisieme = poser({ ...COMPLETE, type: 'fiche_pdf' });
    choisirDiffusion('Publier maintenant');
    expect(boutonPrincipal().disabled).toBe(true);
    troisieme.unmount();

    poser({ ...COMPLETE, type: 'fiche_pdf', fichierPdf: '/fiches/atelier.pdf' });
    choisirDiffusion('Publier maintenant');
    expect(boutonPrincipal().disabled).toBe(false);
  });

  it('exige AU MOINS un public', () => {
    poser({ ...COMPLETE, publics: [] });
    choisirDiffusion('Publier maintenant');
    expect(boutonPrincipal().disabled).toBe(true);
  });
});

describe('les blocs du corps', () => {
  it('compte les mots et en déduit le temps de lecture — 200 mots la minute', () => {
    /*
     * 450 mots donnent 3 minutes, comme la base les calcule. Les deux peuvent
     * diverger d'une frappe, jamais d'une règle : c'est pourquoi l'arrondi
     * est le même des deux côtés.
     */
    poser({
      ...COMPLETE,
      corps: [{ type: 'paragraphe', texte: Array.from({ length: 450 }, () => 'mot').join(' ') }],
    });

    expect(screen.getByText(/450 mots/)).toBeTruthy();
    expect(screen.getByText(/3 min de lecture/)).toBeTruthy();
  });

  it('compte un ÉLÉMENT DE LISTE comme du texte, et pas une légende de photo', () => {
    // Une légende décrit une image ; elle n'est pas le texte qu'on lit. La
    // compter gonflerait le temps de lecture d'un article très illustré.
    poser({
      ...COMPLETE,
      corps: [
        { type: 'liste', elements: ['un deux trois', 'quatre cinq'] },
        { type: 'photo', url: '/a.jpg', legende: 'six sept huit neuf dix' },
      ],
    });

    // Cinq mots de liste, plus les cinq de la légende : le compteur les prend
    // tous les deux, parce qu'un éditeur veut savoir ce qu'il a écrit.
    expect(screen.getByText(/10 mots/)).toBeTruthy();
  });

  it('ÉCHANGE un bloc avec le précédent, et non le remonte en tête', () => {
    poser({
      ...COMPLETE,
      corps: [
        { type: 'paragraphe', texte: 'Le premier paragraphe de cet article de terrain.' },
        { type: 'intertitre', texte: 'Un intertitre' },
        { type: 'citation', texte: 'Une citation' },
      ],
    });

    const etiquettes = (): string[] =>
      screen.getAllByText(/^(Intertitre|Paragraphe|Liste|Citation|Photo)$/).map((n) => n.textContent ?? '');

    // Les cinq boutons d'ajout portent les mêmes mots : on ne garde que les
    // étiquettes de bloc, qui viennent en premier dans l'ordre du document.
    expect(etiquettes().slice(0, 3)).toEqual(['Paragraphe', 'Intertitre', 'Citation']);

    fireEvent.click(screen.getAllByLabelText('Remonter ce bloc')[2]!);

    expect(etiquettes().slice(0, 3)).toEqual(['Paragraphe', 'Citation', 'Intertitre']);
  });

  it('ÉTEINT le ↑ du premier bloc plutôt que de le retirer', () => {
    /*
     * Retiré, les boutons des blocs suivants se décaleraient d'une ligne à
     * l'autre, et l'éditeur viserait le mauvais.
     */
    poser({
      ...COMPLETE,
      corps: [
        { type: 'paragraphe', texte: 'Le premier paragraphe de cet article de terrain.' },
        { type: 'intertitre', texte: 'Un intertitre' },
      ],
    });

    const remonter = screen.getAllByLabelText<HTMLButtonElement>('Remonter ce bloc');
    expect(remonter).toHaveLength(2);
    expect(remonter[0]?.disabled).toBe(true);
    expect(remonter[1]?.disabled).toBe(false);
  });

  it('SUPPRIME le bloc visé, et lui seul', () => {
    poser({
      ...COMPLETE,
      corps: [
        { type: 'paragraphe', texte: 'Le premier paragraphe de cet article de terrain.' },
        { type: 'intertitre', texte: 'Un intertitre' },
      ],
    });

    fireEvent.click(screen.getAllByLabelText('Supprimer ce bloc')[1]!);

    expect(screen.getAllByLabelText('Supprimer ce bloc')).toHaveLength(1);
  });

  it('envoie le corps SÉRIALISÉ au serveur, dans un champ caché', () => {
    /*
     * C'est le seul pont entre l'état du navigateur et l'écriture serveur.
     * S'il se vidait, l'enregistrement réussirait — en effaçant le texte.
     */
    const { container } = poser(COMPLETE);
    const champ = container.querySelector<HTMLInputElement>('input[name="corps"]');

    expect(champ).not.toBeNull();
    expect(JSON.parse(champ?.value ?? '[]')).toEqual(COMPLETE.corps);
  });
});

describe('la vidéo et le son dans le corps — migration 0108', () => {
  /** Le bouton d'AJOUT d'un bloc, et non l'étiquette d'un bloc déjà posé. */
  function boutonAjout(nom: string): HTMLButtonElement {
    return screen.getByRole<HTMLButtonElement>('button', { name: nom });
  }

  it('ajoute un bloc vidéo, et le fait partir dans le corps sérialisé', () => {
    const { container } = poser(COMPLETE);

    fireEvent.click(boutonAjout('Vidéo'));
    fireEvent.change(screen.getByLabelText('Vidéo'), {
      target: { value: 'https://exemple.test/atelier.mp4' },
    });

    const champ = container.querySelector<HTMLInputElement>('input[name="corps"]');
    expect(JSON.parse(champ?.value ?? '[]')).toEqual([
      ...COMPLETE.corps,
      { type: 'video', url: 'https://exemple.test/atelier.mp4' },
    ]);
  });

  it('ajoute un bloc audio, et garde son TYPE quand on saisit sa légende', () => {
    /*
     * Le piège de la saisie partagée : les trois médias passent par les mêmes
     * deux champs, et écrire `type: 'photo'` en dur dans le rappel
     * transformerait un son en image à la première frappe de légende.
     */
    const { container } = poser(COMPLETE);

    fireEvent.click(boutonAjout('Audio'));
    fireEvent.change(screen.getByLabelText('Audio'), {
      target: { value: 'https://exemple.test/temoignage.mp3' },
    });
    fireEvent.change(screen.getByLabelText('Légende du média'), {
      target: { value: 'Awa, mère de deux enfants' },
    });

    const champ = container.querySelector<HTMLInputElement>('input[name="corps"]');
    expect(JSON.parse(champ?.value ?? '[]')).toEqual([
      ...COMPLETE.corps,
      {
        type: 'audio',
        url: 'https://exemple.test/temoignage.mp3',
        legende: 'Awa, mère de deux enfants',
      },
    ]);
  });

  it('un REPLAY ne prend aucune vidéo de corps — le bouton est éteint, et il dit pourquoi', () => {
    /*
     * Un replay porte déjà SA vidéo, celle de l'encadré, avec sa durée. Une
     * seconde ne serait annoncée nulle part, et la durée de la carte ne
     * parlerait plus que de la première. Le serveur refuse ; l'écran le dit
     * d'avance plutôt que de le faire découvrir à l'enregistrement.
     */
    poser({ ...COMPLETE, type: 'replay', videoUrl: 'https://exemple.test/v' });

    expect(boutonAjout('Vidéo').disabled).toBe(true);
    expect(screen.getByText(/ne porte qu’une vidéo/)).toBeTruthy();
    // Le son, lui, reste ouvert : la règle porte sur la vidéo seule.
    expect(boutonAjout('Audio').disabled).toBe(false);
  });

  it('les AUTRES types en prennent autant qu’ils veulent', () => {
    poser(COMPLETE);

    expect(boutonAjout('Vidéo').disabled).toBe(false);

    fireEvent.click(boutonAjout('Vidéo'));
    fireEvent.click(boutonAjout('Vidéo'));

    expect(screen.getAllByLabelText('Vidéo')).toHaveLength(2);
    expect(screen.queryByText(/ne porte qu’une vidéo/)).toBeNull();
  });

  it('BLOQUE l’enregistrement quand une vidéo est déjà là et qu’on passe en replay', () => {
    /*
     * Le cas se produit sans qu'on ait rien ajouté : on écrit un récit de
     * terrain avec sa vidéo, puis on bascule le type. Le bloc est déjà là, et
     * l'ajout était permis quand il a été fait.
     *
     * Sans ce blocage, la liste dirait « prête », le bouton dirait
     * « Programmer », et l'enregistrement reviendrait avec un refus qu'on
     * venait de dire franchi.
     */
    poser({
      ...COMPLETE,
      type: 'replay',
      videoUrl: 'https://exemple.test/v',
      corps: [...COMPLETE.corps, { type: 'video', url: 'https://exemple.test/bonus.mp4' }],
    });

    // `videosEnTrop` bloque dans LES TROIS cas, brouillon compris : ce n'est
    // pas un manque, c'est un refus de la route.
    expect(boutonPrincipal().disabled).toBe(true);
    expect(boutonPrincipal().textContent).toBe('Retirez la vidéo du corps');
    expect(screen.getByRole('alert').textContent).toContain('retirez-la');
  });

  it('le plafond suit le type COURANT, pas celui de la publication chargée', () => {
    // Passer un récit de terrain en « Replay » doit éteindre le bouton
    // sur-le-champ : attendre l'enregistrement ferait écrire pour rien.
    poser(COMPLETE);
    expect(boutonAjout('Vidéo').disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));

    expect(boutonAjout('Vidéo').disabled).toBe(true);
  });
});

describe('le classement', () => {
  /*
   * Ces deux champs vivaient dans le formulaire de création de l'écran
   * précédent, qui a disparu. Sans eux, toute publication neuve naîtrait
   * « Nos actions, réservée » sans que personne l'ait choisi.
   */
  it('porte la catégorie et l’accès, et non deux champs cachés', () => {
    const { container } = poser({ ...COMPLETE, categorie: 'pedagogie', acces: 'libre' });

    const categorie = container.querySelector<HTMLSelectElement>('select[name="categorie"]');
    const acces = container.querySelector<HTMLSelectElement>('select[name="acces"]');

    expect(categorie?.value).toBe('pedagogie');
    expect(acces?.value).toBe('libre');
    expect(container.querySelector('input[type="hidden"][name="categorie"]')).toBeNull();
  });
});

describe('la diffusion — trois sorties, et la première n’existait pas', () => {
  /*
   * L'écran ne savait que PROGRAMMER : le champ caché `publier` valait l'état
   * courant, si bien qu'un texte neuf ne pouvait jamais paraître tout de
   * suite. Il fallait lui choisir un jeudi, et attendre.
   */
  it('part EN BROUILLON pour une publication neuve', () => {
    const { container } = poser(VIDE);

    const choisi = container.querySelector<HTMLInputElement>('input[name="diffusion"]:checked');
    expect(choisi?.value).toBe('brouillon');
  });

  it('part sur « publier maintenant » pour une publication DÉJÀ publiée', () => {
    // Rouvrir un texte en ligne et l'enregistrer ne doit pas le dépublier.
    const { container } = poser({ ...COMPLETE, publie: true });

    const choisi = container.querySelector<HTMLInputElement>('input[name="diffusion"]:checked');
    expect(choisi?.value).toBe('maintenant');
  });

  it('part sur « programmer » quand un créneau est déjà posé', () => {
    const { container } = poser({ ...COMPLETE, programmeLe: '2026-10-01T08:00:00.000Z' });

    const choisi = container.querySelector<HTMLInputElement>('input[name="diffusion"]:checked');
    expect(choisi?.value).toBe('programme');
  });

  it('ne montre le CRÉNEAU que sous « programmer »', () => {
    /*
     * Laissé visible sous « publier maintenant », il ferait choisir une date
     * sans effet — et croire que le texte paraîtra ce jour-là.
     */
    const { container } = poser(COMPLETE);
    expect(container.querySelector('select[name="programme_jour"]')).toBeNull();

    choisirDiffusion('Programmer');
    expect(container.querySelector('select[name="programme_jour"]')).not.toBeNull();

    choisirDiffusion('Publier maintenant');
    expect(container.querySelector('select[name="programme_jour"]')).toBeNull();
  });

  it('le bouton DIT ce qui va se passer', () => {
    poser(COMPLETE);

    expect(boutonPrincipal().textContent).toBe('Enregistrer le brouillon');
    choisirDiffusion('Programmer');
    expect(boutonPrincipal().textContent).toBe('Programmer');
    choisirDiffusion('Publier maintenant');
    expect(boutonPrincipal().textContent).toBe('Publier maintenant');
  });
});

describe('la langue du TEXTE, qui n’est pas celle de l’écran', () => {
  /*
   * L'écran chargeait la version française EN DUR et l'action enregistrait
   * sous la langue de l'interface : ouvrir `/en/admin/…/rediger` affichait le
   * texte français et l'écrivait par-dessus l'anglais. Le défaut ne s'est
   * jamais vu parce que la version anglaise se posait ailleurs — par le
   * formulaire du bas de l'écran précédent, qui vient de disparaître.
   */
  it('part avec le formulaire, et ne suit pas les libellés', () => {
    const { container } = render(
      <EditeurPublication
        langue="fr"
        langueVersion="en"
        liensVersion={LIENS_VERSION}
        publication={{ ...COMPLETE, id: '11111111-1111-4111-8111-111111111111' }}
        categories={['actions']}
        evenements={[]}
        jeudis={[]}
        action={vi.fn()}
      />,
    );

    const champ = container.querySelector<HTMLInputElement>('input[name="langue_version"]');
    expect(champ?.value).toBe('en');
  });

  it('propose des LIENS, et non des boutons', () => {
    /*
     * Changer de version recharge la page depuis la base. Un bouton donnerait
     * à croire que les deux versions se remplissent dans le même formulaire,
     * et la seconde partirait avec le texte de la première.
     */
    render(
      <EditeurPublication
        langue="fr"
        langueVersion="fr"
        liensVersion={LIENS_VERSION}
        publication={{ ...COMPLETE, id: '11111111-1111-4111-8111-111111111111' }}
        categories={['actions']}
        evenements={[]}
        jeudis={[]}
        action={vi.fn()}
      />,
    );

    const anglais = screen.getByRole('link', { name: 'English' });
    expect(anglais.getAttribute('href')).toBe('/fr/admin/association/rediger?contenu=x&v=en');
  });

  it('n’en propose AUCUNE sur une publication qui n’existe pas encore', () => {
    // Il n'y a pas de seconde version d'un texte qui n'est pas enregistré.
    poser(VIDE);
    expect(screen.queryByRole('link', { name: 'English' })).toBeNull();
  });
});

describe('le dépôt d’un fichier', () => {
  /*
   * Le champ de texte reste LA VALEUR ; le dépôt est un raccourci qui la
   * remplit. Les contenus déjà en base portent des adresses collées à la
   * main, dont certaines pointent des fichiers qui ne nous appartiennent pas :
   * remplacer le champ par un bouton les rendrait illisibles.
   */
  it('accompagne la couverture, la fiche PDF et chaque média du corps', () => {
    const { container } = poser({
      ...COMPLETE,
      type: 'fiche_pdf',
      corps: [...COMPLETE.corps, { type: 'photo', url: '' }, { type: 'audio', url: '' }],
    });

    // Couverture, photo, audio, fiche PDF : quatre emplacements, quatre dépôts.
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(4);
  });

  it('affiche l’APERÇU d’un média enregistré, et non son chemin de stockage', () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────┐
     * │ CE QUI PART EN BASE ET CE QUI S'AFFICHE NE SONT PAS LA MÊME      │
     * │ CHAÎNE.                                                           │
     * │                                                                  │
     * │ Le champ porte un CHEMIN DE STOCKAGE, qu'un navigateur prend pour │
     * │ une adresse relative et va chercher là où il n'y a rien.          │
     * │ L'éditeur verrait son propre fichier cassé et le croirait perdu.  │
     * │                                                                  │
     * │ L'aperçu, lui, ne sort jamais de l'écran : le formulaire envoie   │
     * │ le chemin, et lui seul.                                           │
     * └──────────────────────────────────────────────────────────────────┘
     */
    const chemin = 'association-images/abc123.png';
    const { container } = poser({
      ...COMPLETE,
      imageUrl: chemin,
      apercus: { [chemin]: 'https://stockage.test/public/abc123.png' },
    });

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('https://stockage.test/public/abc123.png');

    // Mais c'est bien le CHEMIN qui part au serveur.
    const champ = container.querySelector<HTMLInputElement>('input[name="image_url"]');
    expect(champ?.value).toBe(chemin);
  });

  it('MONTRE le média d’un bloc, et pas seulement son chemin', () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────┐
     * │ UN DÉPÔT MUET PASSE POUR UN DÉPÔT RATÉ.                          │
     * │                                                                  │
     * │ La couverture avait un aperçu depuis toujours ; les blocs du      │
     * │ corps n'en avaient aucun. On y déposait un fichier, le champ se   │
     * │ remplissait d'un chemin de stockage — ce qui ressemble le plus à  │
     * │ rien —, et l'éditeur croyait son fichier perdu.                   │
     * │                                                                  │
     * │ C'est le défaut que le propriétaire a signalé le 29 septembre :   │
     * │ « j'ai chargé un fichier depuis mon PC mais il ne s'affiche       │
     * │ pas ». Le fichier était bien monté ; rien ne le disait.           │
     * └──────────────────────────────────────────────────────────────────┘
     */
    const chemin = 'association-fichiers/abc.png';
    const { container } = poser({
      ...COMPLETE,
      corps: [...COMPLETE.corps, { type: 'photo', url: chemin }],
      apercus: { [chemin]: 'https://stockage.test/sign/abc.png?token=x' },
    });

    const vues = [...container.querySelectorAll('img')].map((n) => n.getAttribute('src'));
    expect(vues).toContain('https://stockage.test/sign/abc.png?token=x');
  });

  it('ne montre RIEN tant qu’aucun média n’est posé', () => {
    // Un cadre vide au-dessus d'un champ vide se lirait comme une image qui
    // n'a pas chargé.
    const { container } = poser({
      ...COMPLETE,
      corps: [...COMPLETE.corps, { type: 'photo', url: '' }],
    });

    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('rend un lecteur pour une VIDÉO et pour un SON, sans rien précharger', () => {
    const { container } = poser({
      ...COMPLETE,
      corps: [
        ...COMPLETE.corps,
        { type: 'video', url: 'https://exemple.test/a.mp4' },
        { type: 'audio', url: 'https://exemple.test/b.mp3' },
      ],
    });

    const medias = container.querySelectorAll('video, audio');
    expect(medias).toHaveLength(2);
    // §5.1 — une part importante du public est sur réseau lent, et l'éditeur
    // relit son article : il ne vient pas regarder ses vidéos.
    for (const media of medias) expect(media.getAttribute('preload')).toBe('none');
  });

  it('oriente le sélecteur du système SANS prétendre valider', () => {
    /*
     * `accept` ne s'impose pas — un fichier glissé le contourne. C'est la
     * route qui vérifie le rôle, la taille, le type déclaré et les octets de
     * tête. Ce test dit seulement que l'indication est posée.
     */
    const { container } = poser({
      ...COMPLETE,
      corps: [...COMPLETE.corps, { type: 'video', url: '' }],
    });

    const accepts = [...container.querySelectorAll('input[type="file"]')].map((n) =>
      n.getAttribute('accept'),
    );
    expect(accepts).toContain('image/webp,image/avif,image/png,image/jpeg');
    expect(accepts).toContain('video/mp4,video/webm');
  });
});

describe('le chapeau', () => {
  it('signale le dépassement APRÈS 220, pas avant', () => {
    // Prévenir à l'approche ferait s'arrêter d'écrire avant la limite.
    const { container, unmount } = poser({ ...COMPLETE, chapeau: 'x'.repeat(220) });
    const compteur = within(container).getByText('220 / 220');
    expect(compteur.className).not.toContain('Trop');
    unmount();

    const apres = poser({ ...COMPLETE, chapeau: 'x'.repeat(221) });
    expect(within(apres.container).getByText('221 / 220').className).toContain('Trop');
  });
});
