import { describe, expect, it } from 'vitest';

import { slugDisponible, slugifier } from '@/domain/ingestion/slug';

/**
 * Le slug est la clé publique d'un livre dans les URL du catalogue, et la base
 * lui impose sa forme (migration 0006). Un slug mal formé ne dégrade pas
 * l'affichage : il fait échouer l'insertion, donc l'ingestion entière.
 */
const FORME_ATTENDUE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('forme du slug', () => {
  it.each([
    "Anansi l'araignée maligne",
    'Kouassi et le tam-tam',
    "L'arbre aux mille histoires",
    "L'oiseau de feu",
    "La girafe et l'oiseau malin",
    'La hyène qui voulait changer',
    'La petite fille aux étoiles',
    "La poule qui pondait des œufs d'or",
    'La rivière qui parlait',
    'La tortue et le lapin',
    'Le lion et la souris',
    'Le lièvre et la tortue',
    'Le petit éléphant courageux',
    'Le prince qui voulait être gentil',
    'Petit Baobab',
    'Zakou et le tambour',
  ])('%s donne un slug conforme à la contrainte de la base', (titre) => {
    // Les seize titres du corpus, et non un exemple : ce sont eux qui passeront
    // réellement par la chaîne.
    expect(slugifier(titre)).toMatch(FORME_ATTENDUE);
  });

  it('retire les accents', () => {
    expect(slugifier('Le petit éléphant courageux')).toBe('le-petit-elephant-courageux');
    expect(slugifier('La hyène qui voulait changer')).toBe('la-hyene-qui-voulait-changer');
  });

  it('transcrit « œ », que la décomposition Unicode ne touche pas', () => {
    // NFD ne décompose pas « œ » : c'est une lettre à part entière, pas un
    // « o » accentué. Sans transcription explicite, elle serait simplement
    // supprimée et le slug dirait « ufs ».
    expect(slugifier("La poule qui pondait des œufs d'or")).toBe(
      'la-poule-qui-pondait-des-oeufs-d-or',
    );
  });

  it('fait de l’apostrophe un séparateur, et non rien', () => {
    // « larbre-aux-mille-histoires » se lirait mal et se retiendrait plus mal.
    expect(slugifier("L'arbre aux mille histoires")).toBe('l-arbre-aux-mille-histoires');
  });

  it('conserve l’apostrophe courbe comme séparateur', () => {
    // La normalisation du texte convertit les apostrophes droites en courbes :
    // le titre qui arrive ici peut porter l'une ou l'autre.
    expect(slugifier('L’oiseau de feu')).toBe(slugifier("L'oiseau de feu"));
  });

  it('n’ouvre ni ne ferme sur un tiret', () => {
    expect(slugifier('  ¡Petit Baobab!  ')).toBe('petit-baobab');
  });

  it('ne laisse jamais deux tirets de suite', () => {
    expect(slugifier('Le lion  —  et la souris')).toBe('le-lion-et-la-souris');
  });
});

describe('unicité du slug', () => {
  it('ne suffixe pas un slug libre', () => {
    // `petit-baobab` doit rester `petit-baobab` tant qu'il est seul. Suffixer
    // par précaution donnerait des URL laides à tout le catalogue.
    return expect(slugDisponible('Petit Baobab', () => Promise.resolve(false))).resolves.toBe('petit-baobab');
  });

  it('suffixe au premier conflit', async () => {
    const pris = new Set(['petit-baobab']);

    await expect(slugDisponible('Petit Baobab', (s) => Promise.resolve(pris.has(s)))).resolves.toBe(
      'petit-baobab-2',
    );
  });

  it('continue jusqu’à trouver', async () => {
    const pris = new Set(['petit-baobab', 'petit-baobab-2', 'petit-baobab-3']);

    await expect(slugDisponible('Petit Baobab', (s) => Promise.resolve(pris.has(s)))).resolves.toBe(
      'petit-baobab-4',
    );
  });

  it('échoue franchement plutôt que de boucler', async () => {
    await expect(slugDisponible('Petit Baobab', () => Promise.resolve(true), 5)).rejects.toThrow(
      /Aucun slug disponible/,
    );
  });

  it('refuse un titre sans aucun caractère utilisable', async () => {
    // Un titre entièrement composé de ponctuation donnerait une chaîne vide,
    // que la contrainte de la base refuserait avec un message bien moins clair.
    await expect(slugDisponible('!!! ???', () => Promise.resolve(false))).rejects.toThrow(/Slug vide/);
  });
});
