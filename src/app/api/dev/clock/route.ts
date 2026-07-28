import { z } from 'zod';

import { garderConsole } from '@/lib/dev/guard';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { getClock, getMutableClock } from '@/lib/clock';
import { logger } from '@/lib/logger';

/**
 * Avance du temps — §CLAUDE.md, console de simulation.
 *
 * Permet d'éprouver les fins de période d'abonnement et la fenêtre de 3 mois
 * des nouveautés sans attendre. Le décalage est persisté sur disque et
 * transmis à PostgreSQL par le module `dev-clock-session` : la base et
 * l'application voient donc le même instant.
 */
const avanceSchema = z.object({
  jours: z.number().int().min(-3650).max(3650),
});

export function GET(): Response {
  const refus = garderConsole();
  if (refus) return refus;

  const horloge = getMutableClock();
  return ok({
    maintenant: getClock().now().toISOString(),
    decalageMs: horloge?.offsetMs() ?? 0,
    reelle: new Date().toISOString(),
  });
}

export async function POST(request: Request): Promise<Response> {
  const refus = garderConsole();
  if (refus) return refus;

  const corps = await parseJsonBody(request, avanceSchema);
  if (!corps.ok) return corps.response;

  const horloge = getMutableClock();
  if (!horloge) {
    return errors.interne('Aucune horloge déplaçable disponible.');
  }

  horloge.advanceDays(corps.data.jours);
  logger.info('Horloge avancée', { jours: corps.data.jours });

  return ok({
    maintenant: horloge.now().toISOString(),
    decalageMs: horloge.offsetMs(),
  });
}

export function DELETE(): Response {
  const refus = garderConsole();
  if (refus) return refus;

  const horloge = getMutableClock();
  if (!horloge) {
    return errors.interne('Aucune horloge déplaçable disponible.');
  }

  horloge.reset();
  return ok({ maintenant: horloge.now().toISOString(), decalageMs: 0 });
}
