import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { POST as connecter } from '@/app/api/auth/login/route';
import { POST as deconnecter } from '@/app/api/auth/logout/route';
import { POST as rafraichirRoute, reinitialiserQuotaRafraichissement } from '@/app/api/auth/refresh/route';
import { GET as profil } from '@/app/api/auth/me/route';
import { empreinte, TOLERANCE_COURSE_SECONDES } from '@/lib/auth/refresh';
import { REFRESH_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { loginRateLimiter } from '@/lib/http/rate-limit';

import { closePool, query } from '../helpers/db';
import { corpsJson, cookiesPoses, get, postJson, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, serviceClient, anonClient, type TestUser } from '../helpers/users';

/**
 * RAFRAÎCHISSEMENT DE SESSION — rotation et détection de réutilisation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER ÉPROUVE UN DÉFAUT DU BACKEND LIVRÉ, PAS UNE FONCTION NEUVE.  │
 * │                                                                          │
 * │ La session ne survivait pas à une heure. Mille tests l'ont manqué parce  │
 * │ que la validité d'un jeton est appliquée par GoTrue en HEURE RÉELLE :    │
 * │ avancer l'horloge métier n'expire aucun jeton, et aucun test ne POUVAIT  │
 * │ donc simuler une session longue (docs/PLAN.md §5 duodecies).             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface CorpsSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const comptes: TestUser[] = [];

async function ouvrirSession(compte: TestUser): Promise<CorpsSession> {
  const reponse = await connecter(
    postJson('/api/auth/login', { email: compte.email, password: compte.password }),
  );
  expect(reponse.status, 'la connexion doit réussir avant tout test de rafraîchissement').toBe(200);
  return await corpsJson<CorpsSession>(reponse);
}

async function nouveauCompte(): Promise<TestUser> {
  const compte = await createTestUser();
  comptes.push(compte);
  return compte;
}

/** Nombre de lignées vivantes d'un compte. */
async function ligneesVivantes(userId: string): Promise<number> {
  const lignes = await query<{ n: string }>(
    `select count(*)::text as n from public.refresh_token_families
      where user_id = $1 and revoque_le is null`,
    [userId],
  );
  return Number(lignes[0]?.n ?? '0');
}

beforeEach(() => {
  // Deux singletons de module : sans remise à zéro, un test hériterait du
  // décompte du précédent et échouerait pour la mauvaise raison.
  loginRateLimiter.vider();
  reinitialiserQuotaRafraichissement();
});

afterAll(async () => {
  for (const compte of comptes) await deleteTestUser(compte);
  await closePool();
});

describe('rotation', () => {
  it('rend une session neuve, et le jeton présenté n’est plus celui rendu', async () => {
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    const reponse = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
    );

    expect(reponse.status).toBe(200);
    const rendu = await corpsJson<CorpsSession>(reponse);

    // LA rotation : le jeton rendu diffère de celui présenté. Sans cette
    // assertion, un rafraîchissement qui renverrait le même jeton passerait
    // tous les autres tests de ce fichier.
    expect(rendu.refresh_token).not.toBe(session.refresh_token);
    expect(rendu.access_token).not.toBe(session.access_token);
    expect(rendu.expires_in).toBeGreaterThan(0);
  });

  it('repose les deux cookies de session', async () => {
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    const reponse = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
    );

    const cookies = cookiesPoses(reponse);
    expect(cookies.some((c) => c.startsWith('contes_access_token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${REFRESH_TOKEN_COOKIE}=`))).toBe(true);
    // Un jeton de session dans un cookie lisible par du JavaScript de page
    // transformerait une faille XSS en vol de session.
    expect(cookies.every((c) => c.includes('HttpOnly'))).toBe(true);
  });

  it('le jeton d’accès rendu ouvre réellement une route gardée', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ SANS CE TEST, LE RAFRAÎCHISSEMENT POURRAIT RENDRE N'IMPORTE QUELLE │
    // │ CHAÎNE. C'est le seul qui prouve que la session obtenue SERT.      │
    // └────────────────────────────────────────────────────────────────────┘
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    const rendu = await corpsJson<CorpsSession>(
      await rafraichirRoute(postJson('/api/auth/refresh', { refresh_token: session.refresh_token })),
    );

    const moi = await profil(get('/api/auth/me', { jeton: rendu.access_token }));
    expect(moi.status).toBe(200);
  });

  it('accepte le jeton par COOKIE, sans corps — le cas du navigateur', async () => {
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    const requete = new Request('http://localhost:3000/api/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_TOKEN_COOKIE}=${session.refresh_token}` },
    });

    // Un corps vide est le cas NORMAL : le cookie est `HttpOnly`, le navigateur
    // n'a rien à transmettre d'autre. Le traiter comme une requête malformée
    // rendrait la route inutilisable là où elle sert le plus.
    expect((await rafraichirRoute(requete)).status).toBe(200);
  });
});

describe('détection de réutilisation', () => {
  it('une réutilisation HORS tolérance tue la lignée entière', async () => {
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    const successeur = await corpsJson<CorpsSession>(
      await rafraichirRoute(postJson('/api/auth/refresh', { refresh_token: session.refresh_token })),
    );

    expect(await ligneesVivantes(compte.id)).toBeGreaterThan(0);

    // Le jeton initial est rejoué au-delà de la tolérance. Plutôt que
    // d'attendre dix secondes, on interroge la fonction avec une tolérance
    // nulle : c'est EXACTEMENT le chemin qu'emprunte la route, au paramètre
    // près.
    const verdict = await query<{ etat: string }>(
      `select etat from public.diagnostiquer_jeton_rafraichissement($1, 0)`,
      [empreinte(session.refresh_token)],
    );
    expect(verdict[0]?.etat).toBe('reutilisation');

    // LA conséquence : le successeur, parfaitement légitime, tombe avec la
    // lignée. C'est le prix de la détection, et il est volontaire — sans lui,
    // le voleur et la victime alterneraient sans que rien ne l'apprenne.
    expect(await ligneesVivantes(compte.id)).toBe(0);

    const apres = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: successeur.refresh_token }),
    );
    expect(apres.status).toBe(401);
  });

  it('une course DANS la tolérance refuse sans tuer la lignée', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE CONTRE-TEST DU PRÉCÉDENT.                                       │
    // │                                                                    │
    // │ Sans lui, une implémentation qui tuerait la lignée à CHAQUE jeton  │
    // │ déjà consommé passerait le test ci-dessus. Deux onglets qui se     │
    // │ rafraîchissent en même temps déconnecteraient alors l'utilisateur  │
    // │ — un défaut qu'on attribuerait au réseau pendant des mois.         │
    // └────────────────────────────────────────────────────────────────────┘
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    const successeur = await corpsJson<CorpsSession>(
      await rafraichirRoute(postJson('/api/auth/refresh', { refresh_token: session.refresh_token })),
    );

    const verdict = await query<{ etat: string }>(
      `select etat from public.diagnostiquer_jeton_rafraichissement($1, 3600)`,
      [empreinte(session.refresh_token)],
    );
    expect(verdict[0]?.etat).toBe('course');

    // La lignée est intacte, et le successeur fonctionne toujours.
    expect(await ligneesVivantes(compte.id)).toBeGreaterThan(0);

    const encore = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: successeur.refresh_token }),
    );
    expect(encore.status).toBe(200);
  });

  it('rejouer immédiatement est REFUSÉ, tolérance ou non', async () => {
    // La tolérance suspend la SANCTION, jamais le REFUS. Un voleur qui frappe
    // dans la fenêtre n'obtient rien de plus qu'un 401.
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    await rafraichirRoute(postJson('/api/auth/refresh', { refresh_token: session.refresh_token }));

    const rejeu = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
    );
    expect(rejeu.status).toBe(401);
  });

  it('LA VICTIME apprend qu’elle a été compromise, pas seulement le voleur', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE SCÉNARIO COMPLET, DANS L'ORDRE OÙ IL SE PRODUIT.                │
    // │                                                                    │
    // │ 1. La victime se connecte et obtient T1.                           │
    // │ 2. Un voleur intercepte T1.                                        │
    // │ 3. La victime rafraîchit normalement : T1 → T2. Elle détient T2.   │
    // │ 4. Le voleur rejoue T1. LA DÉTECTION FIRE ICI — et c'est LUI qui   │
    // │    reçoit le message explicite.                                    │
    // │ 5. La victime rafraîchit avec T2, sur une lignée déjà morte.        │
    // │                                                                    │
    // │ C'est l'étape 5 qui compte. Sans motif de révocation distinct, la  │
    // │ victime y recevait « session expirée » — et se reconnectait sans    │
    // │ jamais savoir qu'elle devait changer son mot de passe.             │
    // └────────────────────────────────────────────────────────────────────┘
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    const t2 = await corpsJson<CorpsSession>(
      await rafraichirRoute(postJson('/api/auth/refresh', { refresh_token: session.refresh_token })),
    );

    // Le voleur rejoue T1, hors tolérance.
    const verdictVoleur = await query<{ etat: string; motif: string | null }>(
      `select etat, motif from public.diagnostiquer_jeton_rafraichissement($1, 0)`,
      [empreinte(session.refresh_token)],
    );
    expect(verdictVoleur[0]?.etat).toBe('reutilisation');
    expect(verdictVoleur[0]?.motif).toBe('reutilisation');

    // LA VICTIME arrive ensuite, avec un jeton parfaitement légitime.
    const cotéVictime = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: t2.refresh_token }),
    );

    expect(cotéVictime.status).toBe(401);
    const corps = await corpsJson<ReponseErreur>(cotéVictime);

    // C'EST L'ASSERTION QUI COMPTE. `session_expiree` ici serait un mensonge
    // par omission : la session n'a pas expiré, elle a été volée.
    expect(corps.erreur.code).toBe('session_revoquee');
    expect(corps.erreur.message).toMatch(/mot de passe/i);
  });

  it('une déconnexion volontaire NE dit PAS « compromise » — le contre-test', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ SANS CETTE ASSERTION, UNE IMPLÉMENTATION QUI CRIERAIT AU VOL À     │
    // │ CHAQUE LIGNÉE MORTE PASSERAIT LE TEST PRÉCÉDENT.                   │
    // │                                                                    │
    // │ Une alerte de sécurité qui se déclenche à chaque déconnexion cesse │
    // │ d'être lue en une semaine — et le jour où elle a raison, personne  │
    // │ n'y prête attention. C'est §5 sexies « dans l'autre sens ».        │
    // └────────────────────────────────────────────────────────────────────┘
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    await deconnecter(postJson('/api/auth/logout', {}, { jeton: session.access_token }));

    const apres = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
    );
    expect(apres.status).toBe(401);
    expect((await corpsJson<ReponseErreur>(apres)).erreur.code).toBe('session_expiree');
  });

  it('un compte suspendu ne dit pas « compromise » non plus', async () => {
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    await query(`update public.users set statut = 'suspendu' where id = $1`, [compte.id]);

    const apres = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
    );
    expect((await corpsJson<ReponseErreur>(apres)).erreur.code).toBe('session_expiree');

    await query(`update public.users set statut = 'actif' where id = $1`, [compte.id]);
  });

  it('efface les cookies sur TOUT refus', async () => {
    // Un cookie mort laissé en place condamne le navigateur à rejouer le même
    // jeton refusé à chaque navigation — ce qui, hors tolérance, se lirait
    // comme une réutilisation et tuerait la lignée suivante.
    const reponse = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: 'jeton-qui-n-existe-pas-du-tout' }),
    );

    expect(reponse.status).toBe(401);
    const cookies = cookiesPoses(reponse);
    expect(cookies.length).toBe(2);
    expect(cookies.every((c) => c.includes('Max-Age=0'))).toBe(true);
  });
});

describe('refus', () => {
  it('sans jeton ni cookie', async () => {
    const requete = new Request('http://localhost:3000/api/auth/refresh', { method: 'POST' });
    const reponse = await rafraichirRoute(requete);
    expect(reponse.status).toBe(401);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('non_authentifie');
  });

  it('jeton inconnu', async () => {
    const reponse = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: 'a'.repeat(64) }),
    );
    expect(reponse.status).toBe(401);
  });

  it('corps illisible', async () => {
    const requete = new Request('http://localhost:3000/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ ceci n’est pas du JSON',
    });
    expect((await rafraichirRoute(requete)).status).toBe(400);
  });

  it('la déconnexion révoque la lignée', async () => {
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    expect(await ligneesVivantes(compte.id)).toBeGreaterThan(0);

    await deconnecter(postJson('/api/auth/logout', {}, { jeton: session.access_token }));

    // Sans cette révocation, un jeton de rafraîchissement survivrait à la
    // déconnexion : « me déconnecter » ne déconnecterait pas.
    expect(await ligneesVivantes(compte.id)).toBe(0);

    const apres = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
    );
    expect(apres.status).toBe(401);
  });

  it('la suspension du compte révoque la lignée, par déclencheur', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉCLENCHEUR, ET NON UN APPEL : la trace suit la donnée, pas le  │
    // │ chemin de code. Ce test écrit DIRECTEMENT en base, sans passer par │
    // │ la route d'administration — c'est ce qui prouve que la révocation  │
    // │ tient même pour un chemin qui n'existe pas encore.                 │
    // └────────────────────────────────────────────────────────────────────┘
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);
    expect(await ligneesVivantes(compte.id)).toBeGreaterThan(0);

    await query(`update public.users set statut = 'suspendu' where id = $1`, [compte.id]);

    expect(await ligneesVivantes(compte.id)).toBe(0);

    const apres = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: session.refresh_token }),
    );
    expect(apres.status).toBe(401);

    await query(`update public.users set statut = 'actif' where id = $1`, [compte.id]);
  });

  it('applique un quota de débit', async () => {
    const reponses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const reponse = await rafraichirRoute(
        postJson('/api/auth/refresh', { refresh_token: `inconnu-${String(i)}` }, { ip: '203.0.113.7' }),
      );
      reponses.push(reponse.status);
    }

    // Sans quota, cette route serait un banc d'essai de jetons au hasard.
    expect(reponses).toContain(429);
  });
});

describe('la table des lignées est fermée', () => {
  it('un utilisateur authentifié ne la lit pas', async () => {
    const compte = await nouveauCompte();
    await ouvrirSession(compte);

    const lecture = await compte.client.from('refresh_token_families').select('id');

    // CLAUDE.md règle 1 : RLS en refus par défaut. Cette table contient des
    // empreintes de jetons — personne n'a de raison légitime de la lire depuis
    // un client, pas même son propriétaire.
    expect(lecture.data ?? []).toEqual([]);
  });

  it('un visiteur anonyme ne la lit pas non plus', async () => {
    const lecture = await anonClient().from('refresh_token_families').select('id');
    expect(lecture.data ?? []).toEqual([]);
  });

  it('le jeton lui-même n’est JAMAIS stocké', async () => {
    const compte = await nouveauCompte();
    const session = await ouvrirSession(compte);

    // ┌────────────────────────────────────────────────────────────────────┐
    // │ Une table de jetons en clair serait un trousseau : sa lecture      │
    // │ donnerait trente jours d'accès sur chaque compte.                  │
    // └────────────────────────────────────────────────────────────────────┘
    const lignes = await query<{ jeton_hash: string }>(
      `select jeton_hash from public.refresh_token_families where user_id = $1`,
      [compte.id],
    );

    expect(lignes.length).toBeGreaterThan(0);
    for (const ligne of lignes) {
      expect(ligne.jeton_hash).not.toBe(session.refresh_token);
      expect(ligne.jeton_hash).toMatch(/^[0-9a-f]{64}$/);
    }

    // Et l'empreinte enregistrée est bien celle du jeton émis — sans quoi la
    // détection porterait sur autre chose que ce que présente le client.
    expect(lignes.map((l) => l.jeton_hash)).toContain(empreinte(session.refresh_token));
  });
});

describe('la tolérance suit le fournisseur', () => {
  it('est alignée sur `refresh_token_reuse_interval` de config.toml', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ UN COMMENTAIRE SE PÉRIME, UN TEST NON — même dispositif que        │
    // │ l'alignement des délais de hooks (docs/PLAN.md §5 sexies).         │
    // │                                                                    │
    // │ Une tolérance plus courte que celle de GoTrue ferait tuer des      │
    // │ lignées saines sur une course que le fournisseur, lui, absorbe.    │
    // └────────────────────────────────────────────────────────────────────┘
    const { readFileSync } = await import('node:fs');
    const config = readFileSync('supabase/config.toml', 'utf8');
    const trouve = /^refresh_token_reuse_interval\s*=\s*(\d+)/m.exec(config);

    expect(trouve, 'refresh_token_reuse_interval absent de config.toml').not.toBeNull();
    expect(TOLERANCE_COURSE_SECONDES).toBe(Number(trouve?.[1]));
  });

  it('la rotation est bien activée chez le fournisseur', async () => {
    // Sans elle, GoTrue rendrait le même jeton indéfiniment et toute la
    // détection de réutilisation de ce fichier ne porterait sur rien.
    const { readFileSync } = await import('node:fs');
    const config = readFileSync('supabase/config.toml', 'utf8');
    expect(config).toMatch(/^enable_refresh_token_rotation\s*=\s*true/m);
  });
});

describe('l’ouverture de lignée n’est pas devinable', () => {
  it('deux connexions du même compte ouvrent deux lignées distinctes', async () => {
    const compte = await nouveauCompte();
    await ouvrirSession(compte);
    await ouvrirSession(compte);

    const familles = await query<{ famille: string }>(
      `select distinct famille from public.refresh_token_families
        where user_id = $1 and revoque_le is null`,
      [compte.id],
    );

    // Deux appareils sont deux lignées : révoquer l'une ne doit pas coucher
    // l'autre. C'est ce qui rend la détection de vol supportable.
    expect(familles.length).toBe(2);
  });

  it('révoquer une lignée laisse l’autre vivante', async () => {
    const compte = await nouveauCompte();
    const premiere = await ouvrirSession(compte);
    const seconde = await ouvrirSession(compte);

    const famille = await query<{ famille: string }>(
      `select famille from public.refresh_token_families where jeton_hash = $1`,
      [empreinte(premiere.refresh_token)],
    );
    await query(`select public.revoquer_familles_jetons($1, 'reutilisation', $2)`, [
      compte.id,
      famille[0]?.famille ?? null,
    ]);

    const morte = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: premiere.refresh_token }),
    );
    expect(morte.status).toBe(401);

    const vivante = await rafraichirRoute(
      postJson('/api/auth/refresh', { refresh_token: seconde.refresh_token }),
    );
    expect(vivante.status).toBe(200);
  });
});

describe('service', () => {
  it('le client de service voit la table, lui', async () => {
    // Garde d'effectif : si cette lecture rendait vide, tous les tests
    // d'isolation ci-dessus passeraient sans rien vérifier.
    const compte = await nouveauCompte();
    await ouvrirSession(compte);

    const lecture = await serviceClient()
      .from('refresh_token_families')
      .select('id')
      .eq('user_id', compte.id);

    expect((lecture.data ?? []).length).toBeGreaterThan(0);
  });
});
