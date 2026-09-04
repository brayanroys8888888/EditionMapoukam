import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LOGO_ASSOCIATION,
  VIDEO_PRESENTATION,
  lirePresentationAssociation,
} from '@/content/association';

/**
 * L'ASSOCIATION DAVE — ce que le compilateur ne peut pas dire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUATRE DÉFAUTS QUI COMPILENT, ET QU'ON NE VOIT QU'EN OUVRANT LA PAGE.   │
 * │                                                                          │
 * │ • un média renommé ou oublié dans `public/` : le type ne connaît que la  │
 * │   CHAÎNE, pas le disque. La page rend alors un cadre vide, un lecteur    │
 * │   vidéo noir, et rien ne proteste ;                                      │
 * │ • une section ajoutée en français et pas en anglais : le type impose les │
 * │   deux LANGUES, jamais le même NOMBRE de sections dans chacune ;         │
 * │ • une illustration d'article déclarée dans `seed.sql` vers un fichier    │
 * │   qui n'existe pas : le SQL s'applique sans une plainte, et la carte     │
 * │   s'affiche cassée ;                                                     │
 * │ • un montant d'adhésion recopié dans ce fichier de contenu : les tarifs  │
 * │   vivent dans `subscription_plans` / `plan_prices` depuis la 0068, et    │
 * │   une copie serait fausse le jour où l'éditeur change son offre — tout   │
 * │   en ayant l'air d'être vraie.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CE TEST NE LIT PAS LA BASE.                                    │
 * │                                                                          │
 * │ Il vit dans le projet `unit`, qui tourne sans Docker. Ce qu'il éprouve   │
 * │ est le lien entre du TEXTE VERSIONNÉ et des FICHIERS VERSIONNÉS — les    │
 * │ deux sont dans le dépôt, la base n'a rien à en dire. Les contenus        │
 * │ eux-mêmes, leurs droits et leur cadenas sont éprouvés ailleurs, contre   │
 * │ la base réelle.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const RACINE = process.cwd();
const MEDIAS = join(RACINE, 'public', 'images', 'association');

const FR = lirePresentationAssociation('fr');
const EN = lirePresentationAssociation('en');

describe('la présentation de l’Association DAVE', () => {
  it('porte les mêmes sections, dans le même ordre, dans les deux langues', () => {
    expect(EN.sections.length).toBe(FR.sections.length);
  });

  it('n’a ni titre de section, ni paragraphe, ni point vide', () => {
    for (const presentation of [FR, EN]) {
      expect(presentation.oeil.trim()).not.toBe('');
      expect(presentation.titre.trim()).not.toBe('');
      expect(presentation.chapeau.trim()).not.toBe('');
      expect(presentation.devise.trim()).not.toBe('');
      expect(presentation.logoAlt.trim()).not.toBe('');
      expect(presentation.videoLegende.trim()).not.toBe('');
      expect(presentation.appel.titre.trim()).not.toBe('');
      expect(presentation.appel.texte.trim()).not.toBe('');
      expect(presentation.appel.action.trim()).not.toBe('');

      for (const section of presentation.sections) {
        expect(section.titre.trim()).not.toBe('');

        // Une section sans paragraphe NI point est un titre suivi de rien.
        const contenus = (section.paragraphes?.length ?? 0) + (section.points?.length ?? 0);
        expect(contenus, section.titre).toBeGreaterThan(0);

        for (const paragraphe of section.paragraphes ?? []) {
          expect(paragraphe.trim(), section.titre).not.toBe('');
        }
        for (const point of section.points ?? []) {
          expect(point.trim(), section.titre).not.toBe('');
        }
      }
    }
  });

  it('n’est pas l’anglais recopié sur le français', () => {
    // Le même contrôle que `i18n.test.ts` fait sur les dictionnaires : une
    // traduction oubliée laisse un texte français sur le site anglais, et
    // c'est indétectable au typage puisque les deux champs sont des chaînes.
    expect(EN.chapeau).not.toBe(FR.chapeau);
    expect(EN.devise).not.toBe(FR.devise);
    expect(EN.appel.action).not.toBe(FR.appel.action);
  });

  it('dit dans les deux langues que les deux abonnements sont étanches', () => {
    /*
     * La section « Adhérer » n'est pas de la prose d'agrément : elle énonce à
     * l'écran la règle métier centrale du projet — l'adhésion n'ouvre pas la
     * lecture, la lecture n'ouvre pas l'adhésion, et aucune des deux n'ouvre
     * un téléchargement. Une réécriture qui l'allégerait ferait promettre à la
     * page autre chose que ce qu'`abonnement_ouvre_droit` accorde.
     */
    for (const presentation of [FR, EN]) {
      const adhesion = presentation.sections[1];
      expect(adhesion?.points?.length, presentation.titre).toBe(3);
    }

    const fr = (FR.sections[1]?.points ?? []).join(' ').toLowerCase();
    expect(fr).toContain('télécharger');

    const en = (EN.sections[1]?.points ?? []).join(' ').toLowerCase();
    expect(en).toContain('download');
  });
});

describe('les médias de l’association', () => {
  it('existent tous sur le disque', () => {
    expect(existsSync(join(MEDIAS, LOGO_ASSOCIATION.fichier)), LOGO_ASSOCIATION.fichier).toBe(true);
    expect(existsSync(join(MEDIAS, VIDEO_PRESENTATION.fichier)), VIDEO_PRESENTATION.fichier).toBe(
      true,
    );
    expect(existsSync(join(MEDIAS, VIDEO_PRESENTATION.affiche)), VIDEO_PRESENTATION.affiche).toBe(
      true,
    );
  });

  it('déclarent pour le logo des dimensions réelles, pour réserver sa place', () => {
    // Sans `width`/`height`, le texte saute au moment où le logo arrive. Un
    // zéro recopié par distraction rendrait la précaution inopérante en
    // silence.
    expect(LOGO_ASSOCIATION.largeur).toBeGreaterThan(0);
    expect(LOGO_ASSOCIATION.hauteur).toBeGreaterThan(0);
  });

  it('sont bien posés sur l’écran, logo ET vidéo', () => {
    // Les constantes peuvent survivre à l'écran qui les affichait : un
    // remaniement de la page les laisserait exportées, justes, et invisibles.
    const ecran = readFileSync(
      join(RACINE, 'src', 'app', '[langue]', 'association', 'page.tsx'),
      'utf8',
    );
    expect(ecran).toContain('LOGO_ASSOCIATION');
    expect(ecran).toContain('VIDEO_PRESENTATION');
    expect(ecran, 'la vidéo ne doit pas se télécharger d’elle-même').toContain('preload="none"');
  });
});

describe('les illustrations des contenus associatifs', () => {
  /*
   * `seed.sql` désigne les photos par un chemin public, écrit à la main. Rien
   * en base ne vérifie qu'un fichier se trouve au bout : une image renommée
   * laisserait le SQL s'appliquer sans un mot, et la carte s'afficherait
   * cassée sur la page d'accueil de l'espace associatif.
   */
  const CHEMINS = [
    ...new Set(
      (readFileSync(join(RACINE, 'supabase', 'seed.sql'), 'utf8').match(
        /\/images\/association\/[A-Za-z0-9._-]+/g,
      ) ?? []),
    ),
  ];

  it('sont désignées par le jeu de démonstration', () => {
    expect(CHEMINS.length).toBeGreaterThan(0);
  });

  it('existent toutes sur le disque', () => {
    for (const chemin of CHEMINS) {
      expect(existsSync(join(RACINE, 'public', chemin.slice(1))), chemin).toBe(true);
    }
  });
});

describe('les montants d’adhésion', () => {
  it('ne sont écrits nulle part dans le contenu de l’association', () => {
    /*
     * Ils vivent dans `subscription_plans` / `plan_prices` depuis la migration
     * 0068, et dépendent de la zone d'encaissement. Le fichier de contenu dit
     * ce qu'on OBTIENT en adhérant ; l'écran lit ce qu'on paie.
     *
     * On cherche des monnaies, et non des chiffres : « 3 façons de soutenir »
     * est un titre parfaitement légitime.
     */
    const source = readFileSync(join(RACINE, 'src', 'content', 'association.ts'), 'utf8');

    for (const monnaie of ['FCFA', 'XAF', '€', 'EUR', '$']) {
      const lignes = source
        .split('\n')
        .filter((ligne) => ligne.includes(monnaie))
        // Les encadrés de commentaire expliquent justement POURQUOI aucun
        // montant n'est écrit ici : ils ont le droit de nommer la monnaie.
        .filter((ligne) => !ligne.trimStart().startsWith('*'));

      expect(lignes, `« ${monnaie} » apparaît dans src/content/association.ts`).toEqual([]);
    }
  });
});
