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
