import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { POST as inscrire } from '@/app/api/auth/register/route';
import { POST as connecter } from '@/app/api/auth/login/route';
import { POST as deconnecter } from '@/app/api/auth/logout/route';
import { GET as profil } from '@/app/api/auth/me/route';
import { POST as demanderReinit } from '@/app/api/auth/password/reset/route';
import { POST as changerMotDePasse } from '@/app/api/auth/password/update/route';
import { loginRateLimiter } from '@/lib/http/rate-limit';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';

import { closePool, query } from '../helpers/db';
import { corpsJson, cookiesPoses, get, postJson, type ReponseErreur } from '../helpers/http';
import { attendreEmail, compterEmails, viderBoite } from '../helpers/mailpit';
import { createTestUser, deleteTestUser, serviceClient } from '../helpers/users';

const MOT_DE_PASSE = 'MotDePasse2026';
const comptesCrees: string[] = [];

function adresseNeuve(): string {
  return `inscription-${randomUUID()}@exemple.test`;
}

async function supprimerParEmail(email: string): Promise<void> {
  const lignes = await query<{ id: string }>(`select id from auth.users where email = $1`, [email]);
  for (const ligne of lignes) {
    await serviceClient().auth.admin.deleteUser(ligne.id);
  }
}

beforeEach(() => {
  // Le limiteur est un singleton de module : sans remise à zéro, un test
  // hériterait des tentatives du précédent.
  loginRateLimiter.vider();
});

afterAll(async () => {
  for (const email of comptesCrees) await supprimerParEmail(email);
  await closePool();
});

describe('inscription', () => {
  it('crée le compte, le profil métier, et envoie un email de vérification', async () => {
    const email = adresseNeuve();
    comptesCrees.push(email);
    await viderBoite();

    const reponse = await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));

    expect(reponse.status).toBe(201);

    // Le profil métier est créé par le déclencheur, avec le rôle `user`.
    const profils = await query<{ role: string; langue_preferee: string }>(
      `select role::text, langue_preferee from public.users where email = $1`,
      [email],
    );
    expect(profils).toEqual([{ role: 'user', langue_preferee: 'fr' }]);

    const message = await attendreEmail(email);
    expect(message.destinataires).toContain(email);
    expect(message.corps.length).toBeGreaterThan(0);
  });

  it('retient le nom et la langue transmis', async () => {
    const email = adresseNeuve();
    comptesCrees.push(email);

    await inscrire(
      postJson('/api/auth/register', {
        email,
        password: MOT_DE_PASSE,
        nom_complet: 'Awa Diallo',
        langue_preferee: 'en',
      }),
    );

    const profils = await query<{ nom_complet: string; langue_preferee: string }>(
      `select nom_complet, langue_preferee from public.users where email = $1`,
      [email],
    );
    expect(profils[0]).toEqual({ nom_complet: 'Awa Diallo', langue_preferee: 'en' });
  });

  it('ignore un rôle glissé dans le corps de la requête', async () => {
    // Le rôle n'est jamais lu depuis les données du client : il serait sinon
    // un vecteur d'élévation de privilège dès l'inscription.
    const email = adresseNeuve();
    comptesCrees.push(email);

    await inscrire(
      postJson('/api/auth/register', { email, password: MOT_DE_PASSE, role: 'admin' }),
    );

    const profils = await query<{ role: string }>(
      `select role::text from public.users where email = $1`,
      [email],
    );
    expect(profils[0]?.role).toBe('user');
  });

  it('répond à l’identique pour une adresse déjà connue', async () => {
    // Une réponse différenciée transformerait cette route en annuaire des
    // clients de la plateforme, une adresse à la fois.
    const email = adresseNeuve();
    comptesCrees.push(email);

    const premiere = await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));
    const seconde = await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));

    expect(seconde.status).toBe(premiere.status);
    expect(await seconde.text()).toBe(await premiere.text());
  });

  it('refuse une adresse email invalide', async () => {
    const reponse = await inscrire(
      postJson('/api/auth/register', { email: 'pas-une-adresse', password: MOT_DE_PASSE }),
    );

    expect(reponse.status).toBe(400);
    const corps = await corpsJson<ReponseErreur>(reponse);
    expect(corps.erreur.code).toBe('requete_invalide');
    expect(corps.erreur.champs?.['email']).toBeDefined();
  });

  it('refuse un mot de passe trop court', async () => {
    const reponse = await inscrire(
      postJson('/api/auth/register', { email: adresseNeuve(), password: 'Court1' }),
    );

    expect(reponse.status).toBe(400);
    const corps = await corpsJson<ReponseErreur>(reponse);
    expect(corps.erreur.champs?.['password']?.[0]).toMatch(/10 caractères/);
  });

  it('refuse un mot de passe sans chiffre', async () => {
    const reponse = await inscrire(
      postJson('/api/auth/register', { email: adresseNeuve(), password: 'SansAucunChiffre' }),
    );

    expect(reponse.status).toBe(400);
    const corps = await corpsJson<ReponseErreur>(reponse);
    expect(corps.erreur.champs?.['password']?.[0]).toMatch(/chiffre/);
  });

  it('refuse un corps qui n’est pas du JSON', async () => {
    const reponse = await inscrire(postJson('/api/auth/register', 'ceci nest pas du json'));

    expect(reponse.status).toBe(400);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('corps_illisible');
  });

  it('refuse une langue non prise en charge', async () => {
    const reponse = await inscrire(
      postJson('/api/auth/register', {
        email: adresseNeuve(),
        password: MOT_DE_PASSE,
        langue_preferee: 'de',
      }),
    );

    expect(reponse.status).toBe(400);
  });
});

describe('connexion', () => {
  it('refuse tant que l’adresse email n’est pas vérifiée', async () => {
    // §4.2 F5 : la vérification d'adresse conditionne l'accès.
    const email = adresseNeuve();
    comptesCrees.push(email);
    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));

    const reponse = await connecter(postJson('/api/auth/login', { email, password: MOT_DE_PASSE }));

    expect(reponse.status).toBe(403);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('email_non_verifie');
  });

  it('délivre une session et pose des cookies HttpOnly', async () => {
    const utilisateur = await createTestUser();
    try {
      const reponse = await connecter(
        postJson('/api/auth/login', { email: utilisateur.email, password: utilisateur.password }),
      );

      expect(reponse.status).toBe(200);
      const corps = await corpsJson<{ access_token: string; utilisateur: { role: string } }>(reponse);
      expect(corps.access_token.length).toBeGreaterThan(0);
      expect(corps.utilisateur.role).toBe('user');

      const cookies = cookiesPoses(reponse);
      const acces = cookies.find((c) => c.startsWith(ACCESS_TOKEN_COOKIE));
      expect(acces).toBeDefined();
      // Un JavaScript de page ne doit jamais pouvoir lire le jeton : sans
      // HttpOnly, une faille XSS deviendrait un vol de session.
      expect(acces).toContain('HttpOnly');
      expect(acces).toContain('SameSite=Lax');
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('renvoie la même erreur pour un mot de passe faux et une adresse inconnue', async () => {
    const utilisateur = await createTestUser();
    try {
      const mauvaisMotDePasse = await connecter(
        postJson('/api/auth/login', { email: utilisateur.email, password: 'MauvaisMotDePasse1' }),
      );
      const adresseInconnue = await connecter(
        postJson('/api/auth/login', { email: adresseNeuve(), password: MOT_DE_PASSE }),
      );

      expect(mauvaisMotDePasse.status).toBe(401);
      expect(adresseInconnue.status).toBe(401);
      // Distinguer les deux permettrait d'énumérer les comptes existants.
      expect(await adresseInconnue.text()).toBe(await mauvaisMotDePasse.text());
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('refuse un compte suspendu', async () => {
    const utilisateur = await createTestUser();
    try {
      await query(`update public.users set suspendu = true where id = $1`, [utilisateur.id]);

      const reponse = await connecter(
        postJson('/api/auth/login', { email: utilisateur.email, password: utilisateur.password }),
      );

      expect(reponse.status).toBe(403);
      expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('compte_suspendu');
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('refuse un corps invalide', async () => {
    const reponse = await connecter(postJson('/api/auth/login', { email: 'x' }));

    expect(reponse.status).toBe(400);
  });

  it('bloque après cinq tentatives et indique le délai d’attente (§5.2)', async () => {
    const utilisateur = await createTestUser();
    try {
      const essai = () =>
        connecter(
          postJson(
            '/api/auth/login',
            { email: utilisateur.email, password: 'MauvaisMotDePasse1' },
            { ip: '203.0.113.99' },
          ),
        );

      for (let i = 0; i < 5; i += 1) {
        expect((await essai()).status).toBe(401);
      }

      const bloquee = await essai();
      expect(bloquee.status).toBe(429);
      expect(Number(bloquee.headers.get('retry-after'))).toBeGreaterThan(0);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('ne bloque pas une autre adresse IP', async () => {
    const utilisateur = await createTestUser();
    try {
      for (let i = 0; i < 5; i += 1) {
        await connecter(
          postJson(
            '/api/auth/login',
            { email: utilisateur.email, password: 'MauvaisMotDePasse1' },
            { ip: '203.0.113.99' },
          ),
        );
      }

      // Par email seul, n'importe qui pourrait verrouiller le compte d'autrui.
      const ailleurs = await connecter(
        postJson(
          '/api/auth/login',
          { email: utilisateur.email, password: utilisateur.password },
          { ip: '198.51.100.1' },
        ),
      );

      expect(ailleurs.status).toBe(200);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });
});

describe('profil de l’appelant', () => {
  it('renvoie le profil au porteur d’un jeton valide', async () => {
    const utilisateur = await createTestUser();
    try {
      const reponse = await profil(get('/api/auth/me', { jeton: utilisateur.accessToken }));

      expect(reponse.status).toBe(200);
      const corps = await corpsJson<{ utilisateur: { id: string; role: string } }>(reponse);
      expect(corps.utilisateur.id).toBe(utilisateur.id);
      expect(corps.utilisateur.role).toBe('user');
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('accepte le jeton porté par le cookie', async () => {
    const utilisateur = await createTestUser();
    try {
      const reponse = await profil(
        get('/api/auth/me', { cookie: `${ACCESS_TOKEN_COOKIE}=${utilisateur.accessToken}` }),
      );

      expect(reponse.status).toBe(200);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('refuse sans jeton', async () => {
    const reponse = await profil(get('/api/auth/me'));

    expect(reponse.status).toBe(401);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('non_authentifie');
  });

  it('refuse un jeton fabriqué', async () => {
    const reponse = await profil(get('/api/auth/me', { jeton: 'jeton.completement.invente' }));

    expect(reponse.status).toBe(401);
  });

  it('refuse un compte suspendu, jeton valide compris', async () => {
    // Le jeton reste cryptographiquement valide : c'est la relecture du profil
    // en base, à chaque requête, qui ferme la porte (CLAUDE.md règle 4).
    const utilisateur = await createTestUser();
    try {
      await query(`update public.users set suspendu = true where id = $1`, [utilisateur.id]);

      const reponse = await profil(get('/api/auth/me', { jeton: utilisateur.accessToken }));

      expect(reponse.status).toBe(403);
      expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('compte_suspendu');
    } finally {
      await deleteTestUser(utilisateur);
    }
  });
});

describe('déconnexion', () => {
  it('révoque la session et efface les cookies', async () => {
    const utilisateur = await createTestUser();
    try {
      const reponse = await deconnecter(
        postJson('/api/auth/logout', {}, { jeton: utilisateur.accessToken }),
      );

      expect(reponse.status).toBe(204);
      const cookies = cookiesPoses(reponse);
      expect(cookies.some((c) => c.startsWith(`${ACCESS_TOKEN_COOKIE}=;`))).toBe(true);
      expect(cookies.every((c) => c.includes('Max-Age=0'))).toBe(true);

      // Effacer le cookie ne suffirait pas : le jeton doit être révoqué côté
      // serveur, faute de quoi une copie resterait utilisable.
      const apres = await profil(get('/api/auth/me', { jeton: utilisateur.accessToken }));
      expect(apres.status).toBe(401);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('aboutit même sans session', async () => {
    const reponse = await deconnecter(postJson('/api/auth/logout', {}));

    expect(reponse.status).toBe(204);
  });
});

describe('réinitialisation du mot de passe', () => {
  it('envoie un email à une adresse connue', async () => {
    const utilisateur = await createTestUser();
    try {
      await viderBoite();

      const reponse = await demanderReinit(
        postJson('/api/auth/password/reset', { email: utilisateur.email }),
      );

      expect(reponse.status).toBe(204);
      const message = await attendreEmail(utilisateur.email);
      expect(message.corps.length).toBeGreaterThan(0);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('répond pareil pour une adresse inconnue, sans envoyer d’email', async () => {
    await viderBoite();
    const inconnue = adresseNeuve();

    const reponse = await demanderReinit(postJson('/api/auth/password/reset', { email: inconnue }));

    expect(reponse.status).toBe(204);
    expect(await compterEmails(inconnue)).toBe(0);
  });

  it('refuse une adresse malformée', async () => {
    const reponse = await demanderReinit(postJson('/api/auth/password/reset', { email: 'x@' }));

    expect(reponse.status).toBe(400);
  });
});

describe('changement de mot de passe', () => {
  it('remplace le mot de passe et invalide l’ancien', async () => {
    const utilisateur = await createTestUser();
    const nouveau = 'NouveauMotDePasse2026';
    try {
      const reponse = await changerMotDePasse(
        postJson('/api/auth/password/update', { password: nouveau }, { jeton: utilisateur.accessToken }),
      );

      expect(reponse.status).toBe(204);

      const avecAncien = await connecter(
        postJson('/api/auth/login', { email: utilisateur.email, password: utilisateur.password }),
      );
      expect(avecAncien.status).toBe(401);

      const avecNouveau = await connecter(
        postJson('/api/auth/login', { email: utilisateur.email, password: nouveau }),
      );
      expect(avecNouveau.status).toBe(200);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('refuse sans session', async () => {
    const reponse = await changerMotDePasse(
      postJson('/api/auth/password/update', { password: 'NouveauMotDePasse2026' }),
    );

    expect(reponse.status).toBe(401);
  });

  it('refuse un mot de passe faible', async () => {
    const utilisateur = await createTestUser();
    try {
      const reponse = await changerMotDePasse(
        postJson('/api/auth/password/update', { password: 'court' }, { jeton: utilisateur.accessToken }),
      );

      expect(reponse.status).toBe(400);
    } finally {
      await deleteTestUser(utilisateur);
    }
  });
});
