import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { octroyerDroit } from '@/lib/admin/service';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, serviceClient, type TestUser } from '../helpers/users';
import { fichiersSources } from '../helpers/sources';

/**
 * LES ÉCRIVAINS DE `entitlements`, ÉNUMÉRÉS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `entitlements` EST LA TABLE QUI DÉCIDE QUI PEUT LIRE ET TÉLÉCHARGER.     │
 * │                                                                          │
 * │ Toute écriture y accorde ou retire un accès payant. Il n'y a donc pas de │
 * │ « petite » écriture sur cette table, et aucune ne doit passer inaperçue. │
 * │                                                                          │
 * │ Ce fichier fait DEUX choses distinctes :                                 │
 * │                                                                          │
 * │   * il ÉNUMÈRE les écrivains dans les sources, et échoue si un nouveau   │
 * │     apparaît sans avoir été inscrit ici ;                                │
 * │   * il éprouve la barrière en BASE : une route applicative ne peut plus  │
 * │     écrire sans acteur identifié.                                        │
 * │                                                                          │
 * │ Le premier attrape l'intention, le second attrape le fait.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();

/**
 * Les seuls écrivains admis, avec la raison de chacun.
 *
 * Toute entrée nouvelle doit être ajoutée ICI, délibérément. C'est le point de
 * cette liste : rendre l'ajout d'un écrivain visible dans un diff.
 */
const ECRIVAINS_ADMIS: readonly { fichier: string; role: string }[] = [
  {
    fichier: 'supabase/migrations/20260728000023_fulfillment.sql',
    role: 'ACHAT — la seule voie qui accorde le droit de télécharger (règle métier centrale)',
  },
  {
    fichier: 'supabase/migrations/20260730000041_file_emails.sql',
    role:
      'ACHAT (reprise) — `fulfill_order` est redéclarée VERBATIM pour y ajouter la ' +
      'programmation de l’email de confirmation, dans la même transaction que l’octroi. ' +
      'L’octroi lui-même est inchangé, à la ligne près.',
  },
  {
    fichier: 'supabase/migrations/20260728000027_refund_par_ligne.sql',
    role: 'REMBOURSEMENT — retire les droits LIGNE PAR LIGNE (arbitrage Q9.1)',
  },
  {
    fichier: 'supabase/migrations/20260729000036_admin_mutations.sql',
    role: 'OCTROI ET RETRAIT MANUELS — acteur et motif obligatoires',
  },
  {
    fichier: 'supabase/migrations/20260728000014_anonymize_and_purge.sql',
    role: 'ANONYMISATION — efface les droits d’un compte effacé (R2)',
  },
  {
    fichier: 'supabase/migrations/20260728000015_dev_reset.sql',
    role: 'CONSOLE /dev — remise à zéro du jeu de démonstration, interdite en production',
  },
  {
    fichier: 'supabase/migrations/20260728000031_reset_copies.sql',
    role: 'CONSOLE /dev — reprise de la remise à zéro, étendue aux copies filigranées',
  },
];

let editeur: TestUser;
let client: TestUser;
let livreId: string;

beforeAll(async () => {
  editeur = await createTestUser({ admin: true });
  client = await createTestUser();
  livreId =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'petit-baobab'`))
      ?.id ?? '';
});

afterAll(async () => {
  await deleteTestUser(editeur);
  await deleteTestUser(client);
  await closePool();
});

describe('ÉNUMÉRATION des écrivains dans les sources', () => {
  /** Toute écriture sur `entitlements`, trouvée dans le SQL et le TypeScript. */
  function ecrivainsTrouves(): string[] {
    const trouves = new Set<string>();

    const sql = fichiersSources(join(RACINE, 'supabase', 'migrations'), /\.sql$/);
    const ts = fichiersSources(join(RACINE, 'src'));

    for (const chemin of [...sql, ...ts]) {
      if (chemin.endsWith('database.types.ts')) continue;
      const source = readFileSync(chemin, 'utf8');

      const ecritSql =
        /(insert\s+into|update|delete\s+from)\s+public\.entitlements/i.test(source);
      const ecritTs =
        /from\('entitlements'\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(/.test(source);

      if (ecritSql || ecritTs) {
        trouves.add(chemin.replace(RACINE, '').replace(/\\/g, '/').replace(/^\//, ''));
      }
    }

    return [...trouves].sort();
  }

  it('parcourt bien les sources — sinon l’énumération ne prouverait rien', () => {
    // Une liste vide d'écrivains se lirait comme « aucun écrivain non déclaré »,
    // alors qu'elle signifierait « le parcours n'a rien lu ».
    expect(ecrivainsTrouves().length).toBeGreaterThanOrEqual(4);
  });

  it('n’en trouve AUCUN hors de la liste admise', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UN ÉCRIVAIN NON DÉCLARÉ EST UN ACCÈS ACCORDÉ SANS DÉCISION.          │
    // │                                                                      │
    // │ Ce test ne dit pas qu'un nouvel écrivain est interdit : il dit qu'il  │
    // │ doit être AJOUTÉ À LA LISTE, avec sa raison. L'ajout devient alors    │
    // │ visible dans un diff, et non noyé dans une migration de deux cents    │
    // │ lignes.                                                              │
    // └──────────────────────────────────────────────────────────────────────┘
    const admis = new Set(ECRIVAINS_ADMIS.map((e) => e.fichier));
    const inconnus = ecrivainsTrouves().filter((f) => !admis.has(f));

    expect(inconnus).toEqual([]);
  });

  it('trouve RÉELLEMENT chaque écrivain déclaré', () => {
    // Le sens inverse : une entrée qui désignerait un fichier ne contenant plus
    // d'écriture rendrait la liste trompeuse, et masquerait le jour où un vrai
    // écrivain prendrait sa place.
    const trouves = new Set(ecrivainsTrouves());
    const fantomes = ECRIVAINS_ADMIS.filter((e) => !trouves.has(e.fichier)).map((e) => e.fichier);

    expect(fantomes).toEqual([]);
  });

  it('n’admet AUCUN écrivain dans `src/` — tout passe par une fonction SQL', () => {
    // Une écriture depuis TypeScript contournerait `admin_poser_acteur` et
    // serait tracée avec un acteur nul : le journal cesserait de dire qui a
    // accordé l'accès.
    const enTypeScript = ECRIVAINS_ADMIS.filter((e) => e.fichier.startsWith('src/'));

    expect(enTypeScript).toEqual([]);
  });
});

describe('LA BARRIÈRE EN BASE — l’acteur n’est facultatif qu’en connexion directe', () => {
  it('DISTINGUE une requête applicative d’une connexion directe', () => {
    // Le fondement de tout ce qui suit : sans cette distinction, la contrainte
    // ne pourrait s'appuyer que sur l'intention de l'appelant.
    //
    // Ce test tourne en connexion directe (`pg`), donc le contexte est absent.
    return queryOne<{ applicatif: boolean }>(
      `select public.contexte_applicatif() as applicatif`,
    ).then((r) => {
      expect(r?.applicatif).toBe(false);
    });
  });

  it('voit le contexte applicatif à travers PostgREST', async () => {
    // Le pendant, et il est indispensable : si `contexte_applicatif()` rendait
    // `false` partout, la contrainte ne s'appliquerait jamais et les tests de
    // refus ci-dessous passeraient pour de mauvaises raisons.
    const { data, error } = await serviceClient().rpc('contexte_applicatif');

    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('REFUSE un octroi sans acteur venant d’une route applicative', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA CORRECTION D'A1.                                                  │
    // │                                                                      │
    // │ Avant, une route applicative pouvait écrire sans acteur et produire   │
    // │ une trace indiscernable d'un seed. La distinction ne tenait qu'à une  │
    // │ convention ; elle tient désormais à une propriété de la connexion,    │
    // │ que le code applicatif ne peut pas se donner.                        │
    // └──────────────────────────────────────────────────────────────────────┘
    const { error } = await serviceClient().from('entitlements').insert({
      user_id: client.id,
      book_id: livreId,
      type: 'offert',
      peut_telecharger: false,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/acteur/i);

    expect(
      await query(`select 1 from public.entitlements where user_id = $1`, [client.id]),
    ).toHaveLength(0);
  });

  it('TOLÈRE un octroi sans acteur en connexion directe — seeds et fixtures', async () => {
    // L'exception assumée, et le test qui la borne : ce chemin reste ouvert aux
    // migrations, aux seeds et aux fixtures, qui n'ont pas d'administrateur
    // derrière elles. La trace porte alors un acteur nul, ce qui la distingue
    // d'une décision humaine au lieu de la confondre avec elle.
    await query(
      `insert into public.entitlements (user_id, book_id, type, peut_telecharger)
       values ($1, $2, 'offert', false)`,
      [client.id, livreId],
    );

    const trace = await queryOne<{ acteur_id: string | null }>(
      `select acteur_id from public.admin_audit_log
        where action = 'droit_octroye' order by cree_le desc limit 1`,
    );
    expect(trace?.acteur_id).toBeNull();

    await query(`delete from public.entitlements where user_id = $1`, [client.id]);
  });

  it('ACCEPTE le chemin nominal : acteur et motif fournis', async () => {
    // Sans ce test, les refus ci-dessus passeraient sur une table devenue
    // simplement inaccessible en écriture.
    const resultat = await octroyerDroit(editeur.id, {
      userId: client.id,
      bookId: livreId,
      motif: 'Contrôle du chemin nominal.',
    });

    expect(resultat.ok).toBe(true);

    await query(`delete from public.entitlements where user_id = $1`, [client.id]);
  });
});

describe('LE RETRAIT CONSIGNE LA LIGNE ENTIÈRE (correction A2)', () => {
  it('capture de quoi reconstituer un droit `offert` supprimé', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ UN DROIT `offert` N'A AUCUNE AUTRE TRACE.                            │
    // │                                                                      │
    // │ Un achat a sa commande et sa facture ; un octroi manuel n'a que sa    │
    // │ ligne. La supprimer en n'en gardant que trois champs rendait la       │
    // │ décision non seulement irréversible, mais IRRECONSTITUABLE.           │
    // └──────────────────────────────────────────────────────────────────────┘
    const octroi = await octroyerDroit(editeur.id, {
      userId: client.id,
      bookId: livreId,
      motif: 'Droit destiné à être retiré, pour éprouver la trace.',
      peutTelecharger: true,
    });
    expect(octroi.ok).toBe(true);

    const droit = await queryOne<{ id: string; accorde_le: Date }>(
      `select id, accorde_le from public.entitlements where user_id = $1`,
      [client.id],
    );

    await query(`select public.admin_retirer_droit($1, $2, $3)`, [
      editeur.id,
      droit!.id,
      'Retrait de contrôle.',
    ]);

    const trace = await queryOne<{ ancienne_valeur: Record<string, unknown> }>(
      `select ancienne_valeur from public.admin_audit_log
        where action = 'droit_retire' order by cree_le desc limit 1`,
    );

    // Tous les champs de la ligne, et non trois : c'est ce qui permet de la
    // rétablir à l'identique après une erreur.
    for (const colonne of [
      'id',
      'user_id',
      'book_id',
      'type',
      'source_id',
      'peut_telecharger',
      'accorde_le',
      'expire_le',
    ]) {
      expect(trace?.ancienne_valeur).toHaveProperty(colonne);
    }

    expect(trace?.ancienne_valeur).toMatchObject({
      id: droit!.id,
      user_id: client.id,
      book_id: livreId,
      type: 'offert',
      peut_telecharger: true,
    });
  });

  it('couvre TOUTES les colonnes de la table, même celles ajoutées plus tard', async () => {
    // `to_jsonb(old)` capture la ligne entière : une colonne ajoutée à
    // `entitlements` sera consignée sans qu'il faille y penser. Ce test le
    // vérifie en comparant à la définition réelle de la table, plutôt qu'à une
    // liste recopiée qui se périmerait.
    const colonnes = await query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'entitlements'`,
    );

    const trace = await queryOne<{ ancienne_valeur: Record<string, unknown> }>(
      `select ancienne_valeur from public.admin_audit_log
        where action = 'droit_retire' order by cree_le desc limit 1`,
    );

    const manquantes = colonnes
      .map((c) => c.column_name)
      .filter((nom) => !(nom in (trace?.ancienne_valeur ?? {})));

    expect(manquantes).toEqual([]);
  });
});
