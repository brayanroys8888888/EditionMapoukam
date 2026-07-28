import { getServerEnv } from '@/lib/config/env';
import { FakePaymentProvider } from './payment/fake/fake-payment-provider';
import type { PaymentProvider } from './payment/types';
import { FileMailer } from './mail/file-mailer';
import type { Mailer } from './mail/types';

/**
 * Sélection des adaptateurs.
 *
 * C'est le SEUL endroit du dépôt qui décide quel adaptateur est branché. Toute
 * la logique métier appelle `getPaymentProvider()` et `getMailer()` sans jamais
 * savoir ce qu'elle obtient — c'est à cette condition qu'un prestataire réel
 * pourra se substituer sans la toucher.
 *
 * Les valeurs `stripe` et `resend` sont acceptées par la configuration mais
 * refusées ici : elles existent pour que le jour du branchement, l'erreur
 * désigne l'adaptateur manquant plutôt qu'une variable inconnue.
 */
let paiement: PaymentProvider | null = null;
let mailer: Mailer | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (paiement) return paiement;

  const choix = getServerEnv().PAYMENT_PROVIDER;
  if (choix === 'fake') {
    paiement = new FakePaymentProvider();
    return paiement;
  }

  throw new Error(
    `PAYMENT_PROVIDER=${choix} : aucun adaptateur réel n'est implémenté à ce stade. Aucun SDK de prestataire n'est installé (CLAUDE.md).`,
  );
}

export function getMailer(): Mailer {
  if (mailer) return mailer;

  const choix = getServerEnv().MAILER;
  if (choix === 'file') {
    mailer = new FileMailer();
    return mailer;
  }

  throw new Error(
    `MAILER=${choix} : aucun adaptateur réel n'est implémenté à ce stade. Aucun SDK de prestataire n'est installé (CLAUDE.md).`,
  );
}

/** Réservé aux tests : oublie les adaptateurs mémorisés. */
export function resetAdapters(): void {
  paiement = null;
  mailer = null;
}
