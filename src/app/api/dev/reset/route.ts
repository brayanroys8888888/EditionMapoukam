import { rmSync } from 'node:fs';

import { garderConsole } from '@/lib/dev/guard';
import { errors, ok } from '@/lib/http/responses';
import { createServiceClient } from '@/lib/supabase/clients';
import { getMutableClock } from '@/lib/clock';
import { getMailer } from '@/adapters/registry';
import { FileMailer } from '@/adapters/mail/file-mailer';
import { logger } from '@/lib/logger';

/**
 * Remise à zéro de l'état de démonstration.
 *
 * SEULE ÉCRITURE EN BASE DE LA CONSOLE, et elle n'est pas une transition
 * métier : c'est l'équivalent de `npm run db:reset`, en plus rapide. Les
 * transitions — payer, souscrire, annuler — passent toutes par un événement
 * signé, sans exception.
 *
 * La fonction SQL appelée refuse de s'exécuter si l'artefact d'activation de
 * développement est absent, c'est-à-dire sur toute base où les seeds de
 * développement n'ont pas été joués.
 */
export async function POST(): Promise<Response> {
  const refus = garderConsole();
  if (refus) return refus;

  const { data, error } = await createServiceClient().rpc('dev_reset_demo_state');
  if (error) return errors.interne(error.message);

  // L'horloge et les emails écrits sur disque font partie de l'état à remettre
  // à zéro : les oublier laisserait la console dans un état incohérent avec la
  // base qu'elle vient de vider.
  getMutableClock()?.reset();

  const mailer = getMailer();
  if (mailer instanceof FileMailer) {
    rmSync(mailer.dossier, { recursive: true, force: true });
  }

  logger.info('État de démonstration remis à zéro', { rapport: data });

  return ok({ rapport: data });
}
