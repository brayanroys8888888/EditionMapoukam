import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';

import { GET as entree } from '@/app/api/auth/google/route';
import { GET as retour } from '@/app/api/auth/google/retour/route';
import { GET as routeBetterAuth } from '@/app/api/better-auth/[...all]/route';
import { resetServerEnvCache } from '@/lib/config/env';
import { COOKIE_GOOGLE, decoderEtat } from '@/lib/auth/google';
import { IdentiteNonVerifiee, sessionPourIdentiteVerifiee } from '@/lib/auth/google-session';

import { closePool, query } from '../helpers/db';
import { get } from '../helpers/http';
import { deleteTestUserByEmail } from '../helpers/users';

/**
 * CONNEXION PAR GOOGLE — CE QUI SE PROUVE SANS COMPTE GOOGLE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER NE PARLE JAMAIS À GOOGLE, ET C'EST VOULU.                    │
 * │                                                                          │
 * │ Un test qui exigerait un vrai consentement ne tournerait sur aucune      │
 * │ machine de développement, donc ne tournerait jamais. Ce qui est éprouvé  │
 * │ ici est tout ce qui se trouve AVANT et APRÈS le fournisseur :            │
 * │                                                                          │
 * │  · l'interrupteur — 404 quand il est éteint, sur les trois routes ;      │
 * │  · l'aller — l'adresse d'autorisation et le cookie d'état, dont on       │
 * │    vérifie qu'ils forment un couple PKCE COHÉRENT ;                      │
 * │  · le retour raté — code absent, cookie absent, refus du fournisseur ;   │
 * │  · et le cœur du chemin Better Auth : une identité vérifiée devient une  │
 * │    vraie session Supabase, contre la base locale réelle.                 │
 * │                                                                          │
 * │ Ce qui reste non couvert est l'échange chez Google lui-même. Il est      │
 * │ signalé plutôt que simulé : un faux fournisseur ne prouverait que la     │
 * │ fidélité de sa propre imitation.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const APP = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';
const SUPABASE = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? 'http://127.0.0.1:54321';

const comptesCrees: string[] = [];

/** Pose l'interrupteur, et oublie l'environnement mémorisé. */
function poser(mode: 'desactive' | 'supabase' | 'better-auth'): void {
  process.env['AUTH_GOOGLE'] = mode;
  resetServerEnvCache();
}

function adresseNeuve(): string {
  const email = `google-${randomUUID()}@exemple.test`;
  comptesCrees.push(email);
  return email;
}

/** Valeur d'un cookie dans les en-têtes `Set-Cookie` d'une réponse. */
function cookiePose(reponse: Response, nom: string): string | null {
  for (const brut of reponse.headers.getSetCookie()) {
    const [paire] = brut.split(';');
    const separateur = paire?.indexOf('=') ?? -1;
    if (paire && separateur > 0 && paire.slice(0, separateur).trim() === nom) {
      return paire.slice(separateur + 1);
    }
  }
  return null;
}

afterEach(() => {
  delete process.env['AUTH_GOOGLE'];
  resetServerEnvCache();
});

afterAll(async () => {
  for (const email of comptesCrees) {
    await deleteTestUserByEmail(email);
  }
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════
// L'INTERRUPTEUR ÉTEINT N'OUVRE RIEN
// ═══════════════════════════════════════════════════════════════════════════

describe('AUTH_GOOGLE=desactive', () => {
  it('rend 404 sur l’entrée, le retour et les routes de Better Auth', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ 404 ET NON 403, pour la même raison que l'administration :          │
    // │ « vous n'avez pas accès » confirmerait qu'il y a quelque chose là.  │
    // │                                                                    │
    // │ Les TROIS routes sont éprouvées séparément. Une surface             │
    // │ d'authentification qui resterait ouverte sans que rien ne s'en      │
    // │ serve est exactement celle qu'on oublie de surveiller.              │
    // └────────────────────────────────────────────────────────────────────┘
    poser('desactive');

    expect((await entree(get('/api/auth/google?langue=fr'))).status).toBe(404);
    expect((await retour(get('/api/auth/google/retour?code=x&langue=fr'))).status).toBe(404);
    expect((await routeBetterAuth(get('/api/better-auth/callback/google'))).status).toBe(404);
  });

  it('les routes de Better Auth restent fermées SOUS LE CHEMIN SUPABASE', async () => {
    // Le contre-test qui compte : brancher Supabase ne doit pas laisser
    // ouverte la seconde implémentation, qui n'a alors ni secret ni raison
    // d'exister.
    poser('supabase');

    expect((await routeBetterAuth(get('/api/better-auth/callback/google'))).status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// L'ALLER — ADRESSE D'AUTORISATION ET COOKIE D'ÉTAT
// ═══════════════════════════════════════════════════════════════════════════

describe('entrée du parcours, chemin Supabase', () => {
  it('redirige vers le point d’autorisation du fournisseur', async () => {
    poser('supabase');

    const reponse = await entree(get('/api/auth/google?langue=fr'));

    // 303 : le navigateur suivra en GET, quelle que soit la méthode d'origine.
    expect(reponse.status).toBe(303);

    const destination = new URL(reponse.headers.get('location') ?? '');
    expect(destination.origin).toBe(new URL(SUPABASE).origin);
    expect(destination.pathname).toBe('/auth/v1/authorize');
    expect(destination.searchParams.get('provider')).toBe('google');
    expect(destination.searchParams.get('redirect_to')).toBe(
      `${APP}/api/auth/google/retour?langue=fr`,
    );
  });

  it('le défi envoyé correspond au vérifieur gardé — le couple PKCE tient', async () => {
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ LE SEUL TEST QUI PROUVE QUE PKCE N'EST PAS DÉCORATIF.              │
     * │                                                                    │
     * │ Deux valeurs indépendantes voyagent : le défi part chez le          │
     * │ fournisseur, le vérifieur reste dans un cookie. Si elles cessaient  │
     * │ de correspondre — un `fabriquerVerifieur` appelé deux fois, un      │
     * │ encodage différent de part et d'autre — l'échange échouerait en     │
     * │ production et NULLE PART ailleurs : ici, tout aurait l'air normal.  │
     * └────────────────────────────────────────────────────────────────────┘
     */
    poser('supabase');

    const reponse = await entree(get('/api/auth/google?langue=fr'));

    const defi = new URL(reponse.headers.get('location') ?? '').searchParams.get(
      'code_challenge',
    );
    const etat = decoderEtat(cookiePose(reponse, COOKIE_GOOGLE));

    expect(etat).not.toBeNull();
    expect(defi).toBe(createHash('sha256').update(etat?.verifieur ?? '').digest('base64url'));
  });

  it('le vérifieur n’est JAMAIS dans l’URL', async () => {
    poser('supabase');

    const reponse = await entree(get('/api/auth/google?langue=fr'));
    const etat = decoderEtat(cookiePose(reponse, COOKIE_GOOGLE));
    const destination = reponse.headers.get('location') ?? '';

    expect(etat?.verifieur).toBeDefined();
    expect(destination).not.toContain(etat?.verifieur ?? 'introuvable');
    expect(destination).not.toContain('code_verifier');
  });

  it('le cookie d’état est inaccessible au JavaScript de page', async () => {
    poser('supabase');

    const reponse = await entree(get('/api/auth/google?langue=fr'));
    const brut = reponse.headers.getSetCookie().find((c) => c.startsWith(COOKIE_GOOGLE));

    expect(brut).toContain('HttpOnly');
    expect(brut).toContain('SameSite=Lax');
  });

  it('la langue de départ est emportée des deux côtés', async () => {
    // Elle décide de l'écran de RETOUR, y compris quand l'échange échoue : un
    // refus rendu en français à un lecteur anglophone est un refus perdu.
    poser('supabase');

    const reponse = await entree(get('/api/auth/google?langue=en'));

    expect(decoderEtat(cookiePose(reponse, COOKIE_GOOGLE))?.langue).toBe('en');
    expect(new URL(reponse.headers.get('location') ?? '').searchParams.get('redirect_to')).toBe(
      `${APP}/api/auth/google/retour?langue=en`,
    );
  });

  it('une langue inconnue retombe sur le français, sans échouer', async () => {
    poser('supabase');

    const reponse = await entree(get('/api/auth/google?langue=klingon'));

    expect(reponse.status).toBe(303);
    expect(decoderEtat(cookiePose(reponse, COOKIE_GOOGLE))?.langue).toBe('fr');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LE RETOUR RATÉ — TROIS FAÇONS, UNE SEULE RÉPONSE
// ═══════════════════════════════════════════════════════════════════════════

describe('retour du fournisseur, en échec', () => {
  it('sans code ni état, renvoie à la connexion avec le motif', async () => {
    poser('supabase');

    const reponse = await retour(get('/api/auth/google/retour?langue=fr'));

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get('location')).toBe(
      `${APP}/fr/connexion?erreur=google_refuse`,
    );
  });

  it('efface le cookie d’état, même en échec', async () => {
    // Un vérifieur qui survivrait à un échange raté resterait valable dix
    // minutes pour le suivant. On n'accumule pas de secrets périmés.
    poser('supabase');

    const reponse = await retour(get('/api/auth/google/retour?langue=fr'));
    const brut = reponse.headers.getSetCookie().find((c) => c.startsWith(COOKIE_GOOGLE));

    expect(brut).toContain('Max-Age=0');
  });

  it('un refus annoncé par le fournisseur est rendu tel quel, en langue', async () => {
    // Consentement refusé, compte fermé, domaine non autorisé : le
    // fournisseur le dit dans `error`, et l'écran anglophone doit le lire.
    poser('supabase');

    const reponse = await retour(
      get('/api/auth/google/retour?langue=en&error=access_denied'),
    );

    expect(reponse.headers.get('location')).toBe(`${APP}/en/connexion?erreur=google_refuse`);
  });

  it('un code sans cookie d’état est refusé', async () => {
    // C'est la situation d'un code intercepté et rejoué depuis une autre
    // machine : sans le vérifieur, il ne vaut rien. C'est tout l'objet de PKCE.
    poser('supabase');

    const reponse = await retour(get('/api/auth/google/retour?langue=fr&code=code-vole'));

    expect(reponse.headers.get('location')).toBe(`${APP}/fr/connexion?erreur=google_refuse`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LE CŒUR DU CHEMIN BETTER AUTH — UNE IDENTITÉ VÉRIFIÉE DEVIENT UNE SESSION
// ═══════════════════════════════════════════════════════════════════════════

describe('ouverture d’une session depuis une identité vérifiée', () => {
  it('REFUSE une adresse que le fournisseur n’a pas vérifiée', async () => {
    /*
     * ┌────────────────────────────────────────────────────────────────────┐
     * │ LE TEST LE PLUS IMPORTANT DU FICHIER.                              │
     * │                                                                    │
     * │ Cette fonction ouvre une session SANS MOT DE PASSE, et rapproche    │
     * │ les comptes PAR L'ADRESSE EMAIL. Le jour où ce refus disparaîtrait, │
     * │ rien ne casserait : le parcours Google continuerait de fonctionner, │
     * │ et quiconque disposerait d'une adresse non confirmée chez un        │
     * │ fournisseur laxiste entrerait dans le compte d'un client.           │
     * └────────────────────────────────────────────────────────────────────┘
     */
    await expect(
      sessionPourIdentiteVerifiee({
        email: adresseNeuve(),
        emailVerifie: false,
        langue: 'fr',
      }),
    ).rejects.toBeInstanceOf(IdentiteNonVerifiee);
  });

  it('crée le compte absent, et rend une session Supabase utilisable', async () => {
    const email = adresseNeuve();

    const frappee = await sessionPourIdentiteVerifiee({
      email,
      emailVerifie: true,
      nomComplet: 'Parent venu de Google',
      langue: 'en',
    });

    expect(frappee).not.toBeNull();
    expect(frappee?.compteCree).toBe(true);
    expect(frappee?.session.access_token.length).toBeGreaterThan(20);
    expect(frappee?.session.refresh_token.length).toBeGreaterThan(10);
    expect(frappee?.session.expires_in).toBeGreaterThan(0);

    // Le profil métier existe : c'est le déclencheur de la migration 0004 qui
    // l'a créé, par le chemin réel — et `etablirSession` le relira.
    const profils = await query<{ id: string; langue_preferee: string; role: string }>(
      `select id, langue_preferee, role from public.users where email = $1`,
      [email],
    );

    expect(profils.length).toBe(1);
    expect(profils[0]?.id).toBe(frappee?.userId);
    expect(profils[0]?.langue_preferee).toBe('en');
    // Le rôle n'est jamais déduit d'une métadonnée de fournisseur.
    expect(profils[0]?.role).toBe('user');
  });

  it('RAPPROCHE la seconde visite du même compte, sans le recréer', async () => {
    // Sans ce rapprochement, chaque connexion Google créerait un compte de
    // plus — et l'utilisateur perdrait sa bibliothèque à la deuxième visite.
    const email = adresseNeuve();

    const premiere = await sessionPourIdentiteVerifiee({
      email,
      emailVerifie: true,
      langue: 'fr',
    });
    const seconde = await sessionPourIdentiteVerifiee({
      email,
      emailVerifie: true,
      langue: 'fr',
    });

    expect(premiere?.compteCree).toBe(true);
    expect(seconde?.compteCree).toBe(false);
    expect(seconde?.userId).toBe(premiere?.userId);

    const comptes = await query<{ n: string }>(
      `select count(*)::text as n from public.users where email = $1`,
      [email],
    );
    expect(comptes[0]?.n).toBe('1');
  });

  it('rapproche quelle que soit la casse de l’adresse', async () => {
    // Google rend l'adresse telle que l'utilisateur l'a saisie ; `users.email`
    // est unique et minuscule. Sans normalisation, « Jean@… » et « jean@… »
    // seraient deux comptes — jusqu'à ce que la contrainte d'unicité tranche.
    const email = adresseNeuve();

    const premiere = await sessionPourIdentiteVerifiee({
      email,
      emailVerifie: true,
      langue: 'fr',
    });
    const seconde = await sessionPourIdentiteVerifiee({
      email: email.toUpperCase(),
      emailVerifie: true,
      langue: 'fr',
    });

    expect(seconde?.userId).toBe(premiere?.userId);
    expect(seconde?.compteCree).toBe(false);
  });
});
