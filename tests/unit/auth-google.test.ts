import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import {
  CHEMIN_GOOGLE,
  COOKIE_GOOGLE,
  DUREE_COOKIE_GOOGLE_SECONDES,
  cookieEtat,
  cookieEtatEfface,
  decoderEtat,
  defiDepuisVerifieur,
  encoderEtat,
  fabriquerVerifieur,
  lienGoogle,
  urlAutorisationSupabase,
} from '@/lib/auth/google';

/**
 * PKCE — LA PART QUI SE PROUVE SANS COMPTE GOOGLE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST ÉPROUVÉ ICI EST PRÉCISÉMENT CE QUE PERSONNE NE REGARDERA.    │
 * │                                                                          │
 * │ Un échange OAuth qui fonctionne a l'air identique, qu'il soit protégé    │
 * │ par PKCE ou non : on clique, on revient connecté. Un défi mal calculé,   │
 * │ un cookie sans `HttpOnly`, un `SameSite=Strict` qui retient le cookie au │
 * │ retour — rien de tout cela ne se voit à l'usage, et tout se voit ici.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

describe('vérifieur PKCE', () => {
  it('n’emploie que l’alphabet base64url, et reste long', () => {
    const verifieur = fabriquerVerifieur();

    expect(verifieur).toMatch(/^[A-Za-z0-9_-]+$/);
    // 48 octets en base64url font 64 caractères : très au-dessus des 43 exigés
    // par la spécification, parce que c'est le seul secret du parcours.
    expect(verifieur.length).toBeGreaterThanOrEqual(43);
  });

  it('ne rend jamais deux fois la même valeur', () => {
    const valeurs = new Set(Array.from({ length: 50 }, () => fabriquerVerifieur()));

    expect(valeurs.size).toBe(50);
  });
});

describe('défi PKCE', () => {
  it('est l’empreinte SHA-256 du vérifieur, en base64url', async () => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ COMPARÉ À UNE SECONDE IMPLÉMENTATION, PAS À UNE CONSTANTE.         │
    // │                                                                    │
    // │ Le code emploie l'API Web (`crypto.subtle`), pour rester servable   │
    // │ en périphérie ; le test emploie `node:crypto`. Une valeur figée ne  │
    // │ prouverait que sa propre recopie — deux chemins indépendants qui    │
    // │ tombent d'accord prouvent le calcul.                                │
    // └────────────────────────────────────────────────────────────────────┘
    const verifieur = fabriquerVerifieur();

    const attendu = createHash('sha256').update(verifieur).digest('base64url');

    expect(await defiDepuisVerifieur(verifieur)).toBe(attendu);
  });

  it('change dès que le vérifieur change d’un caractère', async () => {
    const premier = await defiDepuisVerifieur('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG');
    const second = await defiDepuisVerifieur('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFH');

    expect(premier).not.toBe(second);
  });

  it('ne porte aucun caractère à échapper dans une URL', async () => {
    const defi = await defiDepuisVerifieur(fabriquerVerifieur());

    expect(defi).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('état transporté par le cookie', () => {
  it('fait l’aller-retour sans rien perdre', () => {
    const verifieur = fabriquerVerifieur();

    expect(decoderEtat(encoderEtat({ verifieur, langue: 'en' }))).toEqual({
      verifieur,
      langue: 'en',
    });
  });

  it('accepte les deux langues d’interface', () => {
    const verifieur = fabriquerVerifieur();

    expect(decoderEtat(encoderEtat({ verifieur, langue: 'fr' }))?.langue).toBe('fr');
    expect(decoderEtat(encoderEtat({ verifieur, langue: 'en' }))?.langue).toBe('en');
  });

  it('refuse tout ce qui n’a pas la forme attendue', () => {
    // Un état illisible doit rendre `null`, et non une valeur partielle : la
    // route en tire un refus, alors qu'un vérifieur tronqué ferait échouer
    // l'échange plus loin, avec un message qui ne parlerait pas de cookie.
    for (const valeur of [
      null,
      undefined,
      '',
      'sans-point',
      '.fr',
      'trop-court.fr',
      `${fabriquerVerifieur()}.de`,
      `${fabriquerVerifieur()}.`,
    ]) {
      expect(decoderEtat(valeur), `« ${String(valeur)} » aurait dû être refusé`).toBeNull();
    }
  });
});

describe('cookie d’état', () => {
  it('est inaccessible au JavaScript de page, et survit au retour d’un autre site', () => {
    const cookie = cookieEtat('valeur', { secure: false });

    expect(cookie).toContain(`${COOKIE_GOOGLE}=valeur`);
    expect(cookie).toContain('HttpOnly');
    // `Strict` retiendrait le cookie exactement au retour du fournisseur —
    // c'est-à-dire au seul moment où il sert.
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain(`Max-Age=${String(DUREE_COOKIE_GOOGLE_SECONDES)}`);
  });

  it('n’est `Secure` qu’en production', () => {
    // Sans cette distinction, le navigateur refuserait le cookie sur
    // `http://localhost` et l'échange échouerait sur toute machine de
    // développement — en accusant un vérifieur absent.
    expect(cookieEtat('valeur', { secure: false })).not.toContain('Secure');
    expect(cookieEtat('valeur', { secure: true })).toContain('Secure');
  });

  it('s’efface par une durée nulle, sous le même nom', () => {
    const efface = cookieEtatEfface({ secure: false });

    expect(efface).toContain(`${COOKIE_GOOGLE}=`);
    expect(efface).toContain('Max-Age=0');
    expect(efface).toContain('HttpOnly');
  });
});

describe('adresse d’autorisation Supabase', () => {
  const adresse = urlAutorisationSupabase({
    supabaseUrl: 'http://127.0.0.1:54321',
    retourUrl: 'http://localhost:3000/api/auth/google/retour?langue=fr',
    defi: 'un-defi',
  });
  const url = new URL(adresse);

  it('vise le point d’autorisation du fournisseur', () => {
    expect(url.origin).toBe('http://127.0.0.1:54321');
    expect(url.pathname).toBe('/auth/v1/authorize');
    expect(url.searchParams.get('provider')).toBe('google');
  });

  it('porte le défi, et jamais le vérifieur', () => {
    expect(url.searchParams.get('code_challenge')).toBe('un-defi');
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    // Le vérifieur dans l'URL rendrait PKCE décoratif : il voyage dans un
    // cookie `HttpOnly`, et nulle part ailleurs.
    expect(adresse).not.toContain('code_verifier');
  });

  it('rapporte l’utilisateur sur notre route de retour', () => {
    expect(url.searchParams.get('redirect_to')).toBe(
      'http://localhost:3000/api/auth/google/retour?langue=fr',
    );
  });
});

describe('lien du bouton', () => {
  it('pointe sur l’entrée commune, en portant la langue', () => {
    expect(lienGoogle('fr')).toBe(`${CHEMIN_GOOGLE}?langue=fr`);
    expect(lienGoogle('en')).toBe(`${CHEMIN_GOOGLE}?langue=en`);
  });

  it('ne dépend pas du chemin choisi', () => {
    // C'est ce qui permet de basculer `AUTH_GOOGLE` sans toucher un écran :
    // l'adresse est la même que l'échange soit conduit par Supabase ou par
    // Better Auth.
    expect(lienGoogle('fr')).not.toContain('supabase');
    expect(lienGoogle('fr')).not.toContain('better');
  });
});
