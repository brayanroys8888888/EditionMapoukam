import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { POST as inscrire } from '@/app/api/auth/register/route';
import { POST as connecter } from '@/app/api/auth/login/route';
import { POST as echangerCode } from '@/app/api/auth/otp/route';
import { POST as renvoyer } from '@/app/api/auth/resend/route';
import { POST as demanderReinit } from '@/app/api/auth/password/reset/route';
import { POST as changerMotDePasse } from '@/app/api/auth/password/update/route';
import { GET as profil } from '@/app/api/auth/me/route';
import {
  codeEmailRateLimiter,
  codeRateLimiter,
  loginRateLimiter,
} from '@/lib/http/rate-limit';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth/cookies';

import { closePool, query } from '../helpers/db';
import { corpsJson, cookiesPoses, get, postJson, type ReponseErreur } from '../helpers/http';
import { attendreEmail, viderBoite } from '../helpers/mailpit';
import { deleteTestUserByEmail } from '../helpers/users';

/**
 * PARCOURS D'AUTHENTIFICATION PAR CODE À USAGE UNIQUE — étape F3.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER ÉPROUVE L'ARBITRAGE Q3 DE BOUT EN BOUT, PAR L'EMAIL RÉEL.    │
 * │                                                                          │
 * │ Le code n'est jamais lu par une API d'administration : il est extrait du │
 * │ message capturé par Mailpit, exactement là où l'utilisateur le lira.     │
 * │ C'est ce qui fait que ces tests couvrent AUSSI les gabarits              │
 * │ (`supabase/templates/`) et leur déclaration dans `supabase/config.toml`. │
 * │                                                                          │
 * │ Un gabarit revenu à sa version par défaut ne porterait plus que le lien  │
 * │ de Supabase : le code disparaîtrait, et ces tests tomberaient — ce qui   │
 * │ est précisément ce qu'on attend d'eux.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const MOT_DE_PASSE = 'MotDePasse2026';
const NOUVEAU_MOT_DE_PASSE = 'AutreMotDePasse2027';
const comptesCrees: string[] = [];

function adresseNeuve(): string {
  const email = `parcours-${randomUUID()}@exemple.test`;
  comptesCrees.push(email);
  return email;
}

/**
 * Le code à six chiffres, lu dans l'email réellement envoyé.
 *
 * L'affirmation intermédiaire compte autant que l'extraction : sans elle, un
 * gabarit vide rendrait `null`, et chaque test échouerait sur un message
 * incompréhensible au lieu de nommer la cause.
 */
async function codeRecu(email: string): Promise<string> {
  const message = await attendreEmail(email);
  const trouve = /\b\d{6}\b/.exec(message.corps);

  expect(
    trouve,
    `aucun code à six chiffres dans l’email — le gabarit porte-t-il « {{ .Token }} » ?`,
  ).not.toBeNull();

  return trouve?.[0] ?? '';
}

beforeEach(() => {
  // Les limiteurs sont des singletons de module : sans remise à zéro, un test
  // hériterait des tentatives du précédent.
  loginRateLimiter.vider();
  codeRateLimiter.vider();
  codeEmailRateLimiter.vider();
});

afterAll(async () => {
  for (const email of comptesCrees) await deleteTestUserByEmail(email);
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════
// LE GABARIT
// ═══════════════════════════════════════════════════════════════════════════

describe('l’email porte le code, et rien qui puisse ouvrir une session sans lui', () => {
  it('l’email d’inscription contient un code à six chiffres', async () => {
    const email = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));

    const code = await codeRecu(email);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('l’email ne porte AUCUN jeton dans une URL — le contre-test du choix Q3', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ SANS CETTE ASSERTION, LE GABARIT PAR DÉFAUT PASSERAIT.             │
    // │                                                                    │
    // │ Un gabarit qui afficherait le code ET conserverait le lien de      │
    // │ Supabase satisferait le test précédent tout en rouvrant le second  │
    // │ chemin d'établissement de session que Q3 a écarté — celui qui       │
    // │ dépose des jetons dans le fragment de l'URL et impose du           │
    // │ JavaScript de page.                                                │
    // └────────────────────────────────────────────────────────────────────┘
    const email = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));
    const message = await attendreEmail(email);

    expect(message.corps.length).toBeGreaterThan(0);
    for (const interdit of ['token_hash=', 'access_token=', 'refresh_token=', '/auth/v1/verify']) {
      expect(message.corps, `l’email porte encore « ${interdit} »`).not.toContain(interdit);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRMATION D'ADRESSE
// ═══════════════════════════════════════════════════════════════════════════

describe('confirmation d’adresse par code', () => {
  it('le code confirme l’adresse ET ouvre une session', async () => {
    const email = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));
    const code = await codeRecu(email);

    const reponse = await echangerCode(
      postJson('/api/auth/otp', { email, code, type: 'signup' }),
    );

    expect(reponse.status).toBe(200);

    // Les deux cookies sont posés, et `HttpOnly` : un XSS ne doit pas les lire.
    const cookies = cookiesPoses(reponse);
    expect(cookies.some((c) => c.startsWith(`${ACCESS_TOKEN_COOKIE}=`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${REFRESH_TOKEN_COOKIE}=`))).toBe(true);
    for (const cookie of cookies) expect(cookie).toContain('HttpOnly');

    // La session ouverte est réellement utilisable — sans quoi on aurait posé
    // des cookies décoratifs.
    const charge = await corpsJson<{ access_token: string }>(reponse);
    const moi = await profil(get('/api/auth/me', { jeton: charge.access_token }));
    expect(moi.status).toBe(200);
  });

  it('la connexion devient possible, alors qu’elle était refusée avant', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE CONTRE-TEST DU PRÉCÉDENT. Sans lui, une route qui ouvrirait une │
    // │ session sans jamais confirmer l'adresse passerait : l'important     │
    // │ n'est pas que le code marche, c'est qu'il CHANGE quelque chose.     │
    // └────────────────────────────────────────────────────────────────────┘
    const email = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));

    const avant = await connecter(
      postJson('/api/auth/login', { email, password: MOT_DE_PASSE }, { ip: '10.0.0.1' }),
    );
    expect(avant.status).toBe(403);
    expect((await corpsJson<ReponseErreur>(avant)).erreur.code).toBe('email_non_verifie');

    const code = await codeRecu(email);
    await echangerCode(postJson('/api/auth/otp', { email, code, type: 'signup' }));

    const apres = await connecter(
      postJson('/api/auth/login', { email, password: MOT_DE_PASSE }, { ip: '10.0.0.2' }),
    );
    expect(apres.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RÉINITIALISATION DE MOT DE PASSE
// ═══════════════════════════════════════════════════════════════════════════

describe('réinitialisation de mot de passe par code', () => {
  it('le parcours complet change effectivement le mot de passe', async () => {
    const email = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));
    const codeInscription = await codeRecu(email);
    await echangerCode(postJson('/api/auth/otp', { email, code: codeInscription, type: 'signup' }));

    await viderBoite();
    await demanderReinit(postJson('/api/auth/password/reset', { email }));
    const codeReinit = await codeRecu(email);

    const echange = await echangerCode(
      postJson('/api/auth/otp', { email, code: codeReinit, type: 'recovery' }),
    );
    expect(echange.status).toBe(200);

    const session = await corpsJson<{ access_token: string }>(echange);
    const changement = await changerMotDePasse(
      postJson('/api/auth/password/update', { password: NOUVEAU_MOT_DE_PASSE }, {
        jeton: session.access_token,
      }),
    );
    expect(changement.status).toBe(204);

    // LES DEUX SENS. L'ancien mot de passe doit cesser de fonctionner : sans
    // cette moitié, un changement qui n'aurait rien changé passerait.
    const avecNouveau = await connecter(
      postJson('/api/auth/login', { email, password: NOUVEAU_MOT_DE_PASSE }, { ip: '10.0.1.1' }),
    );
    expect(avecNouveau.status).toBe(200);

    const avecAncien = await connecter(
      postJson('/api/auth/login', { email, password: MOT_DE_PASSE }, { ip: '10.0.1.2' }),
    );
    expect(avecAncien.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE CODE NE DOIT PAS PERMETTRE
// ═══════════════════════════════════════════════════════════════════════════

describe('refus', () => {
  it('un code déjà consommé ne sert pas deux fois', async () => {
    const email = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));
    const code = await codeRecu(email);

    const premier = await echangerCode(postJson('/api/auth/otp', { email, code, type: 'signup' }));
    expect(premier.status).toBe(200);

    const second = await echangerCode(postJson('/api/auth/otp', { email, code, type: 'signup' }));
    expect(second.status).toBe(400);
    expect((await corpsJson<ReponseErreur>(second)).erreur.code).toBe('code_invalide');
  });

  it('un code faux n’ouvre rien', async () => {
    const email = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));
    await codeRecu(email);

    const reponse = await echangerCode(
      postJson('/api/auth/otp', { email, code: '000000', type: 'signup' }),
    );

    expect(reponse.status).toBe(400);
    expect(cookiesPoses(reponse)).toEqual([]);
  });

  it('le code d’un compte n’ouvre pas la session d’un autre', async () => {
    // Le code est lié à l'adresse côté fournisseur. On le vérifie plutôt que
    // de le supposer : c'est la garantie qui empêche un inscrit de prendre le
    // compte de quelqu'un d'autre avec son propre code.
    const victime = adresseNeuve();
    const attaquant = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email: victime, password: MOT_DE_PASSE }));
    await inscrire(postJson('/api/auth/register', { email: attaquant, password: MOT_DE_PASSE }));

    const codeAttaquant = await codeRecu(attaquant);

    const reponse = await echangerCode(
      postJson('/api/auth/otp', { email: victime, code: codeAttaquant, type: 'signup' }),
    );

    expect(reponse.status).toBe(400);
    expect(cookiesPoses(reponse)).toEqual([]);
  });

  it('un type non prévu est refusé par la validation, jamais transmis', async () => {
    // `verifyOtp` accepte aussi des types liés au changement d'adresse email.
    // L'énumération est fermée pour qu'un client ne puisse pas les choisir.
    const reponse = await echangerCode(
      postJson('/api/auth/otp', {
        email: 'quelquun@exemple.test',
        code: '123456',
        type: 'email_change',
      }),
    );

    expect(reponse.status).toBe(400);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('requete_invalide');
  });

  it('un compte suspendu n’ouvre pas de session par le code', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE CONTRÔLE DE STATUT VIT DANS `etablirSession`, PARTAGÉ AVEC LA   │
    // │ CONNEXION. Ce test est ce qui rend l'extraction sûre : sans lui,   │
    // │ « mot de passe oublié » deviendrait une porte dérobée pour un       │
    // │ compte suspendu.                                                    │
    // └────────────────────────────────────────────────────────────────────┘
    const email = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));
    const code = await codeRecu(email);

    await query(`update public.users set statut = 'suspendu' where email = $1`, [email]);

    const reponse = await echangerCode(
      postJson('/api/auth/otp', { email, code, type: 'signup' }),
    );

    expect(reponse.status).toBe(403);
    expect((await corpsJson<ReponseErreur>(reponse)).erreur.code).toBe('compte_suspendu');
    expect(cookiesPoses(reponse)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LIMITATION DES TENTATIVES
// ═══════════════════════════════════════════════════════════════════════════

describe('un code de six chiffres se force brutalement — les deux plafonds', () => {
  it('cinq essais par couple adresse IP / email, puis 429 avec `retry-after`', async () => {
    const email = adresseNeuve();

    for (let essai = 0; essai < 5; essai += 1) {
      const reponse = await echangerCode(
        postJson('/api/auth/otp', { email, code: '000000', type: 'signup' }, { ip: '203.0.113.7' }),
      );
      expect(reponse.status, `essai ${String(essai + 1)}`).toBe(400);
    }

    const refus = await echangerCode(
      postJson('/api/auth/otp', { email, code: '000000', type: 'signup' }, { ip: '203.0.113.7' }),
    );

    expect(refus.status).toBe(429);
    expect(Number(refus.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('le plafond par ADRESSE tient malgré un changement d’IP à chaque essai', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ C'EST LA RAISON D'ÊTRE DU SECOND LIMITEUR.                         │
    // │                                                                    │
    // │ Le premier est indexé sur le couple IP / email : un attaquant qui   │
    // │ change d'adresse IP à chaque tentative ne le rencontre JAMAIS, et   │
    // │ disposerait du million de valeurs. Ce test échoue si le second      │
    // │ plafond disparaît — la connexion par mot de passe, elle, n'en a pas │
    // │ et n'en veut pas.                                                   │
    // └────────────────────────────────────────────────────────────────────┘
    const email = adresseNeuve();

    for (let essai = 0; essai < 20; essai += 1) {
      const reponse = await echangerCode(
        postJson(
          '/api/auth/otp',
          { email, code: '000000', type: 'signup' },
          { ip: `198.51.100.${String(essai + 1)}` },
        ),
      );
      expect(reponse.status, `essai ${String(essai + 1)}`).toBe(400);
    }

    const refus = await echangerCode(
      postJson('/api/auth/otp', { email, code: '000000', type: 'signup' }, { ip: '198.51.100.200' }),
    );

    expect(refus.status).toBe(429);
  });

  it('le plafond par adresse ne bloque PAS une autre adresse — le contre-test', async () => {
    // Sans lui, un limiteur qui refuserait tout le monde passerait le test
    // précédent.
    const bloquee = adresseNeuve();
    const autre = adresseNeuve();

    for (let essai = 0; essai < 20; essai += 1) {
      await echangerCode(
        postJson(
          '/api/auth/otp',
          { email: bloquee, code: '000000', type: 'signup' },
          { ip: `192.0.2.${String(essai + 1)}` },
        ),
      );
    }

    const voisine = await echangerCode(
      postJson('/api/auth/otp', { email: autre, code: '000000', type: 'signup' }, { ip: '192.0.2.9' }),
    );

    expect(voisine.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RENVOI D'UN CODE — L'INDISTINGUABILITÉ, JUSQU'À L'OCTET
// ═══════════════════════════════════════════════════════════════════════════

describe('l’échec de connexion ne dit jamais LEQUEL des deux champs est faux', () => {
  it('adresse inconnue et mot de passe faux rendent la MÊME réponse, octet pour octet', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LA TROISIÈME INDISTINGUABILITÉ, et la seule qui n'était couverte   │
    // │ nulle part : `tests/integration/auth.test.ts` compare les deux     │
    // │ réponses de l'INSCRIPTION, jamais celles de la connexion.          │
    // │                                                                    │
    // │ C'est elle qui autorise l'interface à afficher une erreur unique au │
    // │ niveau du formulaire. Si elle tombait, l'écran deviendrait un       │
    // │ oracle : « mot de passe incorrect » signifierait « cette adresse a  │
    // │ un compte ».                                                       │
    // └────────────────────────────────────────────────────────────────────┘
    const connue = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email: connue, password: MOT_DE_PASSE }));
    const code = await codeRecu(connue);
    await echangerCode(postJson('/api/auth/otp', { email: connue, code, type: 'signup' }));

    const inconnue = `jamais-vue-${randomUUID()}@exemple.test`;

    const mauvaisMotDePasse = await connecter(
      postJson('/api/auth/login', { email: connue, password: 'PasLeBon2026' }, { ip: '10.1.0.1' }),
    );
    const adresseInconnue = await connecter(
      postJson('/api/auth/login', { email: inconnue, password: MOT_DE_PASSE }, { ip: '10.1.0.2' }),
    );

    expect(mauvaisMotDePasse.status).toBe(401);
    expect(adresseInconnue.status).toBe(mauvaisMotDePasse.status);
    expect(await adresseInconnue.text()).toBe(await mauvaisMotDePasse.text());
  });

  it('la demande de réinitialisation répond 204 dans les deux cas', async () => {
    // La deuxième indistinguabilité. L'écran affiche « vérifiez votre boîte »
    // sans condition, ce qui n'est tenable que parce que la route ne
    // différencie rien.
    const connue = adresseNeuve();
    await inscrire(postJson('/api/auth/register', { email: connue, password: MOT_DE_PASSE }));

    const inconnue = `jamais-vue-${randomUUID()}@exemple.test`;

    const surConnue = await demanderReinit(postJson('/api/auth/password/reset', { email: connue }));
    const surInconnue = await demanderReinit(
      postJson('/api/auth/password/reset', { email: inconnue }),
    );

    expect(surConnue.status).toBe(204);
    expect(surInconnue.status).toBe(204);
    expect(await surInconnue.text()).toBe(await surConnue.text());
  });
});

describe('le renvoi d’un code ne dit jamais si l’adresse existe', () => {
  it('adresse inconnue et adresse connue rendent la MÊME réponse', async () => {
    const connue = adresseNeuve();
    await inscrire(postJson('/api/auth/register', { email: connue, password: MOT_DE_PASSE }));

    const inconnue = `jamais-vue-${randomUUID()}@exemple.test`;

    const surConnue = await renvoyer(postJson('/api/auth/resend', { email: connue }));
    const surInconnue = await renvoyer(postJson('/api/auth/resend', { email: inconnue }));

    expect(surConnue.status).toBe(surInconnue.status);
    expect(surConnue.status).toBe(204);
    expect(await surConnue.text()).toBe(await surInconnue.text());
  });

  it('une adresse DÉJÀ confirmée rend elle aussi la même réponse', async () => {
    // Le cas oublié : distinguer « en attente » de « déjà confirmée »
    // signalerait les inscriptions récentes, ce qui est une information sur
    // les personnes autant que sur les comptes.
    const email = adresseNeuve();
    await viderBoite();

    await inscrire(postJson('/api/auth/register', { email, password: MOT_DE_PASSE }));
    const code = await codeRecu(email);
    await echangerCode(postJson('/api/auth/otp', { email, code, type: 'signup' }));

    const reponse = await renvoyer(postJson('/api/auth/resend', { email }));

    expect(reponse.status).toBe(204);
    expect(await reponse.text()).toBe('');
  });
});
