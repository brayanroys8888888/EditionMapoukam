import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ACCES_REFUSE, ORDRE_MOTIFS } from '@/domain/access/types';

/**
 * Unicité de l'implémentation du moteur de droits.
 *
 * docs/PLAN.md D1 point 2 : « Une seule implémentation, appelée à la fois par
 * le RLS et par l'application. Si la logique existe à deux endroits, elle
 * divergera. »
 *
 * Ce test surveille cette promesse sur les sources. Un commentaire suffit à
 * énoncer une règle ; il ne suffit pas à la tenir dans six mois.
 */
const RACINE = process.cwd();

function fichiers(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (chemin.endsWith('.ts')) trouves.push(chemin);
  }
  return trouves;
}

/**
 * Motifs qui trahiraient une règle d'accès réimplémentée en TypeScript.
 *
 * On cherche les concepts métier du moteur — fenêtre de 3 mois, période de
 * grâce, statuts d'abonnement — et non des mots-clés génériques, pour que le
 * test n'attrape pas un commentaire de passage.
 */
const MOTIFS_INTERDITS: readonly { motif: RegExp; explication: string }[] = [
  {
    motif: /inclus_abonnement/,
    explication: 'décision d’éligibilité à l’abonnement',
  },
  {
    motif: /NEW_RELEASE_WINDOW_DAYS|fenetre_nouveaute/,
    explication: 'calcul de la fenêtre de vente de 3 mois',
  },
  {
    motif: /PAYMENT_GRACE_PERIOD_DAYS|periode_grace/,
    explication: 'calcul de la période de grâce',
  },
  {
    motif: /peut_telecharger/,
    explication: 'décision de droit de téléchargement',
  },
];

describe('src/domain/access', () => {
  it('ne réimplémente aucune règle d’accès', () => {
    const coupables: string[] = [];

    for (const chemin of fichiers(join(RACINE, 'src', 'domain', 'access'))) {
      const source = readFileSync(chemin, 'utf8');
      for (const { motif, explication } of MOTIFS_INTERDITS) {
        if (motif.test(source)) {
          coupables.push(`${relative(RACINE, chemin)} : ${explication}`);
        }
      }
    }

    expect(coupables).toEqual([]);
  });

  it('ne contient que des types et des constantes', () => {
    // Aucune fonction exportée : dès qu'il y en aurait une, la tentation
    // d'y glisser un calcul deviendrait irrésistible.
    for (const chemin of fichiers(join(RACINE, 'src', 'domain', 'access'))) {
      const source = readFileSync(chemin, 'utf8');
      expect({ chemin: relative(RACINE, chemin), fonctions: /export function /.test(source) }).toEqual({
        chemin: relative(RACINE, chemin),
        fonctions: false,
      });
    }
  });
});

describe('src/lib/access', () => {
  it('n’est qu’un appelant : aucune règle métier', () => {
    const coupables: string[] = [];

    for (const chemin of fichiers(join(RACINE, 'src', 'lib', 'access'))) {
      const source = readFileSync(chemin, 'utf8');
      for (const { motif, explication } of MOTIFS_INTERDITS) {
        if (motif.test(source)) {
          coupables.push(`${relative(RACINE, chemin)} : ${explication}`);
        }
      }
    }

    expect(coupables).toEqual([]);
  });

  it('appelle bien la fonction PostgreSQL par lot', () => {
    const source = readFileSync(join(RACINE, 'src', 'lib', 'access', 'engine.ts'), 'utf8');

    // Sans cette vérification, les tests précédents passeraient aussi sur un
    // module qui n'appellerait rien du tout.
    expect(source).toContain("rpc('access_for_books'");
  });
});

describe('types du moteur', () => {
  it('ordonne les motifs du plus fort au plus faible', () => {
    // purchase > granted > subscription > free > preview (docs/PLAN.md D5).
    expect(ORDRE_MOTIFS).toEqual([
      'purchase',
      'granted',
      'subscription',
      'free',
      'preview',
      'none',
    ]);
  });

  it('propose un refus par défaut réellement fermé', () => {
    expect(ACCES_REFUSE).toEqual({ canRead: false, canDownload: false, reason: 'none' });
  });
});
