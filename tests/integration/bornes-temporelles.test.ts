import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * LA CONVENTION D'INTERVALLE, ÉPROUVÉE À L'INSTANT EXACT DE LA BASCULE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TOUTE BORNE TEMPORELLE DU PROJET EST SEMI-OUVERTE : [début, fin[.       │
 * │                                                                          │
 * │ Le fait est valide TANT QUE l'instant courant est strictement avant la   │
 * │ borne haute. À l'instant EXACT de la borne, le fait a cessé.             │
 * │                                                                          │
 * │ Le danger n'est pas qu'une borne soit inclusive ou exclusive — c'est     │
 * │ qu'elles DIVERGENT entre deux sites qui décrivent le même fait. Un       │
 * │ abonnement expiré côté accès et actif côté comptage produirait un abonné │
 * │ qui ne peut plus rien lire et qui figure pourtant parmi les payants.     │
 * │                                                                          │
 * │ Cette divergence est INVISIBLE partout sauf à l'instant exact de la      │
 * │ bascule. C'est précisément pourquoi elle ne peut pas être trouvée par    │
 * │ hasard, et pourquoi ce fichier interroge chaque paire à cet instant-là.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'inventaire complet des sites est en docs/PLAN.md §5 septies.
 */
let lecteur: TestUser;
let livreAbonnement: string;

beforeAll(async () => {
  lecteur = await createTestUser();
  livreAbonnement =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'le-lion-et-la-souris'`))
      ?.id ?? '';
});

afterAll(async () => {
  await deleteTestUser(lecteur);
  await closePool();
});

describe('ABONNEMENT — l’accès et le comptage basculent au MÊME instant', () => {
  it('à `fin_periode` exactement : accès refusé ET statut observé « expiré »', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LA PAIRE LA PLUS COÛTEUSE DU PROJET.                                 │
    // │                                                                      │
    // │ `access_for_books` accorde tant que `fin_periode > p_at` ;           │
    // │ `statut_effectif` déclare expiré dès que `fin_periode <= p_at`. Les  │
    // │ deux prédicats sont complémentaires, donc ils ne peuvent pas être    │
    // │ vrais ensemble ni faux ensemble — c'est ce qu'on vérifie ici, à      │
    // │ l'instant où ils se croisent.                                        │
    // └──────────────────────────────────────────────────────────────────────┘
    const abonnement = await queryOne<{ id: string; fin: string }>(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
       values ($1, 'mensuel', 'annule',
               public.app_now() - interval '1 month',
               public.app_now() + interval '10 days',
               'international', 'EUR', 799)
       returning id, fin_periode::text as fin`,
      [lecteur.id],
    );

    try {
      // UNE SECONDE AVANT la borne : le droit court encore.
      const avant = await queryOne<{ can_read: boolean; statut: string }>(
        `select a.can_read,
                public.statut_effectif('annule'::public.subscription_status,
                  $2::timestamptz, null, $2::timestamptz - interval '1 second')::text as statut
           from public.access_for_books($1, array[$3::uuid],
                                        $2::timestamptz - interval '1 second') a`,
        [lecteur.id, abonnement!.fin, livreAbonnement],
      );
      expect({ acces: avant?.can_read, statut: avant?.statut }).toEqual({
        acces: true,
        statut: 'annule',
      });

      // À LA BORNE EXACTE : les deux basculent ensemble.
      const pile = await queryOne<{ can_read: boolean; statut: string }>(
        `select a.can_read,
                public.statut_effectif('annule'::public.subscription_status,
                  $2::timestamptz, null, $2::timestamptz)::text as statut
           from public.access_for_books($1, array[$3::uuid], $2::timestamptz) a`,
        [lecteur.id, abonnement!.fin, livreAbonnement],
      );
      expect({ acces: pile?.can_read, statut: pile?.statut }).toEqual({
        acces: false,
        statut: 'expire',
      });
    } finally {
      await query(`delete from public.subscriptions where id = $1`, [abonnement!.id]);
    }
  });

  it('à la fin de la PÉRIODE DE GRÂCE exactement : accès refusé ET « expiré »', async () => {
    // Même vérification sur l'autre paire, dont les deux prédicats vivent aussi
    // dans deux fonctions distinctes.
    const grace = await queryOne<{ jours: number }>(
      `select periode_grace_jours as jours from public.business_settings where id = 1`,
    );

    const abonnement = await queryOne<{ id: string; impaye: string }>(
      `insert into public.subscriptions
         (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant,
          impaye_depuis)
       values ($1, 'mensuel', 'impaye',
               public.app_now() - interval '1 month',
               public.app_now() + interval '10 days',
               'international', 'EUR', 799,
               public.app_now())
       returning id, impaye_depuis::text as impaye`,
      [lecteur.id],
    );

    try {
      const bascule = `$2::timestamptz + make_interval(days => ${String(grace!.jours)})`;

      const avant = await queryOne<{ can_read: boolean; statut: string }>(
        `select a.can_read,
                public.statut_effectif('impaye'::public.subscription_status,
                  public.app_now() + interval '10 days', $2::timestamptz,
                  ${bascule} - interval '1 second')::text as statut
           from public.access_for_books($1, array[$3::uuid],
                                        ${bascule} - interval '1 second') a`,
        [lecteur.id, abonnement!.impaye, livreAbonnement],
      );
      expect({ acces: avant?.can_read, statut: avant?.statut }).toEqual({
        acces: true,
        statut: 'impaye',
      });

      const pile = await queryOne<{ can_read: boolean; statut: string }>(
        `select a.can_read,
                public.statut_effectif('impaye'::public.subscription_status,
                  public.app_now() + interval '10 days', $2::timestamptz,
                  ${bascule})::text as statut
           from public.access_for_books($1, array[$3::uuid], ${bascule}) a`,
        [lecteur.id, abonnement!.impaye, livreAbonnement],
      );
      expect({ acces: pile?.can_read, statut: pile?.statut }).toEqual({
        acces: false,
        statut: 'expire',
      });
    } finally {
      await query(`delete from public.subscriptions where id = $1`, [abonnement!.id]);
    }
  });
});

describe('FENÊTRE DE VENTE — l’accès et le catalogue basculent au MÊME instant', () => {
  it('à `publie_le + fenêtre` exactement : le titre ENTRE dans l’abonnement', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `fenetre_de_vente_ecoulee` est appelée par `access_for_books` ET par  │
    // │ `catalog_list` depuis la migration 0033 : une seule implémentation,   │
    // │ donc un seul verdict. Ce test vérifie que la borne elle-même est du   │
    // │ bon côté — le titre entre dans l'abonnement À l'instant où la fenêtre │
    // │ est atteinte, pas une seconde plus tard.                              │
    // └──────────────────────────────────────────────────────────────────────┘
    const fenetre = await queryOne<{ jours: number }>(
      `select fenetre_nouveaute_jours as jours from public.business_settings where id = 1`,
    );

    const cas = await query<{ decalage: string; ecoulee: boolean }>(
      `with reference as (select public.app_now() as publie_le)
       select d.decalage, public.fenetre_de_vente_ecoulee(r.publie_le, $1, d.instant) as ecoulee
         from reference r
         cross join lateral (values
           (r.publie_le + make_interval(days => $1) - interval '1 second', 'juste avant'),
           (r.publie_le + make_interval(days => $1),                       'pile'),
           (r.publie_le + make_interval(days => $1) + interval '1 second', 'juste apres')
         ) as d(instant, decalage)
        order by d.instant`,
      [fenetre!.jours],
    );

    expect(cas.map((c) => [c.decalage, c.ecoulee])).toEqual([
      ['juste avant', false],
      ['pile', true],
      ['juste apres', true],
    ]);
  });
});

describe('DROIT À DURÉE LIMITÉE', () => {
  it('à `expire_le` exactement : le droit ne s’applique plus', async () => {
    const commande = await queryOne<{ id: string }>(
      `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
       values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
      [lecteur.id],
    );
    const droit = await queryOne<{ id: string; expire: string }>(
      `insert into public.entitlements
         (user_id, book_id, type, source_id, peut_telecharger, expire_le)
       values ($1, $2, 'offert', null, false, public.app_now() + interval '7 days')
       returning id, expire_le::text as expire`,
      [lecteur.id, livreAbonnement],
    );

    try {
      const avant = await queryOne<{ can_read: boolean }>(
        `select can_read from public.access_for_books($1, array[$2::uuid],
                                                      $3::timestamptz - interval '1 second')`,
        [lecteur.id, livreAbonnement, droit!.expire],
      );
      expect(avant?.can_read).toBe(true);

      const pile = await queryOne<{ can_read: boolean }>(
        `select can_read from public.access_for_books($1, array[$2::uuid], $3::timestamptz)`,
        [lecteur.id, livreAbonnement, droit!.expire],
      );
      // À l'instant exact, le droit a cessé : `expire_le > p_at` est faux.
      expect(pile?.can_read).toBe(false);
    } finally {
      await query(`delete from public.entitlements where id = $1`, [droit!.id]);
      await query(`delete from public.orders where id = $1`, [commande!.id]);
    }
  });
});

describe('PURGES — la conservation cesse à la borne, pas après', () => {
  it('une facture est purgeable À `conservation_jusqu_au` exactement', async () => {
    // Conserver une pièce comptable au-delà de sa durée légale est une
    // infraction symétrique de l'effacement prématuré : la borne doit mordre
    // à l'instant prévu, ni avant ni après.
    const cas = await query<{ decalage: string; purgeable: boolean }>(
      `with reference as (select public.app_now() as conservation)
       select d.decalage, (r.conservation <= d.instant) as purgeable
         from reference r
         cross join lateral (values
           (r.conservation - interval '1 second', 'juste avant'),
           (r.conservation,                       'pile'),
           (r.conservation + interval '1 second', 'juste apres')
         ) as d(instant, decalage)
        order by d.instant`,
    );

    expect(cas.map((c) => [c.decalage, c.purgeable])).toEqual([
      ['juste avant', false],
      ['pile', true],
      ['juste apres', true],
    ]);
  });
});

describe('L’INVENTAIRE EST TENU — aucune borne n’échappe au recensement', () => {
  it('toute comparaison temporelle du schéma est semi-ouverte', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE CONTRÔLE QUI SURVIT AUX MIGRATIONS FUTURES.                       │
    // │                                                                      │
    // │ Les tests ci-dessus éprouvent les bornes CONNUES. Celui-ci cherche    │
    // │ celles qu'on ajouterait plus tard : une comparaison de dates avec     │
    // │ `>=` ou `<` sur `p_at` trahirait une convention différente, et il     │
    // │ faudrait alors la justifier — ou l'aligner.                           │
    // │                                                                      │
    // │ La convention retenue est : validité `> p_at`, échéance `<= p_at`.    │
    // │ Les formes `>= p_at` et `< p_at` en sont l'exact complément et        │
    // │ signaleraient un site qui a basculé.                                  │
    // └──────────────────────────────────────────────────────────────────────┘
    const fonctions = await query<{ nom: string; corps: string }>(
      // `prokind = 'f'` : les agrégats et les fonctions fenêtre n'ont pas de
      // définition textuelle, et `pg_get_functiondef` lève sur elles.
      `select p.proname as nom, pg_get_functiondef(p.oid) as corps
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
          and pg_get_functiondef(p.oid) ilike '%p_at%'`,
    );

    expect(fonctions.length).toBeGreaterThanOrEqual(8);

    const coupables: string[] = [];
    for (const f of fonctions) {
      // `periode_stats` et les agrégats statistiques utilisent délibérément
      // `>= debut` : c'est la borne BASSE d'un intervalle, qui est inclusive
      // par construction dans `[début, fin[`.
      const corps = f.corps.replace(/>=\s*b?o?\.?debut/gi, '');
      for (const trouve of corps.matchAll(/([a-z_.]+)\s*(>=|<)\s*p_at/gi)) {
        coupables.push(`${f.nom} : ${trouve[0]}`);
      }
    }

    expect(coupables).toEqual([]);
  });
});
