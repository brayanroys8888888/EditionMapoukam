import { randomUUID } from 'node:crypto';

import type { Clock } from '@/lib/clock/clock';
import { getClock } from '@/lib/clock';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { SIGNATURE_HEADER, signerCharge, verifierSignature } from '@/lib/crypto/webhook-signature';
import type {
  AbonnementPrestataire,
  ClientPaiement,
  DemandeAbonnement,
  DemandeCheckout,
  DemandeRemboursement,
  EvenementPaiement,
  PaymentProvider,
  ResultatVerificationWebhook,
  SessionCheckout,
  TypeEvenementPaiement,
  DonneesEvenement,
} from '../types';

/**
 * Faux prestataire de paiement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEUL L'ÉMETTEUR EST SIMULÉ, LE RÉCEPTEUR EST RÉEL.                       │
 * │ Ce module n'accorde aucun droit et n'écrit rien en base. Il émet de VRAIS │
 * │ événements HTTP signés vers le vrai gestionnaire de webhooks. La          │
 * │ vérification de signature, l'idempotence et l'octroi atomique sont donc   │
 * │ développés et éprouvés pour de bon, jamais contournés.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le transport est injectable pour que les tests capturent la requête émise
 * sans dépendre d'un serveur en marche. En fonctionnement, c'est `fetch`.
 */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

export interface OptionsFakeProvider {
  clock?: Clock;
  transport?: Transport;
  /** URL du gestionnaire de webhooks. Par défaut, celle de l'application. */
  urlWebhook?: string;
  secret?: string;
}

export interface EmissionResultat {
  evenement: EvenementPaiement;
  statut: number;
  corpsReponse: string;
}

export class FakePaymentProvider implements PaymentProvider {
  readonly nom = 'fake';

  readonly #clock: Clock;
  readonly #transport: Transport;
  readonly #urlWebhook: string;
  readonly #secret: string;

  constructor(options: OptionsFakeProvider = {}) {
    const env = getServerEnv();
    this.#clock = options.clock ?? getClock();
    this.#transport = options.transport ?? ((url, init) => fetch(url, init));
    this.#urlWebhook =
      options.urlWebhook ?? `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/payments`;
    this.#secret = options.secret ?? env.FAKE_WEBHOOK_SECRET;
  }

  // ---------------------------------------------------------------------
  // Contrat PaymentProvider
  // ---------------------------------------------------------------------

  /**
   * Pays du moyen de paiement simulé.
   *
   * Chez un prestataire réel, cette information vient de la carte ou du compte
   * Mobile Money. Ici, c'est l'opérateur de la console qui la fixe — c'est
   * exactement le rôle que joue le faux prestataire : simuler ce que seul un
   * tiers peut savoir.
   *
   * La valeur vit dans une variable de classe, jamais dans une requête HTTP :
   * un client qui pourrait l'imposer choisirait son propre tarif.
   */
  paysDuMoyenDePaiement(_client: ClientPaiement): Promise<string | null> {
    return Promise.resolve(FakePaymentProvider.#paysSimule);
  }

  static #paysSimule: string | null = 'FR';

  /** Réservé à la console de simulation et aux tests. */
  static simulerPays(codePays: string | null): void {
    FakePaymentProvider.#paysSimule = codePays;
  }

  /** Pays actuellement simulé, pour l'affichage de la console. */
  static paysSimule(): string | null {
    return FakePaymentProvider.#paysSimule;
  }

  ouvrirCheckout(demande: DemandeCheckout): Promise<SessionCheckout> {
    const id = `chk_${randomUUID()}`;
    // Pas de redirection réelle : l'URL pointe vers la console de simulation,
    // où l'opérateur décide de l'issue du paiement.
    const url = `/dev?session=${id}&commande=${demande.orderId}`;
    return Promise.resolve({
      id,
      url,
      expireLe: new Date(this.#clock.now().getTime() + 30 * 60 * 1000),
    });
  }

  souscrireAbonnement(demande: DemandeAbonnement): Promise<AbonnementPrestataire> {
    const id = `sub_${randomUUID()}`;
    return Promise.resolve({
      id,
      url: `/dev?abonnement=${id}&souscription=${demande.subscriptionId}`,
      expireLe: new Date(this.#clock.now().getTime() + 30 * 60 * 1000),
    });
  }

  annulerAbonnement(idPrestataire: string): Promise<void> {
    // Chez un prestataire réel, l'annulation déclenche un événement asynchrone.
    // Ici, c'est la console qui l'émet : ce faux prestataire ne décide de rien
    // tout seul, sans quoi il porterait de la logique métier.
    logger.info('Annulation demandée au faux prestataire', { idPrestataire });
    return Promise.resolve();
  }

  rembourser(demande: DemandeRemboursement): Promise<void> {
    logger.info('Remboursement demandé au faux prestataire', {
      reference: demande.referencePaiement,
    });
    return Promise.resolve();
  }

  verifierSignatureWebhook(
    corpsBrut: string,
    entete: string | null,
    instant: Date,
  ): ResultatVerificationWebhook {
    const resultat = verifierSignature(corpsBrut, entete, this.#secret, instant);
    return resultat.valide ? { valide: true } : { valide: false, raison: resultat.raison };
  }

  lireEvenement(corpsBrut: string): EvenementPaiement {
    const brut: unknown = JSON.parse(corpsBrut);
    if (typeof brut !== 'object' || brut === null) {
      throw new TypeError('Charge de webhook illisible.');
    }
    const evenement = brut as Partial<EvenementPaiement>;
    if (!evenement.id || !evenement.type || !evenement.survenuLe) {
      throw new TypeError('Charge de webhook incomplète : id, type et survenuLe sont requis.');
    }
    return {
      id: evenement.id,
      type: evenement.type,
      survenuLe: evenement.survenuLe,
      donnees: evenement.donnees ?? {},
    };
  }

  // ---------------------------------------------------------------------
  // Émission — propre au faux prestataire, absente du contrat
  // ---------------------------------------------------------------------

  /** Construit un événement normalisé, sans l'émettre. */
  fabriquerEvenement(
    type: TypeEvenementPaiement,
    donnees: DonneesEvenement,
    options: { id?: string } = {},
  ): EvenementPaiement {
    return {
      id: options.id ?? `evt_${randomUUID()}`,
      type,
      survenuLe: this.#clock.now().toISOString(),
      donnees,
    };
  }

  /**
   * Émet un vrai événement HTTP signé vers le vrai gestionnaire de webhooks.
   *
   * Le corps est sérialisé UNE fois : c'est cette chaîne exacte qui est signée
   * puis transmise. Re-sérialiser après signature changerait les octets et
   * invaliderait la signature — c'est l'erreur classique de ce type de montage.
   */
  async emettre(evenement: EvenementPaiement): Promise<EmissionResultat> {
    const corpsBrut = JSON.stringify(evenement);
    const signature = signerCharge(corpsBrut, this.#secret, this.#clock.now());

    const reponse = await this.#transport(this.#urlWebhook, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [SIGNATURE_HEADER]: signature,
      },
      body: corpsBrut,
    });

    const corpsReponse = await reponse.text();
    logger.info('Événement de paiement émis', {
      type: evenement.type,
      evenementId: evenement.id,
      statut: reponse.status,
    });

    return { evenement, statut: reponse.status, corpsReponse };
  }

  /** Raccourci : fabrique puis émet. */
  async declencher(
    type: TypeEvenementPaiement,
    donnees: DonneesEvenement,
    options: { id?: string } = {},
  ): Promise<EmissionResultat> {
    return this.emettre(this.fabriquerEvenement(type, donnees, options));
  }
}
