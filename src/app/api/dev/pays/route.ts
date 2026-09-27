import { z } from 'zod';

import { garderConsole } from '@/lib/dev/guard';
import { errors, ok } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { getPaymentProvider } from '@/adapters/registry';
import { FakePaymentProvider } from '@/adapters/payment/fake/fake-payment-provider';
import { normaliserPays, zonePourPays } from '@/domain/orders/zones';
import { logger } from '@/lib/logger';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE PAYS DU MOYEN DE PAIEMENT, PILOTÉ À LA MAIN.                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE CETTE ROUTE REND ÉPROUVABLE, ET QUI NE L'ÉTAIT PAS.              │
 * │                                                                          │
 * │ §3.3 : la zone tarifaire vient du PAYS DU MOYEN DE PAIEMENT. Chez un     │
 * │ prestataire qui le connaît — le faux, ici — la déclaration du client est │
 * │ ignorée et c'est `paysDuMoyenDePaiement` qui tranche. Ce pays était      │
 * │ figé à « FR » dans le faux prestataire, et ne pouvait être déplacé que   │
 * │ depuis un test, EN PROCESSUS.                                            │
 * │                                                                          │
 * │ Conséquence : la grille afrique — celle qui sert la moitié du public du  │
 * │ site, §CLAUDE.md — était invisible à qui ouvrait la boutique à la main.  │
 * │ Toute commande passée sur la pile locale sortait en euros, et la règle   │
 * │ qui interdit d'additionner un euro et un franc CFA ne pouvait se         │
 * │ constater sur aucun écran.                                               │
 * │                                                                          │
 * │ C'est exactement ce que la console est faite pour lever : « déclencher   │
 * │ à la main tout ce qui viendrait normalement d'un service externe ». Le   │
 * │ pays du moyen de paiement en vient.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE N'ÉCRIT RIEN, ET NE CHANGE AUCUNE COMMANDE PASSÉE.                 │
 * │                                                                          │
 * │ Le pays simulé est lu à la CRÉATION d'une commande, pour en figer la     │
 * │ zone et le montant. Le déplacer ensuite ne retarife rien : une commande  │
 * │ engage au prix auquel elle a été passée, et c'est aussi vrai d'une       │
 * │ commande de démonstration.                                               │
 * │                                                                          │
 * │ La route refuse donc net devant un prestataire réel, plutôt que de ne    │
 * │ rien faire en répondant « d'accord » : Notch Pay tient son propre pays,  │
 * │ et laisser croire qu'on l'a déplacé serait pire que le refus.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const paysSchema = z.object({
  /**
   * Un code ISO 3166-1 alpha-2, ou `null` pour un prestataire qui ne sait pas.
   *
   * `null` n'est pas l'absence de réponse : c'est la réponse « je l'ignore »,
   * et elle a un effet défini — `zonePourPays` retombe sur `international`,
   * la grille la plus chère. Le cas mérite d'être jouable.
   */
  pays: z
    .string()
    .trim()
    .length(2)
    .nullable(),
});

/** L'état courant, pour que la console puisse l'afficher. */
export function GET(): Response {
  const refus = garderConsole();
  if (refus) return refus;

  if (!(getPaymentProvider() instanceof FakePaymentProvider)) {
    return errors.interne('Le prestataire branché tient son propre pays.');
  }

  const pays = FakePaymentProvider.paysSimule();
  return ok({ pays, zone: zonePourPays(pays) });
}

export async function POST(request: Request): Promise<Response> {
  const refus = garderConsole();
  if (refus) return refus;

  if (!(getPaymentProvider() instanceof FakePaymentProvider)) {
    return errors.interne('Le prestataire branché tient son propre pays.');
  }

  const corps = await parseJsonBody(request, paysSchema);
  if (!corps.ok) return corps.response;

  /*
   * `normaliserPays` plutôt qu'une mise en capitales : c'est la MÊME fonction
   * que le domaine emploie pour décider de la zone. Deux normalisations —
   * l'une ici, l'autre là-bas — finiraient par diverger sur un cas limite,
   * et la console annoncerait alors une zone que la commande n'aurait pas.
   */
  const pays = normaliserPays(corps.data.pays);
  FakePaymentProvider.simulerPays(pays);

  const zone = zonePourPays(pays);
  logger.info('Pays du moyen de paiement simulé', { pays, zone });

  return ok({ pays, zone });
}
