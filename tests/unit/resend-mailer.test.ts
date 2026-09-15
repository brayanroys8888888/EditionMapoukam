import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MessageMail } from '@/adapters/mail/types';
import { resetServerEnvCache } from '@/lib/config/env';

/**
 * `ResendMailer` — l'expéditeur et l'adresse des liens.
 *
 * Deux pannes silencieuses, constatées en production :
 *  · sans `RESEND_FROM_EMAIL`, l'envoi partait de `onboarding@resend.dev`,
 *    qui ne livre qu'au propriétaire du compte Resend — « réussi » côté
 *    serveur, jamais reçu par le client ;
 *  · les liens des emails désignaient un déploiement mis en pause, écrit en
 *    dur dans l'adaptateur.
 *
 * Aucun appel réseau : le client Resend est remplacé, et l'on inspecte ce
 * qu'il aurait envoyé.
 */

const envoye = vi.hoisted(() => ({ dernier: null as Record<string, unknown> | null }));

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: (charge: Record<string, unknown>) => {
        envoye.dernier = charge;
        return Promise.resolve({ data: { id: 'email_1' }, error: null });
      },
    };
  },
}));

const { ResendMailer } = await import('@/adapters/mail/resend-mailer');

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'cle-anonyme-de-test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'cle-de-service-de-test');
  vi.stubEnv('FAKE_WEBHOOK_SECRET', 'secret-de-test');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://site.exemple/');
  vi.stubEnv('RESEND_FROM_EMAIL', 'Édition Mapoukam <noreply@site.exemple>');
  resetServerEnvCache();
  envoye.dernier = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

const MESSAGE: MessageMail = {
  destinataire: 'parent@exemple.test',
  sujet: 'Votre commande',
  texte: 'Merci pour votre achat.\n/fr/compte/bibliotheque',
  langue: 'fr',
  modele: 'confirmation_commande',
};

describe('ResendMailer', () => {
  it('envoie depuis l’adresse configurée', async () => {
    await new ResendMailer('re_test').envoyer(MESSAGE);
    expect(envoye.dernier?.['from']).toBe('Édition Mapoukam <noreply@site.exemple>');
  });

  it('REFUSE d’envoyer sans expéditeur, au lieu de partir d’une adresse de démonstration', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '');

    await expect(new ResendMailer('re_test').envoyer(MESSAGE)).rejects.toThrow(/RESEND_FROM_EMAIL/);
    expect(envoye.dernier).toBeNull();
  });

  it('bâtit les liens sur l’adresse du DÉPLOIEMENT, jamais sur une constante', async () => {
    await new ResendMailer('re_test').envoyer(MESSAGE);

    const html = String(envoye.dernier?.['html']);
    expect(html).toContain('href="https://site.exemple/fr/compte/bibliotheque"');
    expect(html).not.toContain('vercel.app');
  });
});
