import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAccess, getAccessForBooks, getAccessListe } from '@/lib/access/engine';
import type { AppSupabaseClient } from '@/lib/supabase/clients';

import { closePool, getPool, query, queryOne } from '../helpers/db';
import { anonClient, createTestUser, deleteTestUser, type TestUser } from '../helpers/users';
import { FixedClock } from '@/lib/clock/fixed-clock';
import { applyDevClock, clearDevClock } from '@/lib/supabase/dev-clock-session';

/**
 * Chemin anonyme et branchement RLS du moteur de droits.
 *
 * Deux garanties distinctes :
 *
 *   1. `access_for` doit fonctionner pour un appelant NON AUTHENTIFIÉ. La
 *      fonction lit `entitlements` et `subscriptions`, tables auxquelles `anon`
 *      n'a aucun accès : sans `security definer`, un visiteur ne pourrait
 *      jamais lire un conte gratuit.
 *
 *   2. Les politiques RLS appellent la MÊME fonction que l'application. Si le
 *      serveur oubliait un contrôle, la base le rattraperait.
 */
let lecteur: TestUser;
let livrePayant: string;
let livreGratuit: string;

beforeAll(async () => {
  lecteur = await createTestUser();
  livrePayant =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'le-lion-et-la-souris'`))
      ?.id ?? '';
  livreGratuit =
    (await queryOne<{ id: string }>(`select id from public.books where slug = 'petit-baobab'`))?.id ??
    '';
});

afterAll(async () => {
  await deleteTestUser(lecteur);
  await closePool();
});

describe('appelant non authentifié', () => {
  it('obtient l’extrait sur un titre payant', async () => {
    const decision = await getAccess(null, livrePayant);

    expect(decision).toEqual({ canRead: false, canDownload: false, reason: 'preview' });
  });

  it('lit intégralement un conte gratuit', async () => {
    const decision = await getAccess(null, livreGratuit);

    expect(decision).toEqual({ canRead: true, canDownload: false, reason: 'free' });
  });

  it('est servi par la fonction appelée en tant qu’anon', async () => {
    // Le chemin réellement emprunté par une politique RLS : `anon` n'a aucun
    // droit sur entitlements ni subscriptions, et pourtant la fonction répond.
    const { data, error } = await anonClient().rpc('access_for_books', {
      p_user: null as unknown as string,
      p_books: [livreGratuit],
    });

    expect(error).toBeNull();
    expect(data).toEqual([
      { book_id: livreGratuit, can_read: true, can_download: false, reason: 'free' },
    ]);
  });

  it('ne peut pas se faire passer pour un autre utilisateur', async () => {
    // La fonction accepte un identifiant en paramètre : c'est le serveur qui le
    // fournit, depuis une session vérifiée. Un client qui l'appellerait
    // directement avec l'identifiant d'autrui n'obtiendrait que ce que cet
    // autre a déjà — aucune donnée personnelle ne transite, seulement trois
    // booléens. La vraie barrière reste que les routes ne prennent jamais
    // l'identifiant depuis la requête.
    const { data } = await anonClient().rpc('access_for_books', {
      p_user: lecteur.id,
      p_books: [livrePayant],
    });

    expect(data).toEqual([
      { book_id: livrePayant, can_read: false, can_download: false, reason: 'preview' },
    ]);
  });
});

describe('progression de lecture soumise au moteur de droits', () => {
  it('refuse d’enregistrer la progression d’un titre non accessible', async () => {
    const { error } = await lecteur.client
      .from('reading_progress')
      .insert({ user_id: lecteur.id, book_id: livrePayant, derniere_page: 3 });

    expect(error).not.toBeNull();
  });

  it('accepte la progression sur un conte gratuit', async () => {
    const { error } = await lecteur.client
      .from('reading_progress')
      .insert({ user_id: lecteur.id, book_id: livreGratuit, derniere_page: 3 });

    expect(error).toBeNull();
  });

  it('accepte la progression dès que le droit existe', async () => {
    const commande = await queryOne<{ id: string }>(
      `insert into public.orders (user_id, montant_total, devise, zone, statut, paye_le)
       values ($1, 499, 'EUR', 'international', 'paye', public.app_now()) returning id`,
      [lecteur.id],
    );
    await query(
      `insert into public.entitlements (user_id, book_id, type, source_id, peut_telecharger)
       values ($1, $2, 'achat', $3, true)`,
      [lecteur.id, livrePayant, commande?.id],
    );

    const { error } = await lecteur.client
      .from('reading_progress')
      .insert({ user_id: lecteur.id, book_id: livrePayant, derniere_page: 5 });

    expect(error).toBeNull();
  });
});

describe('favoris', () => {
  it('acceptent un titre au catalogue sans exiger d’y avoir accès', async () => {
    // On met en favori ce qu'on envisage d'acheter : exiger l'accès viderait la
    // fonctionnalité de son sens.
    const nonAccessible =
      (await queryOne<{ id: string }>(`select id from public.books where slug = 'l-oiseau-de-feu'`))
        ?.id ?? '';

    const { error } = await lecteur.client
      .from('favorites')
      .insert({ user_id: lecteur.id, book_id: nonAccessible });

    expect(error).toBeNull();
  });

  it('refusent un titre en brouillon', async () => {
    // Sinon les favoris permettraient de deviner l'existence de titres en
    // préparation.
    const brouillon =
      (await queryOne<{ id: string }>(
        `select id from public.books where slug = 'le-lievre-et-la-tortue'`,
      ))?.id ?? '';

    const { error } = await lecteur.client
      .from('favorites')
      .insert({ user_id: lecteur.id, book_id: brouillon });

    expect(error).not.toBeNull();
  });
});

describe('horloge simulée et moteur de droits', () => {
  it('la fenêtre de 3 mois suit le décalage d’horloge appliqué à la session', async () => {
    // Le pont complet : DevClock → paramètre de session → app_now() → valeur
    // par défaut de access_for. C'est ce qui permettra à la console de
    // simulation d'éprouver les expirations sans attendre.
    const client = await getPool().connect();
    try {
      const nouveaute =
        (await queryOne<{ id: string }>(
          `select id from public.books where slug = 'l-oiseau-de-feu'`,
        ))?.id ?? '';

      const abonne = await createTestUser();
      try {
        await query(
          `insert into public.subscriptions
             (user_id, offre, statut, debut_periode, fin_periode, zone, devise, montant)
           values ($1, 'annuel', 'actif', public.app_now(), public.app_now() + interval '10 years',
                   'international', 'EUR', 6900)`,
          [abonne.id],
        );

        const avant = await client.query<{ can_read: boolean }>(
          `select (public.access_for($1, $2)).can_read`,
          [abonne.id, nouveaute],
        );
        expect(avant.rows[0]?.can_read).toBe(false);

        // Six mois plus tard, la fenêtre de vente est écoulée.
        const futur = new FixedClock(new Date(Date.now() + 180 * 86_400_000));
        await applyDevClock(client, futur);

        const apres = await client.query<{ can_read: boolean }>(
          `select (public.access_for($1, $2)).can_read`,
          [abonne.id, nouveaute],
        );
        expect(apres.rows[0]?.can_read).toBe(true);
      } finally {
        await clearDevClock(client);
        await deleteTestUser(abonne);
      }
    } finally {
      client.release();
    }
  });
});

describe('appelant TypeScript', () => {
  it('résout un lot en un seul appel', async () => {
    // Sans cela, l'affichage d'un catalogue de 40 contes déclencherait 40
    // allers-retours vers la base.
    let appels = 0;
    const espion = {
      rpc: (nom: string, params: unknown) => {
        appels += 1;
        return createServiceRpc(nom, params);
      },
    } as unknown as AppSupabaseClient;

    const ids = (await query<{ id: string }>(`select id from public.books`)).map((l) => l.id);
    const decisions = await getAccessForBooks(lecteur.id, ids, { client: espion });

    expect(appels).toBe(1);
    expect(decisions.size).toBe(ids.length);
  });

  it('conserve l’ordre demandé dans la variante ordonnée', async () => {
    const ids = (await query<{ id: string }>(`select id from public.books order by slug`)).map(
      (l) => l.id,
    );

    const liste = await getAccessListe(lecteur.id, ids);

    expect(liste.map((d) => d.bookId)).toEqual(ids);
  });

  it('renvoie le refus le plus net pour un identifiant inconnu', async () => {
    const decision = await getAccess(lecteur.id, '00000000-0000-0000-0000-000000000000');

    expect(decision).toEqual({ canRead: false, canDownload: false, reason: 'none' });
  });

  it('n’ouvre jamais l’accès en cas d’erreur de résolution', async () => {
    // Un moteur de droits en échec doit refuser, jamais « ouvrir par défaut ».
    const casse = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'panne simulée' } }),
    } as unknown as AppSupabaseClient;

    await expect(getAccess(lecteur.id, livrePayant, { client: casse })).rejects.toThrow(
      /Résolution des droits impossible/,
    );
  });
});

/** Relais vers le vrai client, pour que l'espion mesure sans simuler. */
function createServiceRpc(nom: string, params: unknown) {
  return import('@/lib/supabase/clients').then(async ({ createServiceClient }) => {
    const client = createServiceClient() as unknown as {
      rpc: (n: string, p: unknown) => Promise<unknown>;
    };
    return client.rpc(nom, params);
  });
}
