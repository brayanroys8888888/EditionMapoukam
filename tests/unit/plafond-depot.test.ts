import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TAILLE_MAX_OCTETS } from '@/app/api/admin/books/ingest/route';

/**
 * LE PLAFOND DU DÉPÔT D'UN CONTE, ET SES TROIS ENDROITS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DÉFAUT QUE CE TEST EMPÊCHE DE REVENIR.                               │
 * │                                                                          │
 * │ L'écran de dépôt annonçait « cent mégaoctets au plus », la route          │
 * │ d'ingestion acceptait bien cent mégaoctets — et le dépôt échouait pour   │
 * │ CHAQUE conte du corpus, tous à 1,1 Mo.                                   │
 * │                                                                          │
 * │ La cause était un TROISIÈME plafond que personne n'avait écrit : Next     │
 * │ borne le corps d'une Server Action à 1 Mo par défaut. Le serveur          │
 * │ journalisait « Body exceeded 1 MB limit » ; l'éditeur, lui, voyait        │
 * │ l'écran d'erreur générique, sans aucun moyen de relier les deux.          │
 * │                                                                          │
 * │ Un plafond invisible est pire qu'un plafond bas : celui-ci refuse en      │
 * │ disant pourquoi, celui-là fait croire à une panne.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce test lit le TEXTE de `next.config.ts` plutôt que d'importer le module :
 * la configuration de Next est chargée par l'outil de build, pas par
 * l'application, et l'importer ici ferait dépendre la suite unitaire d'un
 * chargeur qu'elle n'a aucune raison d'exercer.
 */
const RACINE = process.cwd();
const CONFIG = readFileSync(join(RACINE, 'next.config.ts'), 'utf8');

/** Convertit « 100mb » en octets. */
function enOctets(valeur: string): number {
  const trouve = /^(\d+)(kb|mb|gb)$/i.exec(valeur.trim());
  if (!trouve) throw new Error(`Taille illisible : ${valeur}`);

  const nombre = Number(trouve[1]);
  const unite = (trouve[2] ?? '').toLowerCase();
  const facteur = unite === 'kb' ? 1024 : unite === 'mb' ? 1024 * 1024 : 1024 * 1024 * 1024;

  return nombre * facteur;
}

describe('le plafond de corps des Server Actions', () => {
  it('est DÉCLARÉ — sans quoi Next retombe sur 1 Mo, sous la taille d’un conte', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ La valeur par défaut n'est écrite nulle part dans ce dépôt : c'est  │
    // │ ce qui l'a rendue introuvable. Ce test exige qu'elle soit choisie.  │
    // └────────────────────────────────────────────────────────────────────┘
    expect(CONFIG).toMatch(/bodySizeLimit\s*:\s*'[^']+'/);
  });

  it('vaut EXACTEMENT le plafond de la route d’ingestion', () => {
    const trouve = /bodySizeLimit\s*:\s*'([^']+)'/.exec(CONFIG);
    expect(trouve).not.toBeNull();

    expect(enOctets(trouve?.[1] ?? '')).toBe(TAILLE_MAX_OCTETS);
  });

  it('n’est PAS le seul plafond : celui du proxy le rendrait sans effet', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE MÊME DÉFAUT, REVENU PAR UNE AUTRE PORTE.                        │
    // │                                                                    │
    // │ `bodySizeLimit` était bien à cent mégaoctets, et le dépôt d'un      │
    // │ livret de plus de dix mégaoctets échouait quand même : Next 16      │
    // │ borne à 10 Mo le corps de toute requête dès qu'un proxy est         │
    // │ déclaré — et `middleware.ts` en est un.                             │
    // │                                                                    │
    // │ Ce plafond-là ne refuse pas, il TRONQUE. Le formulaire multipart    │
    // │ s'arrêtait au milieu, et l'éditeur lisait « Unexpected end of       │
    // │ form » : une erreur de syntaxe pour une cause de taille.            │
    // └────────────────────────────────────────────────────────────────────┘
    expect(CONFIG).toMatch(/proxyClientMaxBodySize\s*:\s*'[^']+'/);
  });

  it('vaut le MÊME nombre que le plafond du proxy', () => {
    const action = /bodySizeLimit\s*:\s*'([^']+)'/.exec(CONFIG);
    const proxy = /proxyClientMaxBodySize\s*:\s*'([^']+)'/.exec(CONFIG);

    expect(enOctets(proxy?.[1] ?? '')).toBe(TAILLE_MAX_OCTETS);
    expect(enOctets(proxy?.[1] ?? '')).toBe(enOctets(action?.[1] ?? ''));
  });

  it('n’emploie pas le nom déprécié, que Next refuse de cumuler', () => {
    // `experimental.middlewareClientMaxBodySize` est l'ancien nom du même
    // réglage. Déclarer les deux n'est pas une redondance inoffensive : Next
    // lève au démarrage, et le serveur ne part plus du tout.
    // Le nom peut être CITÉ en commentaire — il l'est juste au-dessus, et
    // dans la configuration, pour expliquer le choix. Ce qui est interdit,
    // c'est de le DÉCLARER.
    expect(CONFIG).not.toMatch(/middlewareClientMaxBodySize\s*:/);
  });

  it('dépasse largement le plus lourd des contes du corpus', () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Le contre-test, et il compte autant que l'égalité ci-dessus.        │
    // │                                                                    │
    // │ Aligner deux plafonds ne prouve rien s'ils sont tous les deux trop  │
    // │ bas : les faire valoir 1 Mo chacun passerait les deux premières     │
    // │ assertions, et le dépôt échouerait exactement comme avant.          │
    // │                                                                    │
    // │ Les contes du corpus pèsent 1,1 Mo. Dix mégaoctets sont un seuil    │
    // │ délibérément prudent : il laisse la place à un conte plus richement │
    // │ illustré sans prétendre décrire le corpus actuel.                   │
    // └────────────────────────────────────────────────────────────────────┘
    expect(TAILLE_MAX_OCTETS).toBeGreaterThan(10 * 1024 * 1024);
  });
});

describe('le formulaire de dépôt', () => {
  const ECRAN = join(RACINE, 'src', 'app', '[langue]', 'admin', 'contes', 'nouveau', 'page.tsx');
  const source = readFileSync(ECRAN, 'utf8');

  it('n’impose PAS d’`encType` — React le pose et écrase celui qu’on écrit', () => {
    // Un formulaire dont l'action est une fonction est encodé par React, qui
    // avertit en console qu'il remplacera l'encodage posé à la main. Le laisser
    // faisait croire que le dépôt était configuré là, alors que le seul réglage
    // qui compte vit dans `next.config.ts`.
    expect(source).not.toMatch(/encType=/);
  });

  it('n’accepte que des PDF, et le dit au sélecteur de fichier', () => {
    // La route vérifie la signature `%PDF-` et refuse le reste. L'`accept` ne
    // protège rien — il évite seulement de choisir un fichier qui sera refusé
    // après plusieurs mégaoctets de téléversement.
    expect(source).toMatch(/accept="application\/pdf,\.pdf"/);
  });
});
