import { afterAll, describe, expect, it } from 'vitest';

import { GET as profil } from '@/app/api/auth/me/route';
import { POST as inscrire } from '@/app/api/auth/register/route';
import { requireAdmin, requireUser } from '@/lib/auth/session';

import { closePool, query } from '../helpers/db';
import { corpsJson, get, postJson, type ReponseErreur } from '../helpers/http';
import { createTestUser, deleteTestUser, serviceClient } from '../helpers/users';

/**
 * Élévation de privilège.
 *
 * Le rôle est la seule donnée du profil qui ouvre l'accès au back-office. Ce
 * fichier rassemble tout ce qui pourrait permettre à un utilisateur de se le
 * donner : par l'inscription, par la mise à jour de son profil, par les
 * métadonnées de son jeton, ou en se contentant d'être connecté.
 */
const comptesCrees: string[] = [];

afterAll(async () => {
  for (const email of comptesCrees) {
    const lignes = await query<{ id: string }>(`select id from auth.users where email = $1`, [email]);
    for (const ligne of lignes) await serviceClient().auth.admin.deleteUser(ligne.id);
  }
  await closePool();
});

describe('à l’inscription', () => {
  it('n’accorde jamais le rôle demandé dans le corps de la requête', async () => {
    const email = `escalade-${Date.now()}@exemple.test`;
    comptesCrees.push(email);

    await inscrire(
      postJson('/api/auth/register', {
        email,
        password: 'MotDePasse2026',
        role: 'admin',
        user_metadata: { role: 'admin' },
      }),
    );

    const profils = await query<{ role: string }>(
      `select role::text from public.users where email = $1`,
      [email],
    );
    expect(profils[0]?.role).toBe('user');
  });
});

describe('sur le profil', () => {
  it('interdit à un utilisateur de modifier son rôle', async () => {
    const utilisateur = await createTestUser();
    try {
      const { error } = await utilisateur.client
        .from('users')
        .update({ role: 'admin' })
        .eq('id', utilisateur.id);

      expect(error).not.toBeNull();

      const apres = await query<{ role: string }>(
        `select role::text from public.users where id = $1`,
        [utilisateur.id],
      );
      expect(apres[0]?.role).toBe('user');
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('interdit de modifier le rôle d’un autre compte', async () => {
    const [alice, bob] = await Promise.all([createTestUser(), createTestUser()]);
    try {
      await alice.client.from('users').update({ role: 'admin' }).eq('id', bob.id);

      const apres = await query<{ role: string }>(
        `select role::text from public.users where id = $1`,
        [bob.id],
      );
      expect(apres[0]?.role).toBe('user');
    } finally {
      await deleteTestUser(alice);
      await deleteTestUser(bob);
    }
  });
});

describe('par les métadonnées du jeton', () => {
  it('ignore un rôle inscrit dans les métadonnées de l’utilisateur', async () => {
    // Les métadonnées sont modifiables par le client via l'API d'Auth. Le rôle
    // n'en est donc jamais lu : il vient de public.users, et de nulle part
    // ailleurs.
    const utilisateur = await createTestUser();
    try {
      await serviceClient().auth.admin.updateUserById(utilisateur.id, {
        user_metadata: { role: 'admin' },
      });

      const reponse = await profil(get('/api/auth/me', { jeton: utilisateur.accessToken }));

      const corps = await corpsJson<{ utilisateur: { role: string } }>(reponse);
      expect(corps.utilisateur.role).toBe('user');
    } finally {
      await deleteTestUser(utilisateur);
    }
  });
});

describe('gardes de route', () => {
  it('requireUser refuse un visiteur avec 401', async () => {
    const resultat = await requireUser(get('/api/quelconque'));

    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.response.status).toBe(401);
    }
  });

  it('requireAdmin refuse un utilisateur ordinaire avec 403, non 401', async () => {
    // La distinction est volontaire : 401 signifie « identifiez-vous », 403
    // « vous êtes identifié, mais cela ne vous regarde pas ». Confondre les
    // deux enverrait un utilisateur légitime se reconnecter en boucle.
    const utilisateur = await createTestUser();
    try {
      const resultat = await requireAdmin(get('/api/admin/x', { jeton: utilisateur.accessToken }));

      expect(resultat.ok).toBe(false);
      if (!resultat.ok) {
        expect(resultat.response.status).toBe(403);
        const corps = await corpsJson<ReponseErreur>(resultat.response);
        expect(corps.erreur.code).toBe('interdit');
      }
    } finally {
      await deleteTestUser(utilisateur);
    }
  });

  it('requireAdmin accepte un administrateur', async () => {
    const administrateur = await createTestUser({ admin: true });
    try {
      const resultat = await requireAdmin(get('/api/admin/x', { jeton: administrateur.accessToken }));

      expect(resultat.ok).toBe(true);
      if (resultat.ok) {
        expect(resultat.appelant.role).toBe('admin');
      }
    } finally {
      await deleteTestUser(administrateur);
    }
  });

  it('requireAdmin refuse un administrateur suspendu', async () => {
    // La suspension prime sur le rôle : un administrateur suspendu ne doit pas
    // conserver les clés du back-office.
    const administrateur = await createTestUser({ admin: true });
    try {
      await query(`update public.users set suspendu = true where id = $1`, [administrateur.id]);

      const resultat = await requireAdmin(get('/api/admin/x', { jeton: administrateur.accessToken }));

      expect(resultat.ok).toBe(false);
      if (!resultat.ok) {
        expect(resultat.response.status).toBe(403);
      }
    } finally {
      await deleteTestUser(administrateur);
    }
  });
});
