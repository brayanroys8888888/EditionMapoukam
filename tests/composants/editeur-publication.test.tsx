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
};

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
      publication={publication}
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

describe('la liste « Prête à publier ? »', () => {
  it('BLOQUE l’enregistrement tant qu’il manque un point, et dit combien', () => {
    poser(VIDE);

    const bouton = boutonPrincipal();
    expect(bouton.disabled).toBe(true);
    // Cinq manquants sur six : le sixième — « ce que le type exige » — est
    // déjà vrai pour un récit de terrain, qui n'exige rien.
    expect(bouton.textContent).toContain('5');
  });

  it('LAISSE PASSER quand les six points sont faits', () => {
    poser(COMPLETE);

    const bouton = boutonPrincipal();
    expect(bouton.disabled).toBe(false);
    expect(bouton.textContent).toBe('Programmer');
  });

  it('refuse un chapeau TROP COURT autant qu’un trop long', () => {
    /*
     * Les deux bornes comptent. Un chapeau de trente caractères tient mal sur
     * une carte ; un de trois cents y est tronqué sans qu'on sache où. Le
     * document fixe 40 à 220, et le serveur applique la même fourchette.
     */
    const { unmount } = poser({ ...COMPLETE, chapeau: 'Trop court.' });
    expect(boutonPrincipal().disabled).toBe(true);
    unmount();

    poser({ ...COMPLETE, chapeau: 'x'.repeat(221) });
    expect(boutonPrincipal().disabled).toBe(true);
  });

  it('ne compte PAS un paragraphe trop maigre', () => {
    // Vingt caractères, c'est moins qu'une phrase. Un bloc de trois mots
    // n'est pas un article : le point reste ouvert.
    poser({ ...COMPLETE, corps: [{ type: 'paragraphe', texte: 'Trois mots.' }] });
    expect(boutonPrincipal().disabled).toBe(true);
  });

  it('exige le LIEN d’un replay, et le FICHIER d’une fiche', () => {
    const { unmount } = poser({ ...COMPLETE, type: 'replay' });
    expect(boutonPrincipal().disabled).toBe(true);
    unmount();

    const seconde = poser({ ...COMPLETE, type: 'replay', videoUrl: 'https://exemple.test/v' });
    expect(boutonPrincipal().disabled).toBe(false);
    seconde.unmount();

    const troisieme = poser({ ...COMPLETE, type: 'fiche_pdf' });
    expect(boutonPrincipal().disabled).toBe(true);
    troisieme.unmount();

    poser({ ...COMPLETE, type: 'fiche_pdf', fichierPdf: '/fiches/atelier.pdf' });
    expect(boutonPrincipal().disabled).toBe(false);
  });

  it('exige AU MOINS un public', () => {
    poser({ ...COMPLETE, publics: [] });
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
