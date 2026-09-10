import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { chemin, fichiersSources } from '../helpers/sources';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LES IMAGES — LOT 13, LA MOITIÉ ACCESSIBILITÉ ET LA MOITIÉ PERFORMANCE.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `08-build-plan.md` en fait deux lignes de sa liste d'acceptation :
 * « Images washed, rounded, responsive, with real alt text » et « No client
 * bundle over 120kB gzip on any route ». Ce fichier tient la première, et la
 * part de la seconde qui se vérifie sans construire le projet : une image que
 * l'on télécharge sans en avoir besoin coûte plus cher que n'importe quel
 * script sur la connexion lente du §5.1.
 */

const RACINE = process.cwd();
const SOURCES = join(RACINE, 'src');

/** Chaque balise `<img …>` du produit, avec son fichier. */
function balisesImage(): { fichier: string; balise: string }[] {
  const trouvees: { fichier: string; balise: string }[] = [];

  for (const fichier of fichiersSources(SOURCES, /\.tsx$/)) {
    const source = readFileSync(fichier, 'utf8');
    // `[^>]*` suffit : le JSX de ce dépôt n'écrit pas de `>` dans un attribut
    // d'image, et un accolement de style est toujours refermé avant la balise.
    for (const trouve of source.matchAll(/<img\b[\s\S]*?\/>/g)) {
      trouvees.push({ fichier: chemin(fichier), balise: trouve[0] });
    }
  }

  return trouvees;
}

describe('chaque image dit ce qu’elle est, ou dit qu’elle n’est rien', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ `alt` ABSENT ET `alt=""` NE SONT PAS LA MÊME CHOSE.                  │
   * │                                                                      │
   * │ `alt=""` déclare une image décorative : le lecteur d'écran la saute.  │
   * │ `alt` absent laisse le lecteur d'écran se débrouiller — la plupart    │
   * │ lisent alors le NOM DU FICHIER. « pourquoi dash contes point p n g »  │
   * │ au milieu d'une phrase.                                               │
   * │                                                                      │
   * │ La distinction ne se voit jamais à l'écran, et c'est pourquoi elle     │
   * │ appartient à un test plutôt qu'à une relecture.                        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('aucune image sans attribut `alt`', () => {
    const sans = balisesImage()
      .filter(({ balise }) => !/\balt\s*=/.test(balise))
      .map(({ fichier }) => fichier);

    expect(sans, 'une image sans `alt` fait lire son nom de fichier').toEqual([]);
  });

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ET SURTOUT PAS LE TEXTE QUI SE TROUVE JUSTE À CÔTÉ.                  │
   * │                                                                      │
   * │ Trois images du produit portaient en `alt` la clé de traduction du    │
   * │ titre écrit à trois lignes de là : le `<h2>` de la section, ou le     │
   * │ titre de la carte qui l'entoure. Un lecteur d'écran entendait donc    │
   * │ deux fois la même phrase, la première annoncée comme une image.       │
   * │                                                                      │
   * │ Le défaut a l'air d'un soin — l'attribut est rempli, il n'est pas     │
   * │ vide, un audit automatique le compte comme conforme. C'est ce qui le  │
   * │ rend durable.                                                         │
   * │                                                                      │
   * │ La règle retenue : un `alt` calculé par `traduire(…)` est interdit.   │
   * │ Une image VRAIMENT informative décrit ce qu'elle montre, ce qui n'est │
   * │ jamais une clé d'interface déjà affichée ailleurs ; le seul `alt`     │
   * │ traduit légitime du produit vient d'une donnée éditoriale nommée      │
   * │ pour cet usage (`logoAlt`), et il est écrit tel quel.                 │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('aucun `alt` ne recopie une clé d’interface', () => {
    const fautifs = balisesImage()
      .filter(({ balise }) => /\balt=\{\s*traduire\s*\(/.test(balise))
      .map(({ fichier }) => fichier);

    expect(
      fautifs,
      'un `alt` tiré du dictionnaire d’interface répète un texte déjà à l’écran',
    ).toEqual([]);
  });
});

describe('aucune image ne se télécharge pour rien', () => {
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE CHARGEMENT DIFFÉRÉ EST LA RÈGLE, ET L'EXCEPTION SE JUSTIFIE.      │
   * │                                                                      │
   * │ §5.1 pose la connexion lente comme condition RÉELLE d'une part du     │
   * │ public. Une grille de vingt couvertures chargée d'un bloc, c'est      │
   * │ vingt requêtes en concurrence avec celle qui compte : la première     │
   * │ image visible.                                                        │
   * │                                                                      │
   * │ L'exception est la couverture de la fiche et l'image du hero — les    │
   * │ seules au-dessus de la ligne de flottaison, et les différer les       │
   * │ retarderait au lieu de les avancer. Elles passent par `Couverture`    │
   * │ ou par un `priorite`, jamais par un `<img>` nu sans consigne.         │
   * │                                                                      │
   * │ Le test ne réclame donc pas `lazy` partout : il réclame qu'une image  │
   * │ écrite à la main DISE quelque chose — `loading` posé dans un sens ou  │
   * │ dans l'autre. L'oubli est ce qu'on attrape ; le choix reste libre.    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('chaque image écrite à la main déclare sa stratégie de chargement', () => {
    const muettes = balisesImage()
      .filter(({ balise }) => !/\bloading\s*=/.test(balise))
      .map(({ fichier }) => fichier);

    expect(
      muettes,
      'poser `loading` explicitement, même à `eager` : l’oubli n’est pas un choix',
    ).toEqual([]);
  });

  /**
   * `decoding="async"` rend la main au fil principal pendant que l'image se
   * décode. Sans lui, une grande image décodée en synchrone bloque le défilement
   * sur un téléphone d'entrée de gamme — le matériel du public visé.
   */
  it('et son mode de décodage', () => {
    const muettes = balisesImage()
      .filter(({ balise }) => !/\bdecoding\s*=/.test(balise))
      .map(({ fichier }) => fichier);

    expect(muettes).toEqual([]);
  });
});
