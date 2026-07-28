import { notFound } from 'next/navigation';

import { consoleDisponible } from '@/lib/dev/guard';
import { ConsoleSimulation } from './console';

/**
 * Console de simulation.
 *
 * Rudimentaire par choix : `CLAUDE.md` l'autorise expressément, et le périmètre
 * du chantier est backend. Elle n'a qu'un rôle — déclencher à la main tout ce
 * qui viendrait normalement d'un service externe.
 *
 * `notFound()` et non un message d'erreur : en production, ces pages ne doivent
 * pas seulement être interdites, elles ne doivent pas exister. Un refus explicite
 * confirmerait à un visiteur qu'une console de simulation est déployée.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Console de simulation',
};

export default function PageDev() {
  if (!consoleDisponible()) {
    notFound();
  }

  return <ConsoleSimulation />;
}
