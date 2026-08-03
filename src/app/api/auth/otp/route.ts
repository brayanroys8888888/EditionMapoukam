import { createAnonClient } from '@/lib/supabase/clients';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import {
  CODE_EMAIL_RATE_LIMIT,
  CODE_RATE_LIMIT,
  adresseAppelant,
  codeEmailRateLimiter,
  codeRateLimiter,
} from '@/lib/http/rate-limit';
import { echangeCodeSchema } from '@/lib/auth/schemas';
import { etablirSession } from '@/lib/auth/etablir-session';
import { logger } from '@/lib/logger';

/**
 * Échange d'un code à usage unique contre une session — §4.2 F5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN CODE SAISI, ET NON LE LIEN DE SUPABASE.                     │
 * │                                                                          │
 * │ Les liens de Supabase déposent les jetons dans le FRAGMENT de l'URL, et  │
 * │ un fragment n'est jamais transmis au serveur. Les exploiter imposerait   │
 * │ donc du JavaScript de page pour les lire et les renvoyer — c'est-à-dire  │
 * │ JavaScript sur le chemin critique de la réinitialisation d'un mot de     │
 * │ passe, pour un public que §5.1 décrit en partie sur connexion lente.     │
 * │                                                                          │
 * │ Le code saisi tient dans un formulaire rendu côté serveur. Rien à lire   │
 * │ dans l'URL, rien à exécuter dans le navigateur, et aucun jeton dans      │
 * │ l'historique. Arbitrage Q3 de docs/API-CONTRAT.md, tranché le            │
 * │ 3 août 2026.                                                            │
 * │                                                                          │
 * │ Ce que ce choix suppose du fournisseur a été ÉTABLI contre la pile       │
 * │ locale, pas déduit de la documentation (`scripts/sonde-otp.mjs`) : le    │
 * │ code existe pour les deux usages, il fait six chiffres, il ne sert       │
 * │ qu'une fois, et un code faux n'ouvre rien.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function POST(request: Request): Promise<Response> {
  const corps = await parseJsonBody(request, echangeCodeSchema);
  if (!corps.ok) return corps.response;

  const { email, code, type } = corps.data;

  const cleCouple = `${adresseAppelant(request)}|${email}`;
  const couple = codeRateLimiter.consommer(cleCouple, CODE_RATE_LIMIT);
  if (!couple.autorise) {
    logger.warn('Tentatives de code trop nombreuses', { email });
    return errors.tropDeRequetes(couple.retryAfter);
  }

  const parEmail = codeEmailRateLimiter.consommer(email, CODE_EMAIL_RATE_LIMIT);
  if (!parEmail.autorise) {
    logger.warn('Tentatives de code trop nombreuses sur une adresse', { email });
    return errors.tropDeRequetes(parEmail.retryAfter);
  }

  const { data, error } = await createAnonClient().auth.verifyOtp({
    email,
    token: code,
    type,
  });

  if (error || !data.session || !data.user) {
    // Une seule réponse pour tous les refus — voir `errors.codeInvalide`.
    // Le détail reste au journal, où il est exploitable sans être divulgué.
    logger.warn('Échange de code refusé', { type, detail: error?.message });
    return errors.codeInvalide();
  }

  const etabli = await etablirSession(data.session, data.user.id, {
    refusGenerique: errors.codeInvalide,
  });
  if (!etabli.ok) return etabli.response;

  // Les deux compteurs sont remis à zéro : le code a servi, il ne peut plus
  // servir, et laisser le plafond en place punirait l'utilisateur légitime qui
  // enchaîne aussitôt sur le changement de son mot de passe.
  codeRateLimiter.reinitialiser(cleCouple);
  codeEmailRateLimiter.reinitialiser(email);

  logger.info('Code à usage unique échangé', { userId: data.user.id, type });

  return ok(etabli.charge, { cookies: etabli.cookies });
}
