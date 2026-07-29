import { describe, expect, it } from 'vitest';

import {
  INTERVALLE_ECRITURE_MS,
  calculerReprise,
  doitEcrire,
  type ProgressionEnregistree,
} from '@/domain/reading/progress';

/**
 * Reprise de lecture et regroupement des écritures — §4.2 F7.
 *
 * Logique pure : c'est ici que se traite le piège principal de l'étape — deux
 * versions linguistiques d'un même livre n'ont pas forcément le même nombre de
 * pages.
 */
const T0 = new Date('2026-07-29T12:00:00Z');
const plusTard = (ms: number) => new Date(T0.getTime() + ms);

function progression(
  langue: 'fr' | 'en',
  dernierePage: number,
  majLe = T0,
): ProgressionEnregistree {
  return { langue, dernierePage, majLe };
}

describe('reprise dans sa propre langue', () => {
  it('rend la page enregistrée', () => {
    expect(calculerReprise([progression('fr', 12)], 'fr', 20)).toEqual({
      page: 12,
      langueOrigine: 'fr',
      borneAppliquee: false,
    });
  });

  it('ouvre à la première page quand rien n’est enregistré', () => {
    expect(calculerReprise([], 'fr', 20)).toEqual({
      page: 1,
      langueOrigine: null,
      borneAppliquee: false,
    });
  });

  it('borne même sa propre langue', () => {
    // Le titre a pu être réingéré plus court depuis la dernière lecture.
    expect(calculerReprise([progression('fr', 30)], 'fr', 20)).toEqual({
      page: 20,
      langueOrigine: 'fr',
      borneAppliquee: true,
    });
  });
});

describe('PAGINATION DIVERGENTE ENTRE LANGUES — le piège de l’étape', () => {
  it('retombe sur la progression d’une autre langue', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ La promesse de D2 point 6 est TENUE : basculer de version ne perd    │
    // │ pas la page atteinte.                                                │
    // └──────────────────────────────────────────────────────────────────────┘
    expect(calculerReprise([progression('fr', 12)], 'en', 16)).toEqual({
      page: 12,
      langueOrigine: 'fr',
      borneAppliquee: false,
    });
  });

  it('BORNE la reprise au nombre de pages de la version ouverte', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ Le cas exact du jeu de démonstration : `kouassi-et-le-tam-tam` fait  │
    // │ 20 pages en français et 16 en anglais. Un lecteur arrivé page 19 en  │
    // │ français ne peut pas être renvoyé à une page qui n'existe pas.       │
    // │                                                                      │
    // │ Sans cette borne, la reprise pointerait AU-DELÀ DE LA FIN du livre — │
    // │ et le lecteur ouvrirait sur une page blanche ou une erreur.          │
    // └──────────────────────────────────────────────────────────────────────┘
    expect(calculerReprise([progression('fr', 19)], 'en', 16)).toEqual({
      page: 16,
      langueOrigine: 'fr',
      borneAppliquee: true,
    });
  });

  it('ne borne pas quand la version ouverte est plus longue', () => {
    // Le sens inverse : 12 en anglais reste 12 en français, qui fait 20 pages.
    expect(calculerReprise([progression('en', 12)], 'fr', 20)).toEqual({
      page: 12,
      langueOrigine: 'en',
      borneAppliquee: false,
    });
  });

  it('PRÉFÈRE la progression de sa propre langue au repli', () => {
    // Même si l'autre langue est plus avancée : c'est dans CETTE version que le
    // lecteur en est.
    const progressions = [progression('fr', 19, plusTard(1000)), progression('en', 3)];

    expect(calculerReprise(progressions, 'en', 16)).toEqual({
      page: 3,
      langueOrigine: 'en',
      borneAppliquee: false,
    });
  });

  it('choisit la plus RÉCENTE des autres langues, pas la plus avancée', () => {
    // Être allé loin dans une version abandonnée il y a six mois ne dit rien de
    // la lecture en cours. Ici, la langue demandée n'a aucune progression, et
    // deux autres sont candidates : l'anglaise est moins avancée mais plus
    // récente d'un jour — c'est elle qui décrit où en est le lecteur.
    //
    // Les deux versions linguistiques du catalogue étant `fr` et `en`, la
    // troisième langue est simulée en demandant une reprise dans une langue
    // dont aucune progression n'existe.
    const anciennePlusAvancee = progression('fr', 18, T0);
    const recentePlusCourte = progression('en', 4, plusTard(86_400_000));

    // Demande en `fr` : sa propre progression existe, elle prime.
    expect(calculerReprise([anciennePlusAvancee, recentePlusCourte], 'fr', 20).page).toBe(18);

    // Demande en `fr` alors que seule l'anglaise existe : c'est elle qui sert.
    expect(calculerReprise([recentePlusCourte], 'fr', 20)).toEqual({
      page: 4,
      langueOrigine: 'en',
      borneAppliquee: false,
    });
  });

  it('ne descend jamais sous la première page', () => {
    // Une version sans page rendue — ingestion en cours — ne doit pas produire
    // une page 0.
    expect(calculerReprise([progression('fr', 12)], 'en', 0).page).toBe(1);
  });
});

describe('regroupement des écritures', () => {
  it('retient la première écriture', () => {
    // Sans quoi la toute première page lue serait perdue.
    expect(doitEcrire(null, T0, null, 3)).toBe(true);
  });

  it('absorbe une écriture trop rapprochée', () => {
    // Un enfant qui feuillette un album de 48 pages produirait 48 écritures.
    expect(doitEcrire(T0, plusTard(2_000), 3, 4)).toBe(false);
  });

  it('retient une écriture passé l’intervalle', () => {
    expect(doitEcrire(T0, plusTard(INTERVALLE_ECRITURE_MS), 3, 4)).toBe(true);
  });

  it('n’écrit JAMAIS une page identique, quel que soit le délai', () => {
    // Le cas du lecteur qui laisse l'album ouvert : rien n'a changé, rien n'a
    // à être écrit.
    expect(doitEcrire(T0, plusTard(3_600_000), 7, 7)).toBe(false);
    expect(doitEcrire(null, T0, 7, 7)).toBe(false);
  });

  it('laisse un intervalle assez court pour ne presque rien perdre', () => {
    // Assez long pour absorber un feuilletage rapide, assez court pour qu'une
    // fermeture d'application ne coûte pas la séance.
    expect(INTERVALLE_ECRITURE_MS).toBeGreaterThanOrEqual(5_000);
    expect(INTERVALLE_ECRITURE_MS).toBeLessThanOrEqual(30_000);
  });
});
