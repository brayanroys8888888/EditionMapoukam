import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { OngletAgenda } from '@/app/[langue]/admin/association/onglet-agenda';
import { OngletCampagne } from '@/app/[langue]/admin/association/onglet-campagne';
import { OngletCommentaires } from '@/app/[langue]/admin/association/onglet-commentaires';
import { OngletPublications } from '@/app/[langue]/admin/association/onglet-publications';

/**
 * LES ONGLETS DE L'ASSOCIATION — ce qui se voit, et ce qui doit se voir.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES ÉCRANS AFFICHENT ; CE SONT DONC LEURS SILENCES QU'ON ÉPROUVE.       │
 * │                                                                          │
 * │ Une carte qui manque se remarque. Ce qui ne se remarque pas, c'est un    │
 * │ créneau libre rendu comme un blanc, une jauge qui déborde de sa piste,   │
 * │ un lien de séminaire affiché à qui n'est pas inscrit, ou une file vide   │
 * │ qui ne dit pas qu'elle est vide.                                         │
 * │                                                                          │
 * │ Chaque test ci-dessous nomme le silence qu'il interdit.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

describe('le rythme hebdomadaire', () => {
  it('DESSINE le créneau libre, il ne le laisse pas blanc', () => {
    /*
     * C'est toute l'information de ce planning : un jeudi sans contenu est une
     * promesse qui va manquer. Un blanc se lirait comme une ligne en attente
     * de chargement, et l'éditeur passerait à côté.
     */
    render(
      <OngletPublications
        langue="fr"
        publications={[]}
        jeudis={[
          { jour: '2026-10-01', titre: 'Atelier de Douala', etat: 'programme' },
          { jour: '2026-10-08', titre: null, etat: null },
        ]}
        mot={null}
        lienPublication={(id) => `/fr/x?contenu=${id}`}
      />,
    );

    expect(screen.getByText('Atelier de Douala')).toBeTruthy();
    expect(screen.getByText('Rien de programmé')).toBeTruthy();
  });

  it('rend les quatre jeudis même sans aucune publication', () => {
    // Le planning ne dépend pas de la liste : il montre des CRÉNEAUX, et une
    // liste vide est justement le moment où on a besoin de les voir.
    render(
      <OngletPublications
        langue="fr"
        publications={[]}
        jeudis={['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((jour) => ({
          jour,
          titre: null,
          etat: null,
        }))}
        mot={null}
        lienPublication={(id) => `/fr/x?contenu=${id}`}
      />,
    );

    expect(screen.getAllByText('Rien de programmé')).toHaveLength(4);
  });
});

describe('la file de modération', () => {
  it('DIT qu’elle est vide, plutôt que de ne rien rendre', () => {
    // Un écran vide se confond avec un écran qui n'a pas chargé. Celui-ci
    // annonce qu'il n'y a rien à faire — ce qui est une bonne nouvelle.
    render(<OngletCommentaires langue="fr" commentaires={[]} />);

    expect(screen.getByText(/Aucun commentaire en attente/)).toBeTruthy();
  });

  it('montre l’auteur, l’article et le texte — et les deux gestes', () => {
    render(
      <OngletCommentaires
        langue="fr"
        commentaires={[
          {
            id: 'c1',
            texte: 'Merci pour cet atelier, ma fille en parle encore.',
            statut: 'en_attente',
            cree_le: '2026-09-20T10:00:00.000Z',
            auteur_nom: 'Awa Mbarga',
            auteur_email: 'awa@exemple.test',
            contenu_slug: 'atelier-douala',
            contenu_titre: 'Atelier de Douala',
          },
        ]}
      />,
    );

    expect(screen.getByText('Awa Mbarga')).toBeTruthy();
    expect(screen.getByText(/Atelier de Douala/)).toBeTruthy();
    expect(screen.getByText(/ma fille en parle encore/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approuver' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Masquer' })).toBeTruthy();
  });
});

describe('l’agenda', () => {
  const ATELIER = {
    id: 'e1',
    type_evenement: 'atelier_presentiel',
    titre: 'Atelier de Douala',
    description: '',
    debut_le: '2026-10-15T09:00:00.000Z',
    lieu: 'Douala',
    lien: null,
    places: 30,
    inscrits: 18,
    passe: false,
  };

  it('affiche les inscrits ET les places — le chiffre et la proportion', () => {
    render(
      <OngletAgenda
        langue="fr"
        evenements={[ATELIER]}
        ouvert={false}
        lienNouveau="/fr/x?evenement=1"
        lienFermer="/fr/x"
      />,
    );

    expect(screen.getByText(/18 inscrits/)).toBeTruthy();
    expect(screen.getByText(/30 places/)).toBeTruthy();
  });

  it('N’AFFICHE PAS le lien d’un séminaire en ligne', () => {
    /*
     * Il vaut une place : il se recopie et se transmet. Le chemin légitime est
     * l'e-mail envoyé aux INSCRITS, une heure avant. L'écran dit « En ligne »
     * et s'arrête là.
     */
    render(
      <OngletAgenda
        langue="fr"
        evenements={[
          {
            ...ATELIER,
            type_evenement: 'seminaire_en_ligne',
            lieu: null,
            lien: 'https://visio.exemple.test/secret-abc',
          },
        ]}
        ouvert={false}
        lienNouveau="/fr/x?evenement=1"
        lienFermer="/fr/x"
      />,
    );

    expect(screen.getByText(/En ligne/)).toBeTruthy();
    expect(screen.queryByText(/secret-abc/)).toBeNull();
  });

  it('propose la case d’ajout DANS la grille, et la retire quand le formulaire est ouvert', () => {
    const { unmount } = render(
      <OngletAgenda
        langue="fr"
        evenements={[]}
        ouvert={false}
        lienNouveau="/fr/x?evenement=1"
        lienFermer="/fr/x"
      />,
    );
    expect(screen.getByRole('link', { name: /Ajouter un atelier/ })).toBeTruthy();
    unmount();

    render(
      <OngletAgenda
        langue="fr"
        evenements={[]}
        ouvert
        lienNouveau="/fr/x?evenement=1"
        lienFermer="/fr/x"
      />,
    );
    expect(screen.queryByRole('link', { name: /Ajouter un atelier/ })).toBeNull();
    expect(screen.getByLabelText('Intitulé')).toBeTruthy();
  });
});

describe('la campagne', () => {
  it('somme les régions dans l’aperçu, et affiche l’objectif', () => {
    const { container } = render(
      <OngletCampagne
        langue="fr"
        campagne={{
          id: 'k1',
          intitule: '500 kits pour la rentrée',
          objectif_kits: 500,
          fin_le: null,
          total: 312,
          regions: [
            { region: 'Ouest', kits: 148 },
            { region: 'Littoral', kits: 97 },
            { region: 'Centre', kits: 67 },
          ],
        }}
      />,
    );

    expect(screen.getByText('312')).toBeTruthy();
    expect(screen.getByText(/sur 500/)).toBeTruthy();

    /*
     * La région est visée DANS L'APERÇU, pas dans la page : elle y apparaît
     * deux fois — une fois comme libellé du champ qu'on édite, une fois dans
     * la carte que l'adhérent verra. Les deux sont voulues ; une recherche
     * globale ne saurait pas laquelle elle a trouvée.
     */
    const apercu = container.querySelector<HTMLElement>('[class*="campagneApercuRegions"]');
    expect(apercu?.textContent).toContain('Littoral');
    expect(apercu?.textContent).toContain('97');
  });

  it('PLAFONNE la jauge à 100 %, même au-delà de l’objectif', () => {
    /*
     * Dépasser l'objectif est une bonne nouvelle, pas une raison de dessiner
     * une barre qui sort de sa piste — elle déborderait de la carte, et
     * l'aperçu cesserait de ressembler à ce que l'adhérent voit.
     */
    const { container } = render(
      <OngletCampagne
        langue="fr"
        campagne={{
          id: 'k1',
          intitule: 'Objectif dépassé',
          objectif_kits: 100,
          fin_le: null,
          total: 250,
          regions: [{ region: 'Ouest', kits: 250 }],
        }}
      />,
    );

    const remplie = container.querySelector<HTMLElement>('[class*="JaugeRemplie"]');
    expect(remplie?.style.width).toBe('100%');
  });

  it('dit qu’il n’y a AUCUNE campagne, plutôt que d’afficher une carte vide', () => {
    render(<OngletCampagne langue="fr" campagne={null} />);

    expect(screen.getByText('Aucune campagne en cours.')).toBeTruthy();
    // Le formulaire reste là : c'est par lui qu'on en ouvre une.
    expect(screen.getByLabelText('Intitulé')).toBeTruthy();
  });
});
