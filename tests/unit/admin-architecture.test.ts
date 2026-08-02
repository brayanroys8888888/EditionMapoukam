import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { fichiersSources } from '../helpers/sources';

/**
 * Invariants de l'API d'administration, surveillés sur les sources.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI DES TESTS SUR LE TEXTE DU CODE, ICI PLUS QU'AILLEURS.           │
 * │                                                                          │
 * │ L'administration passe par `service_role` : RLS est contourné par         │
 * │ construction, et il n'y a pas de second filet sous le code. Les règles    │
 * │ ci-dessous ne peuvent donc pas être garanties par la base — seulement par │
 * │ la forme du code. Un commentaire les énonce ; ce fichier les tient.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();
const API = join(RACINE, 'src', 'app', 'api');
const ADMIN = join(API, 'admin');
const DEV = join(API, 'dev');

function chemin(absolu: string): string {
  return relative(RACINE, absolu).replace(/\\/g, '/');
}

/** Tous les modules de route sous un dossier. */
function routes(racine: string): { chemin: string; source: string }[] {
  return fichiersSources(racine)
    .filter((f) => f.endsWith('route.ts'))
    .map((f) => ({ chemin: chemin(f), source: readFileSync(f, 'utf8') }));
}

describe('LA CONSOLE /dev ET L’ADMINISTRATION RESTENT SÉPARÉES (point 8)', () => {
  /**
   * La console `/dev` simule ce qu'un prestataire externe ferait : un paiement,
   * un renouvellement, le passage du temps. Elle est interdite en production.
   *
   * L'administration agit sur des données réelles et doit fonctionner EN
   * production. Mélanger les deux aurait deux effets, tous deux mauvais : une
   * action de maintenance rendue inaccessible là où elle est indispensable, ou
   * un simulateur de paiement ouvert sur la production.
   */
  it('aucune route d’administration ne simule un paiement ni un webhook', () => {
    const interdits = [
      { motif: /FakePaymentProvider|fake-payment/i, quoi: 'faux prestataire de paiement' },
      { motif: /signerEvenement|signEvent|webhook-signature/i, quoi: 'signature de webhook' },
      { motif: /emettreEvenement|emitEvent/i, quoi: 'émission d’événement' },
      { motif: /paiement\.reussi|paiement\.echoue|abonnement\.souscrit/, quoi: 'événement simulé' },
    ];

    const coupables: string[] = [];
    for (const route of routes(ADMIN)) {
      for (const { motif, quoi } of interdits) {
        if (motif.test(route.source)) coupables.push(`${route.chemin} : ${quoi}`);
      }
    }

    expect(coupables).toEqual([]);
  });

  it('aucune route d’administration ne déplace l’horloge', () => {
    // Avancer le temps est une SIMULATION : cela déplace l'expiration des
    // abonnements et la fenêtre de vente de 3 mois. En production, ce serait
    // une altération de faits commerciaux.
    const coupables = routes(ADMIN)
      .filter((r) => /DevClock|avancer|applyDevClock|clearDevClock/i.test(r.source))
      .map((r) => r.chemin);

    expect(coupables).toEqual([]);
  });

  it('aucune route /dev n’appelle une opération d’administration', () => {
    // Le sens inverse, et il compte autant : la console `/dev` est inaccessible
    // en production. Une opération d'administration qui n'y vivrait que là
    // deviendrait introuvable le jour où elle sert.
    const coupables = routes(DEV)
      .filter((r) => /@\/lib\/admin\//.test(r.source))
      .map((r) => r.chemin);

    expect(coupables).toEqual([]);
  });

  it('la purge des copies est en ADMINISTRATION, pas dans /dev', () => {
    // C'est une opération de maintenance sur des données réelles : elle devra
    // tourner en production, où `/dev` est fermé.
    const enAdmin = routes(ADMIN).some((r) => /purgeCopies|purgerCopies/i.test(r.source));
    const enDev = routes(DEV).filter((r) => /purgerCopies/i.test(r.source)).map((r) => r.chemin);

    expect({ enAdmin, enDev }).toEqual({ enAdmin: true, enDev: [] });
  });
});

describe('AUCUN ACTEUR NE VIENT DU CLIENT (point 2)', () => {
  it('aucun schéma Zod de route d’administration n’accepte un acteur', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ « AGIR AU NOM DE » N'EXISTE PAS.                                     │
    // │                                                                      │
    // │ Un tel champ ferait de chaque route un point d'usurpation, et le      │
    // │ journal d'audit nommerait quelqu'un d'autre que l'auteur réel — un    │
    // │ journal auquel on ne peut pas se fier est pire qu'un journal absent.  │
    // │                                                                      │
    // │ Un `user_id` désignant une CIBLE reste légitime : suspendre le compte │
    // │ d'un autre est le métier même de l'administration. La distinction est │
    // │ entre agir SUR quelqu'un, qui est tracé, et agir EN TANT QUE          │
    // │ quelqu'un, qui n'existe pas.                                          │
    // └──────────────────────────────────────────────────────────────────────┘
    const coupables: string[] = [];

    for (const route of routes(ADMIN)) {
      // Les formulations qui trahiraient l'intention d'usurper.
      //
      // `auteur` est délibérément ABSENT de cette liste : c'est l'auteur du
      // CONTE, un champ de métadonnée parfaitement légitime que l'éditeur
      // renseigne. Une première version l'y avait mis et signalait deux routes
      // saines — un test qui crie au loup finit par être désactivé, ce qui coûte
      // plus cher que la règle qu'il prétendait tenir.
      const suspects = [
        ...route.source.matchAll(
          /(\w*(?:acteur|admin_id|as_user|on_behalf|impersonat|agir_en_tant_que)\w*)\s*:\s*z\./gi,
        ),
      ].map((m) => m[1]);

      if (suspects.length > 0) coupables.push(`${route.chemin} : ${suspects.join(', ')}`);
    }

    expect(coupables).toEqual([]);
  });

  it('chaque mutation prend l’acteur depuis la garde, jamais depuis le corps', () => {
    // L'acteur passé au service est toujours `garde.acteur.id`. Toute autre
    // provenance serait une usurpation possible.
    const coupables: string[] = [];

    for (const route of routes(ADMIN)) {
      // Les appels au service d'administration qui prennent un premier argument
      // autre que `garde.acteur.id`.
      for (const appel of route.source.matchAll(/await\s+(\w+)\(\s*\n?\s*([^,)\s]+)\s*,/g)) {
        const [, fonction, premier] = appel;
        if (!fonction || !premier) continue;
        // On ne s'intéresse qu'aux fonctions du service qui exigent un acteur.
        if (!/^(octroyer|retirer|modifier|definir|changer|enregistrer|rembourser|declencher)/.test(fonction)) {
          continue;
        }
        if (premier !== 'garde.acteur.id') {
          coupables.push(`${route.chemin} : ${fonction}(${premier}, …)`);
        }
      }
    }

    expect(coupables).toEqual([]);
  });
});

describe('CHAQUE ROUTE D’ADMINISTRATION PASSE PAR LA GARDE COMMUNE', () => {
  it('appelle `gardeAdmin`, qui porte le contrôle du rôle ET le quota', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA GARDE ET LE QUOTA SONT INSÉPARABLES.                              │
    // │                                                                      │
    // │ Réunis en un seul point d'entrée, ils ne peuvent pas être appliqués à │
    // │ moitié. Une route qui les recopierait un par un finirait par en       │
    // │ oublier un — et ce serait le quota, parce qu'il ne manque à personne   │
    // │ tant qu'aucun compte n'est compromis.                                 │
    // └──────────────────────────────────────────────────────────────────────┘
    const coupables = routes(ADMIN)
      .filter((r) => !r.source.includes('gardeAdmin('))
      .map((r) => r.chemin);

    // ZÉRO exception. `books/ingest` en était une, livrée à l'étape 7 : elle
    // vérifiait le rôle mais échappait au quota. La justification tenait en une
    // phrase — « le plafond de 100 Mo borne déjà son coût » — et cette phrase
    // était fausse : le plafond borne LA REQUÊTE, pas l'agrégat. Un jeton
    // compromis pouvait enchaîner les soumissions.
    expect(coupables).toEqual([]);
  });

  it('l’ingestion BORNE SA CONCURRENCE, son coût n’étant pas borné par le quota seul', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE QUOTA COMPTE LES REQUÊTES, LE SÉMAPHORE BORNE CE QU'ELLES         │
    // │ COÛTENT EN MÊME TEMPS.                                               │
    // │                                                                      │
    // │ Une ingestion lance poppler et `sharp` sur un document entier, en     │
    // │ mémoire. Trois cents requêtes par quart d'heure restent trois cents   │
    // │ requêtes : sans limite de concurrence, elles peuvent toutes être en   │
    // │ vol au même instant.                                                 │
    // └──────────────────────────────────────────────────────────────────────┘
    const source = readFileSync(join(ADMIN, 'books', 'ingest', 'route.ts'), 'utf8');

    expect(source).toContain('new Semaphore(');
    // L'attente est bornée : une file sans délai transforme une saturation en
    // requêtes suspendues indéfiniment.
    expect(source).toContain('avecDelai(');
  });

  it('aucune route d’administration ne mute une table directement', () => {
    // Toute mutation passe par une fonction `admin_*`, qui vérifie le rôle en
    // base et pose l'acteur pour les déclencheurs d'audit. Un `update` direct
    // depuis une route serait tracé avec un acteur nul, c'est-à-dire comme une
    // écriture système — le journal cesserait de dire qui a agi.
    const coupables: string[] = [];

    for (const route of routes(ADMIN)) {
      for (const table of [
        'books',
        'book_prices',
        'entitlements',
        'promo_codes',
        'business_settings',
        'subscriptions',
        'users',
      ]) {
        const motif = new RegExp(`from\\('${table}'\\)[\\s\\S]{0,80}?\\.(update|insert|upsert|delete)\\(`);
        if (motif.test(route.source)) coupables.push(`${route.chemin} : ${table}`);
      }
    }

    expect(coupables).toEqual([]);
  });
});

describe('le journal d’audit ne s’écrit ni ne s’efface depuis le code', () => {
  it('aucun module ne modifie `admin_audit_log`', () => {
    // La table refuse `update`, `delete` et `truncate` à tout le monde, y
    // compris `service_role`. Ce test attrape l'intention avant le refus, pour
    // que l'auteur comprenne pourquoi plutôt que de buter sur une erreur de
    // privilège.
    const coupables = fichiersSources(join(RACINE, 'src'))
      .filter((f) => !f.endsWith('database.types.ts'))
      .filter((f) => {
        const source = readFileSync(f, 'utf8');
        return /from\('admin_audit_log'\)[\s\S]{0,80}?\.(update|delete|insert|upsert)\(/.test(source);
      })
      .map(chemin);

    expect(coupables).toEqual([]);
  });
});
