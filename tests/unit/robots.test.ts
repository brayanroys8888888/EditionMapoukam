import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import robots from '@/app/robots';
import { resetServerEnvCache } from '@/lib/config/env';

/**
 * `robots.txt` — les variantes filtrées des catalogues sont interdites,
 * les écrans nus ne le sont pas.
 *
 * Le premier déploiement a été mis en pause par l'hébergeur : des robots
 * s'enfermaient dans les combinaisons de filtres. Voir
 * `src/components/catalogue/variantes.ts`.
 */

beforeEach(() => {
  // `robots()` lit l'adresse publique dans l'environnement validé : on lui en
  // fournit un complet, sans dépendre d'aucun fichier `.env`.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'cle-anonyme-de-test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'cle-de-service-de-test');
  vi.stubEnv('FAKE_WEBHOOK_SECRET', 'secret-de-test');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://site.exemple');
  resetServerEnvCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

function interdits(): string[] {
  const { rules } = robots();
  const regle = Array.isArray(rules) ? rules[0] : rules;
  const disallow = regle?.disallow ?? [];
  return Array.isArray(disallow) ? disallow : [disallow];
}

describe('robots.txt — le piège des filtres est fermé', () => {
  it.each(['catalogue', 'contes', 'livrets'])('les variantes de /%s sont interdites, en deux langues', (ecran) => {
    expect(interdits()).toEqual(expect.arrayContaining([`/fr/${ecran}?`, `/en/${ecran}?`]));
  });

  it('les écrans NUS restent explorables — le contre-test', () => {
    // Interdire `/fr/catalogue` sans le `?` retirerait la vitrine des moteurs.
    for (const ecran of ['catalogue', 'contes', 'livrets']) {
      expect(interdits()).not.toContain(`/fr/${ecran}`);
      expect(interdits()).not.toContain(`/en/${ecran}`);
    }
  });

  it('le plan du site est annoncé à l’adresse publique', () => {
    expect(robots().sitemap).toBe('https://site.exemple/sitemap.xml');
  });
});
