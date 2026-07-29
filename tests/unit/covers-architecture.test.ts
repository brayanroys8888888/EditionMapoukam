import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  LARGEUR_PUBLIQUE_MAX,
  TAILLES_COUVERTURE,
  cheminCouverture,
  nouveauJetonCouverture,
} from '@/lib/storage/covers';

import { fichiersSources } from '../helpers/sources';

/**
 * LE BUCKET PUBLIC NE CONTIENT QUE DES COUVERTURES.
 *
 * C'est le seul bucket en accès libre du projet. Une erreur d'aiguillage dans
 * la chaîne d'ingestion y déposerait des pages de livre ou un fichier complet,
 * librement téléchargeables et indexables par les moteurs de recherche — le
 * modèle économique tomberait sans qu'aucune alarme ne se déclenche.
 *
 * Ce test est ce qui rend la règle réelle plutôt que verbale : il n'existe
 * aucune barrière technique côté stockage, un bucket public l'étant pour tout
 * ce qu'on y met.
 */
const RACINE = process.cwd();
const MODULE_AUTORISE = join('src', 'lib', 'storage', 'covers.ts');

describe('écriture dans le bucket public', () => {
  it('n’est faite que par le module de couvertures', () => {
    // On cherche l'usage du bucket, pas sa simple mention : `from('covers')`
    // est le seul moyen d'y écrire via le client de stockage.
    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((chemin) => /from\(\s*['"]covers['"]\s*\)/.test(readFileSync(chemin, 'utf8')))
      .map((chemin) => relative(RACINE, chemin))
      .filter((chemin) => chemin !== MODULE_AUTORISE);

    expect(coupables).toEqual([]);
  });

  it('est bien faite par ce module — sinon ce test ne prouverait rien', () => {
    const source = readFileSync(join(RACINE, MODULE_AUTORISE), 'utf8');

    expect(source).toMatch(/from\(BUCKET_PUBLIC\)/);
  });

  it('ne dépose que des images, jamais un PDF ni un EPUB', () => {
    const source = readFileSync(join(RACINE, MODULE_AUTORISE), 'utf8');

    expect(source).toContain("contentType: 'image/webp'");
    expect(source).not.toMatch(/application\/pdf|application\/epub/);
  });
});

describe('chemins non devinables', () => {
  it('reposent sur un identifiant aléatoire, jamais sur le titre', () => {
    // Sinon la couverture d'un titre en brouillon serait accessible à qui
    // devine l'URL, et les prochaines parutions fuiteraient avant l'annonce.
    const premier = nouveauJetonCouverture();
    const second = nouveauJetonCouverture();

    expect(premier).not.toBe(second);
    expect(premier).toMatch(/^[0-9a-f]{32}$/);
  });

  it('ne laissent pas deviner une taille depuis une autre d’un autre titre', () => {
    const jetonA = nouveauJetonCouverture();
    const jetonB = nouveauJetonCouverture();

    expect(cheminCouverture(jetonA, 'vignette')).not.toContain(jetonB);
    expect(cheminCouverture(jetonA, 'fiche')).toContain(jetonA);
  });

  it('ne contiennent aucun identifiant séquentiel', () => {
    const chemin = cheminCouverture(nouveauJetonCouverture(), 'vignette');

    expect(chemin).not.toMatch(/\/\d+\//);
  });
});

describe('résolutions publiées', () => {
  it('se limitent aux tailles d’affichage du catalogue', () => {
    expect(Object.keys(TAILLES_COUVERTURE).sort()).toEqual([
      'fiche',
      'mise-en-avant',
      'vignette',
    ]);
  });

  it('restent sous la largeur maximale d’affichage', () => {
    // L'original haute définition reste dans le stockage privé, avec les
    // fichiers sources : c'est lui qui servirait à une réimpression.
    for (const [nom, largeur] of Object.entries(TAILLES_COUVERTURE)) {
      expect({ nom, depasse: largeur > LARGEUR_PUBLIQUE_MAX }).toEqual({ nom, depasse: false });
    }
  });
});
