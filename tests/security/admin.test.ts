import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { reinitialiserQuotaAdmin } from '@/lib/admin/route-helpers';

import { closePool, query, queryOne } from '../helpers/db';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/users';

/**
 * L'ADMINISTRATION EST LA SURFACE LA PLUS PRIVILÉGIÉE DU PROJET.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE PASSE PAR `service_role`, DONC RLS EST CONTOURNÉ PAR CONSTRUCTION.  │
 * │                                                                          │
 * │ Partout ailleurs, une erreur de code est rattrapée par une politique RLS. │
 * │ Ici, il n'y a pas de second filet : le contrôle du rôle EST le seul       │
 * │ rempart. C'est pourquoi ce fichier n'échantillonne pas — il ÉNUMÈRE.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * LES ROUTES SONT DÉCOUVERTES SUR LE DISQUE, jamais listées à la main. Une
 * route d'administration ajoutée dans six mois est donc couverte sans que
 * personne n'y pense — et c'est exactement le cas qui, autrement, passe à
 * travers : celui où l'auteur de la route ne savait pas que ce test existait.
 */
const RACINE = process.cwd();
const DOSSIER_ADMIN = join(RACINE, 'src', 'app', 'api', 'admin');

/** Méthodes HTTP qu'un module de route peut exporter. */
const METHODES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Methode = (typeof METHODES)[number];

interface RouteAdmin {
  /** Chemin d'import du module, tel que Vitest le résout. */
  module: string;
  /** Chemin d'URL, segments dynamiques compris. */
  url: string;
  /** Segments dynamiques, dans l'ordre : `[id]` → `id`. */
  parametres: string[];
}

/** Découvre tous les `route.ts` sous `src/app/api/admin`. */
function routesAdmin(racine: string = DOSSIER_ADMIN): RouteAdmin[] {
  const trouvees: RouteAdmin[] = [];

  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) {
      trouvees.push(...routesAdmin(chemin));
      continue;
    }
    if (entree !== 'route.ts') continue;

    const relatif = relative(join(RACINE, 'src', 'app'), join(racine)).split(sep);
    trouvees.push({
      module: `@/app/${relatif.join('/')}/route`,
      url: `/${relatif.map((s) => (s.startsWith('[') ? s : s)).join('/')}`,
      parametres: relatif
        .filter((s) => s.startsWith('[') && s.endsWith(']'))
        .map((s) => s.slice(1, -1)),
    });
  }

  return trouvees;
}

const ROUTES = routesAdmin();

let visiteurJeton: string | undefined;
let utilisateur: TestUser;
let admin: TestUser;

/** Un UUID valide, pour que la route échoue sur le RÔLE et non sur la validation. */
const UUID = '00000000-0000-4000-8000-000000000abc';

/** Contexte de route : chaque segment dynamique reçoit un UUID plausible. */
function contexte(route: RouteAdmin): { params: Promise<Record<string, string>> } {
  const params: Record<string, string> = {};
  for (const nom of route.parametres) params[nom] = UUID;
  return { params: Promise.resolve(params) };
}

/**
 * Requête plausible pour la méthode.
 *
 * Un corps VALIDE est fourni pour les méthodes qui en attendent : sans lui, une
 * route pourrait répondre 400 avant même de vérifier le rôle, et le test
 * passerait au vert sans avoir éprouvé la garde. C'est le piège classique de ce
 * genre de test — un refus obtenu pour la mauvaise raison.
 */
function requete(route: RouteAdmin, methode: Methode, jeton?: string): Request {
  const entetes: Record<string, string> = {};
  if (jeton) entetes['authorization'] = `Bearer ${jeton}`;

  const url = `http://localhost:3000${route.url.replace(/\[(\w+)\]/g, UUID)}`;

  if (methode === 'GET' || methode === 'DELETE') {
    // Les paramètres inutiles sont ignorés par Zod ; ceux qui manqueraient
    // feraient répondre 400, ce qui trahirait un contrôle de rôle trop tardif.
    return new Request(`${url}?entitlement_id=${UUID}`, { method: methode, headers: entetes });
  }

  entetes['content-type'] = 'application/json';
  return new Request(url, {
    method: methode,
    headers: entetes,
    // Un corps couvrant les champs obligatoires de toutes les routes. Les
    // champs superflus sont ignorés par Zod.
    body: JSON.stringify({
      suspendu: true,
      motif: 'Contrôle de sécurité automatisé.',
      book_id: UUID,
      book_ids: [UUID],
      statut: 'publie',
      zone: 'international',
      montant: 499,
      devise: 'EUR',
      code: 'TESTSECU',
      type: 'pourcentage',
      valeur: 10,
      id: UUID,
      gratuit: true,
      fenetre_nouveaute_jours: 90,
    }),
  });
}

async function appeler(
  route: RouteAdmin,
  methode: Methode,
  jeton?: string,
): Promise<number> {
  const module = (await import(route.module)) as Record<string, unknown>;
  const handler = module[methode] as
    | ((r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>)
    | undefined;

  if (!handler) return 0;

  const reponse = await handler(requete(route, methode, jeton), contexte(route));
  return reponse.status;
}

beforeAll(async () => {
  utilisateur = await createTestUser();
  admin = await createTestUser({ admin: true });
  visiteurJeton = undefined;
});

afterAll(async () => {
  await deleteTestUser(utilisateur);
  await deleteTestUser(admin);
  await closePool();
});

describe('découverte des routes', () => {
  it('trouve les routes d’administration sur le disque', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ SANS CETTE ASSERTION, TOUT CE FICHIER PASSERAIT SUR ZÉRO ROUTE.      │
    // │                                                                      │
    // │ Les tests ci-dessous bouclent sur `ROUTES`. Un dossier renommé, et la │
    // │ boucle tourne à vide : aucune route testée, aucun échec, un fichier   │
    // │ tout vert qui ne protège plus rien.                                   │
    // └──────────────────────────────────────────────────────────────────────┘
    expect(ROUTES.length).toBeGreaterThanOrEqual(17);
  });

  it('couvre bien les routes attendues par le plan', () => {
    const urls = ROUTES.map((r) => r.url).sort();

    for (const attendue of [
      '/api/admin/audit',
      '/api/admin/books',
      '/api/admin/books/publication',
      '/api/admin/dashboard',
      '/api/admin/maintenance/purge-copies',
      '/api/admin/orders',
      '/api/admin/promos',
      '/api/admin/settings',
      // Les statistiques exposent le CHIFFRE D'AFFAIRES : leur presence dans
      // cette liste est explicite, et non laissee a la seule decouverte.
      '/api/admin/stats',
      '/api/admin/subscriptions',
      '/api/admin/users',
    ]) {
      expect(urls).toContain(attendue);
    }
  });
});

describe('CHAQUE route d’administration, CHAQUE méthode', () => {
  it('refuse un VISITEUR avec 401', async () => {
    const fautives: string[] = [];

    for (const route of ROUTES) {
      for (const methode of METHODES) {
        reinitialiserQuotaAdmin();
        const statut = await appeler(route, methode, visiteurJeton);
        if (statut === 0) continue;
        if (statut !== 401) fautives.push(`${methode} ${route.url} → ${String(statut)}`);
      }
    }

    expect(fautives).toEqual([]);
  }, 120_000);

  it('refuse un UTILISATEUR ORDINAIRE avec 403', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ 401 ET 403 SONT DISTINGUÉS VOLONTAIREMENT.                           │
    // │                                                                      │
    // │ 401 dit « identifiez-vous », 403 dit « vous êtes identifié et cela ne │
    // │ suffit pas ». Rendre 404 partout masquerait l'existence des routes,   │
    // │ mais rendrait le back-office indébogable — et l'existence d'une route │
    // │ d'administration n'est pas un secret : son accès l'est.               │
    // └──────────────────────────────────────────────────────────────────────┘
    const fautives: string[] = [];

    for (const route of ROUTES) {
      for (const methode of METHODES) {
        reinitialiserQuotaAdmin();
        const statut = await appeler(route, methode, utilisateur.accessToken);
        if (statut === 0) continue;
        if (statut !== 403) fautives.push(`${methode} ${route.url} → ${String(statut)}`);
      }
    }

    expect(fautives).toEqual([]);
  }, 120_000);

  it('LAISSE PASSER un administrateur, et sans erreur serveur', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ SANS CE TEST, LES DEUX PRÉCÉDENTS NE PROUVERAIENT RIEN.              │
    // │                                                                      │
    // │ Deux routes qui refuseraient TOUT LE MONDE les passeraient en         │
    // │ s'accordant sur un refus général.                                     │
    // │                                                                      │
    // │ Le 5xx est refusé explicitement, et ce n'est pas du zèle : une         │
    // │ première version de ce test ne vérifiait que « ni 401 ni 403 », et     │
    // │ elle a laissé passer un tableau de bord qui rendait 500 sur toute      │
    // │ requête — la fonction SQL n'existait même pas. Un test de sécurité qui │
    // │ tolère une panne finit par certifier une route morte.                  │
    // └──────────────────────────────────────────────────────────────────────┘
    const fautives: string[] = [];

    for (const route of ROUTES) {
      for (const methode of METHODES) {
        reinitialiserQuotaAdmin();
        const statut = await appeler(route, methode, admin.accessToken);
        if (statut === 0) continue;

        // 404 et 422 sont légitimes : le corps de test désigne des
        // identifiants qui n'existent pas. Une garde franchie puis une donnée
        // introuvable, c'est précisément ce qu'on attend.
        if (statut === 401 || statut === 403 || statut >= 500) {
          fautives.push(`${methode} ${route.url} → ${String(statut)}`);
        }
      }
    }

    expect(fautives).toEqual([]);
  }, 120_000);
});

describe('LE RÔLE EST VÉRIFIÉ EN BASE, ET NON DANS LE SEUL JETON', () => {
  it('refuse un administrateur RÉTROGRADÉ dont le jeton est encore valide', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ LE CAS QUI JUSTIFIE LA DOUBLE VÉRIFICATION.                          │
    // │                                                                      │
    // │ Le jeton est signé et valide plusieurs heures. Si le rôle y était lu, │
    // │ un administrateur révoqué garderait ses pouvoirs jusqu'à son          │
    // │ expiration — précisément pendant la fenêtre où l'on veut les lui      │
    // │ retirer.                                                             │
    // │                                                                      │
    // │ Le rôle est donc relu dans `public.users` à chaque requête, puis      │
    // │ REVÉRIFIÉ par `admin_poser_acteur` au moment de l'écriture.           │
    // └──────────────────────────────────────────────────────────────────────┘
    const ephemere = await createTestUser({ admin: true });
    try {
      reinitialiserQuotaAdmin();

      const avant = await appeler(
        { module: '@/app/api/admin/dashboard/route', url: '/api/admin/dashboard', parametres: [] },
        'GET',
        ephemere.accessToken,
      );
      expect(avant).toBe(200);

      // Rétrogradé en base. Le jeton, lui, n'a pas changé.
      await query(`update public.users set role = 'user' where id = $1`, [ephemere.id]);
      reinitialiserQuotaAdmin();

      const apres = await appeler(
        { module: '@/app/api/admin/dashboard/route', url: '/api/admin/dashboard', parametres: [] },
        'GET',
        ephemere.accessToken,
      );
      expect(apres).toBe(403);
    } finally {
      await deleteTestUser(ephemere);
    }
  });

  it('la base refuse elle-même une mutation demandée par un non-administrateur', async () => {
    // Le second rempart, éprouvé directement : même si une route oubliait sa
    // garde, `admin_poser_acteur` arrêterait l'écriture.
    const livre = await queryOne<{ id: string }>(
      `select id from public.books where slug = 'petit-baobab'`,
    );

    await expect(
      query(`select public.admin_modifier_livre($1, $2, true)`, [utilisateur.id, livre!.id]),
    ).rejects.toThrow(/administrateur/i);
  });

  it('la base refuse une mutation SANS acteur', async () => {
    const livre = await queryOne<{ id: string }>(
      `select id from public.books where slug = 'petit-baobab'`,
    );

    await expect(
      query(`select public.admin_modifier_livre(null, $1, true)`, [livre!.id]),
    ).rejects.toThrow(/administrateur/i);
  });
});

describe('AUCUNE ROUTE N’ACCEPTE UN ACTEUR VENANT DU CLIENT (point 2)', () => {
  it('ignore un `acteur` glissé dans le corps de la requête', async () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ « AGIR AU NOM DE » N'EXISTE PAS.                                     │
    // │                                                                      │
    // │ Un tel paramètre ferait de chaque route un point d'usurpation, et le  │
    // │ journal d'audit nommerait quelqu'un d'autre que l'auteur réel —        │
    // │ c'est-à-dire qu'il mentirait. Un journal auquel on ne peut pas se      │
    // │ fier est pire qu'un journal absent.                                   │
    // └──────────────────────────────────────────────────────────────────────┘
    const livre = await queryOne<{ id: string; gratuit: boolean }>(
      `select id, gratuit from public.books where slug = 'petit-baobab'`,
    );
    const { PATCH } = await import('@/app/api/admin/books/route');

    reinitialiserQuotaAdmin();
    const avant = await queryOne<{ n: string }>(
      `select count(*)::text as n from public.admin_audit_log where acteur_id = $1`,
      [admin.id],
    );

    const reponse = await PATCH(
      new Request('http://localhost:3000/api/admin/books', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${admin.accessToken}`,
        },
        body: JSON.stringify({
          id: livre!.id,
          // La valeur est INVERSÉE, jamais recopiée : le déclencheur d'audit ne
          // trace qu'un changement réel (`is distinct from`), et réécrire la
          // valeur en place ne produirait aucune ligne — le test passerait alors
          // pour n'avoir rien déclenché.
          gratuit: !livre!.gratuit,
          // Les tentatives d'usurpation, sous les noms les plus plausibles.
          acteur: utilisateur.id,
          acteur_id: utilisateur.id,
          user_id: utilisateur.id,
          p_acteur: utilisateur.id,
        }),
      }),
    );

    expect(reponse.status).toBe(200);

    // La trace nomme l'ADMINISTRATEUR authentifié, pas l'identifiant fourni.
    const apres = await queryOne<{ n: string }>(
      `select count(*)::text as n from public.admin_audit_log where acteur_id = $1`,
      [admin.id],
    );
    expect(Number(apres?.n)).toBeGreaterThan(Number(avant?.n));

    const usurpee = await query(
      `select 1 from public.admin_audit_log where acteur_id = $1`,
      [utilisateur.id],
    );
    expect(usurpee).toHaveLength(0);

    // Remis dans son etat d'origine : les autres fichiers d'integration lisent
    // le meme jeu de donnees, et `petit-baobab` y est le titre gratuit.
    await query(`update public.books set gratuit = $2 where id = $1`, [
      livre!.id,
      livre!.gratuit,
    ]);
  });
});

describe('quota de débit', () => {
  it('bloque un administrateur au-delà du quota', async () => {
    // La pagination plafonne ce qu'une requête emporte ; le quota plafonne
    // combien de requêtes peuvent être enchaînées. Sans le second, le premier
    // ne coûte qu'une boucle.
    reinitialiserQuotaAdmin();
    const { GET } = await import('@/app/api/admin/dashboard/route');

    const requeteAdmin = () =>
      GET(
        new Request('http://localhost:3000/api/admin/dashboard', {
          headers: { authorization: `Bearer ${admin.accessToken}` },
        }),
      );

    let dernier = 200;
    // Le quota est de 300 par quart d'heure : la boucle le dépasse.
    for (let i = 0; i < 305 && dernier !== 429; i += 1) {
      dernier = (await requeteAdmin()).status;
    }

    expect(dernier).toBe(429);
  }, 120_000);
});
