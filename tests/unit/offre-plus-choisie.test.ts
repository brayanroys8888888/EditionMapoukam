import { describe, expect, it } from 'vitest';

import { offresLesPlusChoisies } from '@/app/[langue]/admin/offres/plus-choisie';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « LA PLUS CHOISIE » EST LA SEULE PHRASE QUE CET ÉCRAN AFFIRME.          │
 * │                                                                          │
 * │ Tout le reste de la carte est LU : le nom, la périodicité, les prix, le  │
 * │ compte d'abonnés, les zones sans prix. Cette mention-là est DÉRIVÉE, et  │
 * │ une dérivation qui se trompe ne se voit pas — elle se lit comme un fait. │
 * │                                                                          │
 * │ Ces tests fixent les trois gardes qui l'empêchent de mentir, et chacun   │
 * │ décrit le mensonge qu'il interdit.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('la mention « la plus choisie »', () => {
  it('désigne la formule qui devance les autres de son domaine', () => {
    const retenues = offresLesPlusChoisies([
      { id: 'mensuel', domaine: 'lecture', abonnements: 12 },
      { id: 'annuel', domaine: 'lecture', abonnements: 3 },
    ]);

    expect([...retenues]).toEqual(['mensuel']);
  });

  it('NE DÉSIGNE RIEN quand aucune formule n’a d’abonné', () => {
    /*
     * Le cas du premier jour, et celui de la base de développement. Sans cette
     * garde, la mention se poserait sur une formule que personne n'a prise —
     * et un éditeur la lirait comme un fait de vente.
     */
    const retenues = offresLesPlusChoisies([
      { id: 'mensuel', domaine: 'lecture', abonnements: 0 },
      { id: 'annuel', domaine: 'lecture', abonnements: 0 },
    ]);

    expect(retenues.size).toBe(0);
  });

  it('NE DÉSIGNE RIEN à égalité — l’ordre de la liste ne tranche pas', () => {
    /*
     * À égalité, retenir « la première » revient à laisser le tri décider
     * d'une affirmation de vente. Deux formules également choisies n'ont pas
     * de gagnante : la mention se retire.
     */
    const retenues = offresLesPlusChoisies([
      { id: 'mensuel', domaine: 'lecture', abonnements: 7 },
      { id: 'annuel', domaine: 'lecture', abonnements: 7 },
    ]);

    expect(retenues.size).toBe(0);
  });

  it('compte PAR DOMAINE, sans les mettre en concurrence', () => {
    /*
     * La lecture et l'adhésion ne se disputent pas un client : chacune a son
     * public. Un classement commun dirait seulement lequel des deux est le
     * plus nombreux, et la formule d'adhésion la plus prise ne porterait
     * jamais la mention.
     */
    const retenues = offresLesPlusChoisies([
      { id: 'lecture-mensuel', domaine: 'lecture', abonnements: 40 },
      { id: 'lecture-annuel', domaine: 'lecture', abonnements: 9 },
      { id: 'adhesion-annuel', domaine: 'association', abonnements: 2 },
      { id: 'adhesion-mensuel', domaine: 'association', abonnements: 1 },
    ]);

    expect([...retenues].sort()).toEqual(['adhesion-annuel', 'lecture-mensuel']);
  });

  it('accepte le `bigint` rendu en CHAÎNE par la base', () => {
    /*
     * `admin_lister_offres` rend `abonnements` en `bigint`, que le pilote
     * transporte en chaîne. Comparées comme des chaînes, « 9 » passerait pour
     * plus grand que « 12 » — et la mention désignerait la mauvaise formule.
     */
    const retenues = offresLesPlusChoisies([
      { id: 'mensuel', domaine: 'lecture', abonnements: '12' },
      { id: 'annuel', domaine: 'lecture', abonnements: '9' },
    ]);

    expect([...retenues]).toEqual(['mensuel']);
  });

  it('ne rend rien sur une liste vide, plutôt que de lever', () => {
    expect(offresLesPlusChoisies([]).size).toBe(0);
  });

  it('désigne une formule SEULE de son domaine, si elle a un abonné', () => {
    const retenues = offresLesPlusChoisies([
      { id: 'adhesion', domaine: 'association', abonnements: 1 },
    ]);

    expect([...retenues]).toEqual(['adhesion']);
  });
});
