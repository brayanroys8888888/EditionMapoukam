import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { closePool, query, queryOne } from '../helpers/db';

/**
 * L'ÉCRAN DES CODES PROMOTIONNELS — ce que la base doit lui rendre (0093).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE STATUT AFFICHÉ ET LA REMISE ACCORDÉE DOIVENT S'ACCORDER.             │
 * │                                                                          │
 * │ `statut_promo` en SQL dit ce que l'éditeur lit ; `calculerRemise` en     │
 * │ TypeScript décide ce que le client obtient. Ce sont deux implémentations │
 * │ de la même fenêtre de validité, et rien dans le code ne les relie.       │
 * │                                                                          │
 * │ Le jour où elles divergeraient, l'écran afficherait « Actif » sur un     │
 * │ code que le panier refuse — ou « Expiré » sur un code qui remise encore. │
 * │ Les tests ci-dessous éprouvent les MÊMES bornes des deux côtés.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const aEffacer: string[] = [];

afterEach(async () => {
  if (aEffacer.length > 0) {
    await query(`delete from public.promo_codes where code = any($1::text[])`, [aEffacer]);
    aEffacer.length = 0;
  }
});

afterAll(async () => {
  await closePool();
});

/**
 * Un code, aux dates relatives à `app_now()`.
 *
 * Une date absolue ferait basculer le statut le jour où le calendrier la
 * dépasserait, et le test tomberait sans que rien ait changé.
 */
async function code(
  nom: string,
  options: {
    debutDansJours?: number | null;
    finDansJours?: number | null;
    usageMax?: number | null;
    usageCount?: number;
    actif?: boolean;
  } = {},
): Promise<string> {
  aEffacer.push(nom);
  await query(
    `insert into public.promo_codes (code, type, valeur, debut_le, expire_le, usage_max, usage_count, actif)
     values ($1, 'pourcentage', 20,
             case when $2::int is null then null else public.app_now() + make_interval(days => $2::int) end,
             case when $3::int is null then null else public.app_now() + make_interval(days => $3::int) end,
             $4, $5, $6)`,
    [
      nom,
      options.debutDansJours ?? null,
      options.finDansJours ?? null,
      options.usageMax ?? null,
      options.usageCount ?? 0,
      options.actif ?? true,
    ],
  );
  return nom;
}

async function statut(nom: string): Promise<string | undefined> {
  const ligne = await queryOne<{ statut: string }>(
    `select statut::text from public.admin_lister_promos(1, 100, null, $1)`,
    [nom],
  );
  return ligne?.statut;
}

describe('le statut d’un code', () => {
  it('est « programmé » tant que son début n’est pas venu', async () => {
    await code('TESTPROG', { debutDansJours: 5, finDansJours: 30 });
    expect(await statut('TESTPROG')).toBe('programme');
  });

  it('est « actif » dans sa fenêtre', async () => {
    await code('TESTACTIF', { debutDansJours: -5, finDansJours: 30 });
    expect(await statut('TESTACTIF')).toBe('actif');
  });

  it('est « expiré » passé sa fin', async () => {
    await code('TESTEXPIRE', { debutDansJours: -30, finDansJours: -1 });
    expect(await statut('TESTEXPIRE')).toBe('expire');
  });

  it('est « épuisé » au plafond, mais « expiré » l’emporte', async () => {
    await code('TESTEPUISE', { usageMax: 10, usageCount: 10 });
    expect(await statut('TESTEPUISE')).toBe('epuise');

    /*
     * Un code à la fois épuisé ET expiré est dit EXPIRÉ : c'est la raison qui
     * ne se répare pas. Relever le plafond d'un code expiré ne le rendrait pas
     * acceptable, alors que prolonger un code épuisé, si.
     */
    await code('TESTDEUX', { finDansJours: -1, usageMax: 10, usageCount: 10 });
    expect(await statut('TESTDEUX')).toBe('expire');
  });

  it('est « désactivé » quoi qu’en disent les dates — la main humaine prime', async () => {
    await code('TESTOFF', { debutDansJours: -5, finDansJours: 30, actif: false });
    expect(await statut('TESTOFF')).toBe('inactif');
  });
});

describe('la fenêtre de validité', () => {
  it('refuse un début postérieur à la fin — en base, pas seulement à l’écran', async () => {
    aEffacer.push('TESTENVERS');
    await expect(
      query(
        `insert into public.promo_codes (code, type, valeur, debut_le, expire_le)
         values ('TESTENVERS', 'pourcentage', 20,
                 public.app_now() + interval '30 days', public.app_now() + interval '1 day')`,
      ),
    ).rejects.toThrow();
  });

  it('accepte une fenêtre ouverte d’un côté, ou des deux', async () => {
    await code('TESTSANS');
    expect(await statut('TESTSANS')).toBe('actif');

    await code('TESTDEBUT', { debutDansJours: -1 });
    expect(await statut('TESTDEBUT')).toBe('actif');
  });
});

describe('la forme d’un code', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE TIRET EST ADMIS, MAIS PAS N'IMPORTE OÙ.                           │
   * │                                                                      │
   * │ Décision du propriétaire du 27 septembre 2026 : « DAVE-ATELIER » se  │
   * │ dicte et se relit mieux que « DAVEATELIER ». Mais ni en tête, ni en  │
   * │ queue, ni doublé — un code ne commence pas par un tiret, et « A--B » │
   * │ se recopie mal.                                                      │
   * │                                                                      │
   * │ L'expression vit dans la ROUTE ; ce test la lit à la source plutôt   │
   * │ que d'en recopier une seconde, qui finirait par en diverger.          │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const SOURCE = 'src/app/api/admin/promos/route.ts';

  function motifDeLaRoute(): RegExp {
    const source = readFileSync(join(process.cwd(), SOURCE), 'utf8');
    const trouve = /\.regex\(\s*(\/\^[^/]+\$\/)/.exec(source)?.[1];
    expect(trouve, 'expression du code introuvable dans la route').toBeTruthy();
    // Reconstruite depuis le TEXTE de la route : pas d'évaluation de code.
    return new RegExp((trouve ?? '').slice(1, -1));
  }

  it('accepte un tiret entre deux groupes, et le refuse ailleurs', () => {
    const motif = motifDeLaRoute();

    for (const bon of ['BIENVENUE', 'DAVE-ATELIER', 'NOEL26', 'A-B-C', 'EM-2026-01']) {
      expect(motif.test(bon), `${bon} devrait être accepté`).toBe(true);
    }
    for (const mauvais of ['-DEBUT', 'FIN-', 'A--B', 'AVEC ESPACE', 'ACCENTÉ', 'PONCTU.ATION']) {
      expect(motif.test(mauvais), `${mauvais} devrait être refusé`).toBe(false);
    }
  });

  it('est acceptée par la BASE, qui n’impose que la casse et la longueur', async () => {
    aEffacer.push('TESTAVEC-TIRET');
    await query(
      `insert into public.promo_codes (code, type, valeur) values ('TESTAVEC-TIRET', 'pourcentage', 10)`,
    );
    expect(await statut('TESTAVEC-TIRET')).toBe('actif');
  });
});

describe('les compteurs de segments', () => {
  it('disent le même nombre que la liste', async () => {
    await code('ZZTESTA', { debutDansJours: 5 });
    await code('ZZTESTB', { debutDansJours: 5 });
    await code('ZZTESTC', { finDansJours: -1 });

    const comptes = new Map(
      (
        await query<{ statut: string; nb: string }>(
          `select * from public.admin_compter_promos_par_statut($1)`,
          ['ZZTEST'],
        )
      ).map((l) => [l.statut, Number(l.nb)]),
    );

    for (const etat of ['programme', 'expire']) {
      const liste = await query(`select id from public.admin_lister_promos(1, 100, $1, $2)`, [
        etat,
        'ZZTEST',
      ]);
      expect(comptes.get(etat), `désaccord sur ${etat}`).toBe(liste.length);
    }
  });

  it('rend les cinq statuts, y compris à zéro', async () => {
    const lignes = await query<{ statut: string }>(
      `select statut::text from public.admin_compter_promos_par_statut('aucun-code-de-ce-nom')`,
    );
    expect(lignes.map((l) => l.statut).sort()).toEqual(
      ['actif', 'epuise', 'expire', 'inactif', 'programme'].sort(),
    );
  });
});

describe('l’enregistrement depuis l’administration', () => {
  it('garde ses trois comportements : contrôle, réécriture, retour complet', async () => {
    const acteur = await queryOne<{ id: string }>(
      `select id from public.users where role = 'admin' limit 1`,
    );
    expect(acteur, 'un administrateur est nécessaire').toBeDefined();
    aEffacer.push('TESTUPSERT');

    /*
     * 1. Un code à MONTANT fixe sans devise ni zone est refusé — cinq euros de
     *    remise n'ont aucun sens sur un panier en FCFA.
     */
    await expect(
      query(
        `select public.admin_enregistrer_promo($1, 'TESTUPSERT', 'montant', 500, null, null)`,
        [acteur?.id],
      ),
    ).rejects.toThrow();

    // 2. Le retour porte la LIGNE entière, pas un identifiant.
    const cree = await queryOne<{ code: string; valeur: string }>(
      `select (public.admin_enregistrer_promo($1, 'TESTUPSERT', 'pourcentage', 20,
               null, null, null, null, true,
               public.app_now() + interval '2 days')).*`,
      [acteur?.id],
    );
    expect(cree?.code).toBe('TESTUPSERT');
    expect(await statut('TESTUPSERT')).toBe('programme');

    // 3. Le même code RÉÉCRIT la ligne au lieu d'en créer une seconde.
    await query(
      `select public.admin_enregistrer_promo($1, 'TESTUPSERT', 'pourcentage', 40)`,
      [acteur?.id],
    );
    const apres = await query(`select valeur, debut_le from public.promo_codes where code = 'TESTUPSERT'`);
    expect(apres).toHaveLength(1);
    expect(Number((apres[0] as { valeur: string }).valeur)).toBe(40);
    // La date de début a été EFFACÉE, comme tout champ absent d'une réécriture.
    expect((apres[0] as { debut_le: string | null }).debut_le).toBeNull();
    expect(await statut('TESTUPSERT')).toBe('actif');
  });
});
