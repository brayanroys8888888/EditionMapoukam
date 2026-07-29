import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fichiersSources } from '../helpers/sources';

/**
 * Le garde-fou des tests d'architecture, éprouvé pour de bon.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SANS CE FICHIER, LE GARDE-FOU SERAIT LUI-MÊME UN TEST VERT QUI NE       │
 * │ PROUVE RIEN.                                                            │
 * │                                                                          │
 * │ `fichiersSources` existe pour qu'un parcours vide fasse échouer le test  │
 * │ qui l'utilise, au lieu de le faire passer sur zéro fichier. Écrire ce    │
 * │ refus sans jamais le déclencher reviendrait exactement au défaut qu'il   │
 * │ corrige : du code de sécurité que rien n'exerce.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function dossierTemporaire(): string {
  return mkdtempSync(join(tmpdir(), 'sources-guard-'));
}

describe('parcours des sources', () => {
  it('REFUSE un dossier sans aucun fichier TypeScript', () => {
    // Le cas qui rendait les tests d'architecture verts sur rien.
    const racine = dossierTemporaire();
    try {
      expect(() => fichiersSources(racine)).toThrow(/ne porte sur rien/);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('REFUSE un dossier qui ne contient que d’autres extensions', () => {
    // Le cas réel visé : des sources migrées vers une autre extension, ou un
    // dossier vidé de sa substance sans être supprimé.
    const racine = dossierTemporaire();
    try {
      writeFileSync(join(racine, 'notes.md'), '# rien à analyser');
      writeFileSync(join(racine, 'donnees.json'), '{}');

      expect(() => fichiersSources(racine)).toThrow(/ne porte sur rien/);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });

  it('REFUSE un dossier inexistant, plutôt que de rendre une liste vide', () => {
    // Un chemin devenu faux après un renommage doit être bruyant. Une des six
    // copies remplacées rendait `[]` dans ce cas précis.
    expect(() => fichiersSources(join(dossierTemporaire(), 'jamais-cree'))).toThrow();
  });

  it('descend dans les sous-dossiers et retient .ts comme .tsx', () => {
    const racine = dossierTemporaire();
    try {
      mkdirSync(join(racine, 'imbrique', 'profond'), { recursive: true });
      writeFileSync(join(racine, 'a.ts'), '');
      writeFileSync(join(racine, 'imbrique', 'b.tsx'), '');
      writeFileSync(join(racine, 'imbrique', 'profond', 'c.ts'), '');
      writeFileSync(join(racine, 'imbrique', 'ignore.md'), '');

      expect(fichiersSources(racine)).toHaveLength(3);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});
