import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import fr from '@/i18n/fr.json';
import en from '@/i18n/en.json';
import {
  LANGUES_INTERFACE,
  langueValide,
  messageErreur,
  traducteur,
  traduire,
} from '@/i18n';

import { fichiersSources } from '../helpers/sources';

/**
 * INTERNATIONALISATION — §5.5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ « L'architecture doit permettre d'ajouter une langue sans                │
 * │ redéveloppement, par simple ajout d'un fichier de traduction. »          │
 * │                                                                          │
 * │ Cette promesse ne tient que si les dictionnaires restent alignés. Une    │
 * │ clé ajoutée d'un seul côté ne casse rien : elle affiche simplement le    │
 * │ français à un lecteur anglophone, en silence, pendant des mois.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();

/** Chemins pointés de toutes les clés d'un dictionnaire. */
function clefs(objet: unknown, prefixe = ''): string[] {
  if (typeof objet !== 'object' || objet === null) return [];

  return Object.entries(objet).flatMap(([cle, valeur]) => {
    // Les clés de commentaire documentent le fichier ; elles ne sont jamais
    // affichées, et n'ont donc pas à exister dans les deux langues.
    if (cle === '_commentaire') return [];
    const chemin = prefixe ? `${prefixe}.${cle}` : cle;
    return typeof valeur === 'object' && valeur !== null ? clefs(valeur, chemin) : [chemin];
  });
}

describe('parité des dictionnaires', () => {
  it('les deux langues portent EXACTEMENT les mêmes clés', () => {
    const clefsFr = clefs(fr).sort();
    const clefsEn = clefs(en).sort();

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ GARDE D'EFFECTIF — sans elle, deux fichiers vides passeraient.     │
    // └────────────────────────────────────────────────────────────────────┘
    expect(clefsFr.length).toBeGreaterThan(40);

    expect(clefsEn).toEqual(clefsFr);
  });

  it('aucune traduction n’est vide', () => {
    for (const langue of LANGUES_INTERFACE) {
      for (const cle of clefs(langue === 'fr' ? fr : en)) {
        const valeur = traduire(langue, cle as never);
        expect(valeur.trim().length, `${langue} : ${cle} est vide`).toBeGreaterThan(0);
      }
    }
  });

  it('l’anglais n’est pas une copie du français', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE CONTRE-TEST DE LA PARITÉ.                                       │
    // │                                                                    │
    // │ Copier `fr.json` en `en.json` passerait le test de parité à la      │
    // │ perfection — et livrerait une interface anglaise entièrement en     │
    // │ français. La parité vérifie la FORME ; celui-ci vérifie qu'il y a    │
    // │ eu traduction.                                                     │
    // └────────────────────────────────────────────────────────────────────┘
    const communes = clefs(fr).filter((cle) => traduire('fr', cle as never) === traduire('en', cle as never));

    // Quelques valeurs coïncident légitimement : le nom de marque, « Sahel »,
    // « Catalogue », les libellés de langue. Au-delà, c'est une copie.
    expect(communes.length).toBeLessThan(clefs(fr).length / 3);
  });
});

describe('repli', () => {
  it('une clé absente en anglais rend le FRANÇAIS, jamais la clé brute', () => {
    // Un utilisateur voit alors un texte français — défaut visible pour
    // l'éditeur, acceptable pour lui. Une clé brute ne serait ni l'un ni
    // l'autre.
    const rendu = traduire('en', 'marque.baseline');
    expect(rendu).not.toBe('marque.baseline');
    expect(rendu.length).toBeGreaterThan(10);
  });

  it('une clé inconnue rend la clé plutôt que de lever', () => {
    // Un écran ne doit pas tomber parce qu'un libellé manque.
    expect(traduire('fr', 'inexistant.total' as never)).toBe('inexistant.total');
  });

  it('le traducteur lié rend la même chose que l’appel direct', () => {
    const t = traducteur('en');
    expect(t('navigation.catalogue')).toBe(traduire('en', 'navigation.catalogue'));
  });
});

describe('messages d’erreur', () => {
  it('sont branchés sur le CODE de l’API, pas sur son message', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ L'API rédige ses messages en FRANÇAIS uniquement. Les afficher tels │
    // │ quels rendrait l'anglais impossible — c'est précisément pourquoi    │
    // │ elle sépare `code` de `message`.                                    │
    // └────────────────────────────────────────────────────────────────────┘
    expect(messageErreur('en', 'session_expiree')).toMatch(/session/i);
    expect(messageErreur('en', 'session_expiree')).not.toBe(
      messageErreur('fr', 'session_expiree'),
    );
  });

  it('un code inconnu rend un message neutre, jamais une chaîne vide', () => {
    // Une version d'API plus récente ne doit pas produire un écran muet.
    for (const langue of LANGUES_INTERFACE) {
      expect(messageErreur(langue, 'code_venu_du_futur').length).toBeGreaterThan(5);
      expect(messageErreur(langue, undefined).length).toBeGreaterThan(5);
    }
  });

  it('couvre TOUS les codes que l’API peut rendre', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ ÉNUMÉRATION, PAS ÉCHANTILLONNAGE.                                  │
    // │                                                                    │
    // │ Les codes sont découverts dans les sources : un code ajouté demain │
    // │ sans sa traduction est signalé ici, et non découvert par un         │
    // │ utilisateur devant un message générique.                            │
    // └────────────────────────────────────────────────────────────────────┘
    const codes = new Set<string>();
    for (const fichier of fichiersSources(join(RACINE, 'src'))) {
      const source = readFileSync(fichier, 'utf8');
      // `code` SUIVI d'un `message` : c'est la forme de l'enveloppe d'erreur.
      // Sans cette contrainte, `code: 'mensuel'` — l'identifiant d'une offre —
      // serait pris pour un code d'erreur et réclamerait une traduction qui
      // n'aurait aucun sens.
      for (const trouve of source.matchAll(/code:\s*'([a-z_]+)',[\s\S]{0,200}?message:/g)) {
        if (trouve[1]) codes.add(trouve[1]);
      }
    }

    expect(codes.size).toBeGreaterThanOrEqual(12);

    const manquants = [...codes].filter(
      (code) => messageErreur('fr', code) === traduire('fr', 'erreurs.inconnue'),
    );

    expect(manquants).toEqual([]);
  });
});

describe('langue d’une valeur quelconque', () => {
  it('accepte les langues connues, replie tout le reste', () => {
    // Trois sources n'ont aucune raison d'être valides : le segment d'URL,
    // `users.langue_preferee` et l'en-tête `Accept-Language`.
    expect(langueValide('fr')).toBe('fr');
    expect(langueValide('en')).toBe('en');
    expect(langueValide('de')).toBe('fr');
    expect(langueValide(null)).toBe('fr');
    expect(langueValide(undefined)).toBe('fr');
    expect(langueValide('')).toBe('fr');
  });
});

describe('le nom commercial ne s’écrit qu’à un seul endroit', () => {
  it('les deux dictionnaires portent la MÊME chaîne — un nom propre ne se traduit pas', () => {
    expect(fr.marque.nom).toBe(en.marque.nom);
    expect(fr.marque.nom.length).toBeGreaterThan(3);
  });

  it('n’apparaît en dur nulle part ailleurs dans les sources', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉFAUT QUE CE TEST A RÉELLEMENT ATTRAPÉ.                        │
    // │                                                                    │
    // │ Le nom était écrit en dur à HUIT endroits de                       │
    // │ `src/domain/emails/templates.ts`, sous une orthographe — « Édition │
    // │ Mapoukam » — pendant que l'interface s'apprêtait à en adopter une   │
    // │ autre. Deux écritures de la même marque dans le même produit.      │
    // │                                                                    │
    // │ Et à la différence des autres cas de cette classe (§5 terdecies),  │
    // │ PERSONNE ne comparait ces deux valeurs : rien n'aurait signalé la  │
    // │ divergence. Un client aurait simplement reçu un email signé d'un   │
    // │ nom absent du site.                                                 │
    // └────────────────────────────────────────────────────────────────────┘
    const nom = fr.marque.nom;
    const autorises = ['src/i18n/fr.json', 'src/i18n/en.json', 'src/domain/marque.ts'];

    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((fichier) => readFileSync(fichier, 'utf8').includes(nom))
      .map((fichier) => fichier.replace(RACINE, '').replace(/\\/g, '/').replace(/^\//, ''))
      // `marque.ts` NE contient pas le littéral — il le lit. L'autorisation
      // est conservée par prudence, pas par nécessité.
      .filter((fichier) => !autorises.includes(fichier));

    expect(coupables).toEqual([]);
  });

  it('aucune écriture ORPHELINE du nom de maquette ne subsiste', () => {
    // « Sous le Baobab » a été inventé par l'outil de maquettage, au même
    // titre que les prix. Il ne doit plus figurer nulle part dans le code.
    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((f) => /Sous le Baobab|souslebaobab/i.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(RACINE, ''));

    expect(coupables).toEqual([]);
  });

  it('les emails signent du MÊME nom que l’interface', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Les emails sont le seul artefact du projet qui sorte vers un tiers │
    // │ en portant la marque. Une signature divergente du site est         │
    // │ exactement ce qu'un destinataire lit comme une tentative           │
    // │ d'hameçonnage.                                                      │
    // └────────────────────────────────────────────────────────────────────┘
    const modeles = readFileSync(
      join(RACINE, 'src', 'domain', 'emails', 'templates.ts'),
      'utf8',
    );

    expect(modeles).toContain("from '@/domain/marque'");
    // Garde d'effectif : sans occurrence, l'assertion précédente pourrait
    // porter sur un import inutilisé.
    expect([...modeles.matchAll(/NOM_COMMERCIAL/g)].length).toBeGreaterThanOrEqual(6);
  });
});
