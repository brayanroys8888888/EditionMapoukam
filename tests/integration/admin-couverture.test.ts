import { afterAll, describe, expect, it } from 'vitest';

import { closePool, query } from '../helpers/db';

/**
 * LES DEUX LECTURES D'ADMINISTRATION TRANSPORTENT LE JETON DE COUVERTURE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CE FICHIER DÉFEND, ET QU'AUCUN AUTRE NE VERRAIT.                 │
 * │                                                                          │
 * │ La fiche d'administration a affiché un rectangle vide pendant des        │
 * │ semaines. Ce n'était pas un défaut d'affichage : la donnée existait —    │
 * │ `books.couverture_jeton` était renseigné, les trois tailles étaient dans │
 * │ le bucket public — et les deux fonctions de lecture ne rendaient         │
 * │ simplement pas la colonne. L'écran ne pouvait rien montrer, et personne  │
 * │ ne pouvait le voir en relisant le composant.                             │
 * │                                                                          │
 * │ La migration 0087 l'ajoute. Sans ce test, une migration corrective       │
 * │ ultérieure qui retaperait l'une des deux signatures la laisserait        │
 * │ tomber, et l'écran redeviendrait muet — sans qu'aucune erreur soit       │
 * │ levée, exactement comme la première fois.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface Livre {
  id: string;
  slug: string;
  couverture_jeton: string | null;
}

afterAll(async () => {
  await closePool();
});

/** Un titre qui PORTE un jeton — il en faut un pour que le test porte. */
async function titreAvecCouverture(): Promise<Livre> {
  const lignes = await query<Livre>(
    `select id, slug, couverture_jeton from public.books
      where couverture_jeton is not null
      order by slug
      limit 1`,
  );
  const premier = lignes[0];
  expect(
    premier,
    'aucun titre du jeu de démonstration ne porte de couverture : le test ne prouverait rien',
  ).toBeDefined();
  return premier as Livre;
}

describe('admin_lire_livre', () => {
  it('rend `couverture_jeton`, et le rend EN DERNIÈRE POSITION', async () => {
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ LA POSITION EST LE SUJET, PAS UN DÉTAIL.                           │
     * │                                                                    │
     * │ Le client Supabase mappe les colonnes d'un `returns table` PAR     │
     * │ POSITION. La migration 0079 avait retapé la signature de           │
     * │ `catalog_list` et renommé `book_id` au passage : tout le catalogue  │
     * │ est devenu muet, sans qu'aucune erreur soit levée. La 0082 a        │
     * │ inscrit la leçon, la 0087 l'applique — la colonne est AJOUTÉE à la  │
     * │ fin, jamais épissée au milieu.                                      │
     * │                                                                    │
     * │ Affirmer sa seule présence laisserait donc passer précisément le    │
     * │ défaut qu'on cherche à empêcher.                                    │
     * └────────────────────────────────────────────────────────────────────┘
     */
    const livre = await titreAvecCouverture();

    const lignes = await query<Record<string, unknown>>(
      `select * from public.admin_lire_livre($1)`,
      [livre.id],
    );

    expect(lignes.length).toBe(1);

    const colonnes = Object.keys(lignes[0] ?? {});
    expect(colonnes.at(-1)).toBe('couverture_jeton');
    expect(lignes[0]?.['couverture_jeton']).toBe(livre.couverture_jeton);
  });

  it('n’a perdu aucune des colonnes que la fiche d’édition relit', async () => {
    // Le contre-test du précédent : une signature retapée pourrait finir par
    // la bonne colonne tout en ayant égaré `niveau` ou `objectifs` — que la
    // migration 0082 a justement dû rétablir, un champ écrit sans être relu
    // étant un champ écrasé.
    const livre = await titreAvecCouverture();

    const lignes = await query<Record<string, unknown>>(
      `select * from public.admin_lire_livre($1)`,
      [livre.id],
    );
    const colonnes = Object.keys(lignes[0] ?? {});

    for (const attendue of [
      'slug',
      'auteur',
      'themes',
      'niveau',
      'objectifs',
      'statut',
      'prix',
      'traductions',
      'manques',
      'publiable',
      'couverture_jeton',
    ]) {
      expect(colonnes, `${attendue} a disparu de admin_lire_livre`).toContain(attendue);
    }
  });
});

describe('admin_lister_livres', () => {
  it('rend `couverture_jeton` en dernière position, sur chaque ligne', async () => {
    const lignes = await query<Record<string, unknown>>(
      `select * from public.admin_lister_livres(null, 1, 25, null)`,
    );

    expect(lignes.length).toBeGreaterThan(0);
    expect(Object.keys(lignes[0] ?? {}).at(-1)).toBe('couverture_jeton');
  });

  it('laisse le jeton à `null` sur un titre sans couverture, au lieu de l’écarter', async () => {
    /*
     * Le jeu de démonstration porte des titres SANS couverture — un brouillon
     * jamais ingéré, par exemple. La liste doit continuer de les montrer : un
     * titre qui disparaîtrait de l'administration parce qu'il n'a pas d'image
     * serait introuvable, donc impossible à corriger.
     */
    const sans = await query<{ n: string }>(
      `select count(*)::text as n from public.books where couverture_jeton is null`,
    );
    const attendus = Number(sans[0]?.n ?? '0');
    expect(attendus, 'aucun titre sans couverture : ce test ne prouverait rien').toBeGreaterThan(0);

    const lignes = await query<{ couverture_jeton: string | null }>(
      `select * from public.admin_lister_livres(null, 1, 100, null)`,
    );

    expect(lignes.filter((l) => l.couverture_jeton === null).length).toBe(attendus);
  });
});
