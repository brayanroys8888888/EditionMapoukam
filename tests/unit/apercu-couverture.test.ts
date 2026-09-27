import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'APERÇU DE COUVERTURE — ce que le compilateur ne peut pas dire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN BINAIRE COPIÉ EST UN BINAIRE QUI SE DÉSYNCHRONISE.                   │
 * │                                                                          │
 * │ `public/wasm/pdfium.wasm` est une COPIE de celui que livre               │
 * │ `@hyzyla/pdfium`. Le JavaScript qui le pilote, lui, vient du paquet et   │
 * │ suit ses montées de version — `npm update` le remplace sans toucher à    │
 * │ la copie.                                                                │
 * │                                                                          │
 * │ Le jour où les deux divergeront, l'aperçu échouera à l'instanciation du  │
 * │ module, dans le navigateur d'un éditeur, sur un écran que personne ne    │
 * │ couvre par un test de bout en bout. Rien ne le signalera : la page       │
 * │ s'affiche, le formulaire marche, seul l'encadré reste muet — et il a un  │
 * │ message pour ça, qui dira « fichier illisible » d'un PDF parfaitement    │
 * │ valable.                                                                 │
 * │                                                                          │
 * │ D'où la comparaison d'empreintes : elle échoue à la montée de version,   │
 * │ et la réparation tient en une copie.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();
const SERVI = join(RACINE, 'public', 'wasm', 'pdfium.wasm');
const PAQUET = join(RACINE, 'node_modules', '@hyzyla', 'pdfium', 'dist', 'pdfium.wasm');

const empreinte = (chemin: string): string =>
  createHash('sha256').update(readFileSync(chemin)).digest('hex');

describe('le moteur de rendu servi au navigateur', () => {
  it('est bien présent sous `public/`', () => {
    expect(existsSync(SERVI), 'public/wasm/pdfium.wasm manque').toBe(true);
  });

  it('est exactement celui que livre `@hyzyla/pdfium`', () => {
    expect(existsSync(PAQUET), '@hyzyla/pdfium ne livre plus dist/pdfium.wasm').toBe(true);

    expect(
      empreinte(SERVI),
      'public/wasm/pdfium.wasm a divergé du paquet — recopiez-le :\n' +
        '  cp node_modules/@hyzyla/pdfium/dist/pdfium.wasm public/wasm/pdfium.wasm',
    ).toBe(empreinte(PAQUET));
  });
});

describe('l’aperçu de couverture', () => {
  const COMPOSANT = join(RACINE, 'src', 'components', 'admin', 'apercu-couverture.tsx');

  it('ne dépose rien : il lit le fichier, il n’écrit nulle part', () => {
    /*
     * `covers-architecture` interdit déjà qu'une couverture soit publiée
     * ailleurs que par `src/lib/storage/covers.ts`. Ce test garde la frontière
     * du côté de l'aperçu : il travaille dans la mémoire du navigateur, et
     * rien ne doit l'amener à parler au stockage ni à une route.
     */
    const source = readFileSync(COMPOSANT, 'utf8');

    for (const interdit of [/publierCouverture/, /\.storage\b/, /\bfetch\s*\(/, /supabase/i]) {
      expect(source, `l’aperçu appelle ${String(interdit)}`).not.toMatch(interdit);
    }
  });

  it('ne charge le moteur qu’à la demande', () => {
    /*
     * Quatre mégaoctets. Un `import` statique les ferait descendre à
     * l'affichage de l'écran, pour un éditeur qui vient peut-être seulement
     * relire un libellé. L'import doit rester DYNAMIQUE, donc à l'intérieur
     * du gestionnaire.
     */
    const source = readFileSync(COMPOSANT, 'utf8');

    expect(source, 'import dynamique attendu').toMatch(/await import\(['"]@hyzyla\/pdfium['"]\)/);
    expect(source, 'import statique interdit').not.toMatch(
      /^import .*from ['"]@hyzyla\/pdfium['"]/m,
    );
  });

  it('n’échange pas les canaux de couleur', () => {
    /*
     * `page.types.d.ts` annonce `colorSpace: "BGRA"` par défaut, et la lecture
     * naturelle est d'échanger les canaux extrêmes pour la toile. C'est faux :
     * `render: 'bitmap'` rend du RGBA — vérifié en rendant la même page des
     * deux façons côté serveur, et confirmé par `rasteriser.ts`, qui passe le
     * tampon à sharp en `channels: 4` depuis l'origine.
     *
     * L'échange donne une image nette où les oranges sont bleus : invisible
     * sur un document en noir et blanc, évident sur une couverture de conte —
     * mais seulement si on connaît l'original. Ce test fige la leçon.
     */
    const source = readFileSync(COMPOSANT, 'utf8');
    expect(source, 'canaux permutés : R ← B').not.toMatch(/pixels\[i\]\s*=\s*\S*rendu\.data\[i \+ 2\]/);
  });
});
