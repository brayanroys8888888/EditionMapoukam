import { getServerEnv } from '@/lib/config/env';
import { FakePaymentProvider } from './payment/fake/fake-payment-provider';
import { NotchPayPaymentProvider } from './payment/notchpay/notchpay-payment-provider';
import type { PaymentProvider } from './payment/types';
import { FileMailer } from './mail/file-mailer';
import { ResendMailer } from './mail/resend-mailer';
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

  /*
   * Notch Pay — décision du propriétaire du 8 septembre 2026, en mode TEST.
   *
   * L'adaptateur exige ses trois clés et refuse les clés de production tant
   * que `NOTCHPAY_AUTORISER_PRODUCTION` n'est pas posé : ce refus vit dans son
   * constructeur, donc ici, au démarrage, et non au premier paiement.
   */
  if (choix === 'notchpay') {
    const env = getServerEnv();
    paiement = new NotchPayPaymentProvider({
      /*
       * Les clés sont lues ICI et passées à l'adaptateur, qui n'ouvre jamais
       * l'environnement lui-même. C'est ce qui permet de le construire dans un
       * test sans pile Supabase — `getServerEnv()` valide TOUT — et ce qui
       * garantit qu'une clé n'est lue qu'à un seul endroit.
       *
       * `?? undefined` : le schéma les rend facultatives (l'application doit
       * démarrer sans compte chez qui que ce soit), et c'est l'adaptateur qui
       * exige les siennes, avec un message qui les nomme toutes.
       */
      ...(env.NOTCHPAY_PUBLIC_KEY ? { clePublique: env.NOTCHPAY_PUBLIC_KEY } : {}),
      ...(env.NOTCHPAY_PRIVATE_KEY ? { clePrivee: env.NOTCHPAY_PRIVATE_KEY } : {}),
      ...(env.NOTCHPAY_HASH_KEY ? { cleHachage: env.NOTCHPAY_HASH_KEY } : {}),
      autoriserProduction: env.NOTCHPAY_AUTORISER_PRODUCTION,
      urlApplication: env.NEXT_PUBLIC_APP_URL,
    });
    return paiement;
  }

  throw new Error(
    `PAYMENT_PROVIDER=${choix} : aucun adaptateur n'est implémenté pour ce prestataire. Les valeurs servies sont \`fake\` et \`notchpay\`.`,
  );
}

export function getMailer(): Mailer {
  if (mailer) return mailer;

  const choix = getServerEnv().MAILER;
  if (choix === 'resend' || (Boolean(process.env.RESEND_API_KEY) && process.env.MAILER !== 'file')) {
    mailer = new ResendMailer();
    return mailer;
  }

  if (choix === 'file') {
    mailer = new FileMailer();
    return mailer;
  }


  throw new Error(
    `MAILER=${String(choix)} : aucun adaptateur réel n'est implémenté à ce stade.`,
  );

}

/** Réservé aux tests : oublie les adaptateurs mémorisés. */
export function resetAdapters(): void {
  paiement = null;
  mailer = null;
}
