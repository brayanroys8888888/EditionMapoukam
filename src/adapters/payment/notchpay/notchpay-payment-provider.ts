import { createHmac, timingSafeEqual } from 'node:crypto';

import { logger } from '@/lib/logger';
import type {
  AbonnementPrestataire,
  ClientPaiement,
  DemandeAbonnement,
  DemandeCheckout,
  DemandeRemboursement,
  DonneesEvenement,
  EvenementPaiement,
  PaymentProvider,
  ResultatVerificationWebhook,
  SessionCheckout,
  TypeEvenementPaiement,
} from '../types';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ NOTCH PAY — LE PREMIER PRESTATAIRE RÉEL DU PROJET.                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Décision du propriétaire, 8 septembre 2026 : « les paiements sont gérés par
 * l'API Notch Pay […] on ne va utiliser que la version paiement de test ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE FICHIER EST LE SEUL DU DÉPÔT QUI CONNAISSE NOTCH PAY.                │
 * │                                                                          │
 * │ §7.3.4 et `CLAUDE.md` : « si un morceau de logique métier mentionne un   │
 * │ prestataire, c'est un défaut de conception ». Le nom, les URL, les       │
 * │ statuts et les noms d'événements de Notch Pay vivent ici, et la          │
 * │ traduction vers le vocabulaire du métier se fait dans `lireEvenement`.   │
 * │                                                                          │
 * │ Rien n'a bougé au-dessus : le gestionnaire de webhooks, l'octroi         │
 * │ atomique des droits, l'idempotence et la route de checkout sont ceux qui │
 * │ existaient déjà. C'est ce que l'interface `PaymentProvider` promettait,  │
 * │ et c'est vérifié maintenant plutôt qu'espéré.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUN SDK. `fetch`, ET RIEN D'AUTRE.                                    │
 * │                                                                          │
 * │ Trois appels HTTP suffisent — ouvrir, relire, rembourser. Un paquet de   │
 * │ plus, c'est une licence de plus à vérifier, une chaîne                   │
 * │ d'approvisionnement de plus à surveiller, et une version de plus à       │
 * │ suivre pour trois requêtes qu'on écrit en vingt lignes.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUE NOTCH PAY NE SAIT PAS FAIRE, ET QU'IL FAUT SAVOIR.               │
 * │                                                                          │
 * │ 1. **Pas d'abonnement récurrent.** Son API porte des paiements, des      │
 * │    virements, des clients et des remboursements — aucun prélèvement      │
 * │    programmé. `souscrireAbonnement` échoue donc franchement plutôt que   │
 * │    d'ouvrir un tunnel qui encaisserait une fois et ne renouvellerait     │
 * │    jamais : un abonné qui perd son accès au bout d'un mois sans que rien │
 * │    ne le prévienne est le pire des deux comportements.                   │
 * │                                                                          │
 * │ 2. **Pas de pays avant le paiement.** La zone d'encaissement (§3.3) se   │
 * │    déduit du pays du moyen de paiement, que Notch Pay ne révèle qu'APRÈS │
 * │    le règlement. `paysDuMoyenDePaiement` rend donc `null`, et            │
 * │    l'appelant retombe sur la zone internationale — la plus chère.        │
 * │    L'interface le prescrit : « une donnée manquante ne doit jamais       │
 * │    valoir remise ».                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const BASE_API = 'https://api.notchpay.co';

/** L'en-tête que Notch Pay pose sur ses webhooks. */
export const ENTETE_SIGNATURE_NOTCHPAY = 'x-notch-signature';

/** Le transport, injectable pour que les tests n'aient pas besoin du réseau. */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ADAPTATEUR NE LIT PAS L'ENVIRONNEMENT — ON LE LUI PASSE.              │
 * │                                                                          │
 * │ `src/adapters/registry.ts` est « le SEUL endroit du dépôt qui décide     │
 * │ quel adaptateur est branché », et c'est donc lui qui lit la              │
 * │ configuration. Deux bénéfices, et le second n'est pas cosmétique :       │
 * │                                                                          │
 * │  · un test construit l'adaptateur sans pile Supabase ni fichier          │
 * │    d'environnement — `getServerEnv()` valide TOUT, et échouerait sur des │
 * │    variables sans rapport avec le paiement ;                             │
 * │  · une clé ne peut pas être lue à deux endroits qui divergeraient.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface OptionsNotchPay {
  clePublique?: string;
  clePrivee?: string;
  cleHachage?: string;
  autoriserProduction?: boolean;
  transport?: Transport;
  /** Adresse de retour du navigateur, sans rapport avec l'octroi des droits. */
  urlApplication?: string;
}

/**
 * Une clé de TEST porte le mode `test` en deuxième segment.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NOTCH PAY SÉPARE AU POINT, PAS AU TIRET BAS.                            │
 * │                                                                          │
 * │ Ses clés réelles s'écrivent `pk_test.xxx`, `sk_test.xxx`, `hsk_test.xxx` │
 * │ — un point après le mode. Ce contrôle cherchait `test_` : de VRAIES clés │
 * │ de test étaient prises pour des clés de production, l'adaptateur         │
 * │ refusait de se construire, et TOUT ce qui touche une zone               │
 * │ d'encaissement rendait 500 — le tiroir de panier le premier. On          │
 * │ remplissait un panier qu'on ne pouvait plus lire.                        │
 * │                                                                          │
 * │ Les DEUX séparateurs sont acceptés, sans deviner le préfixe : Notch Pay  │
 * │ en emploie trois (`pk`, `sk`, `hsk`) et pourrait en ajouter un.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ET C'EST PLUS STRICT QU'AVANT, PAS MOINS.                               │
 * │                                                                          │
 * │ `includes('test_')` acceptait toute clé où ces six caractères            │
 * │ apparaissaient, n'importe où : `sk_live.mon_latest_secret` passait pour  │
 * │ une clé de test, et le garde-fou laissait encaisser pour de bon.         │
 * │                                                                          │
 * │ Exiger `_test` SUIVI d'un séparateur ancre le mode à sa place dans la    │
 * │ clé, au lieu de le chercher au hasard dedans.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le contrôle est fait sur la clé elle-même et non sur une variable
 * « mode=test » : une variable se met à `test` pendant qu'on colle des clés de
 * production juste au-dessus, et personne ne le voit.
 */
function estCleDeTest(cle: string): boolean {
  return /_test[._]/.test(cle);
}

/**
 * Les trois clés, ou une erreur qui les nomme TOUTES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLES SONT EXIGÉES ENSEMBLE, ET AU DÉMARRAGE.                           │
 * │                                                                          │
 * │ Sans la clé de hachage, tout marche — jusqu'au premier webhook, rejeté   │
 * │ « signature invalide » : la commande est payée chez le prestataire et    │
 * │ reste en attente chez nous. C'est la panne qu'on ne veut pas découvrir   │
 * │ en production, et elle ne coûte rien à empêcher ici.                     │
 * │                                                                          │
 * │ Les trois sont nommées d'un coup plutôt qu'une par une : trois           │
 * │ redémarrages pour apprendre trois oublis, c'est deux de trop.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function exigerLesTroisCles(brut: {
  publique: string | undefined;
  privee: string | undefined;
  hachage: string | undefined;
}): { publique: string; privee: string; hachage: string } {
  if (!brut.publique || !brut.privee || !brut.hachage) {
    const manquantes = [
      brut.publique ? null : 'NOTCHPAY_PUBLIC_KEY',
      brut.privee ? null : 'NOTCHPAY_PRIVATE_KEY',
      brut.hachage ? null : 'NOTCHPAY_HASH_KEY',
    ].filter((nom): nom is string => nom !== null);

    throw new Error(
      `PAYMENT_PROVIDER=notchpay, mais ${manquantes.join(', ')} manque(nt) dans .env.local.`,
    );
  }

  return { publique: brut.publique, privee: brut.privee, hachage: brut.hachage };
}

/** Les statuts que Notch Pay pose sur un paiement. */
type StatutNotchPay = 'pending' | 'processing' | 'complete' | 'failed' | 'canceled' | 'expired';

/**
 * La correspondance des événements — le cœur de la traduction.
 *
 * Elle est écrite comme une TABLE et non comme un `switch` pour que la liste
 * des types traités se lise d'un coup, et que celle des types ignorés soit ce
 * qui reste : tout le reste tombe sur `evenement.ignore`.
 */
const EVENEMENTS: Readonly<Record<string, TypeEvenementPaiement>> = {
  'payment.complete': 'paiement.reussi',
  'payment.failed': 'paiement.echoue',
  /*
   * L'annulation et l'expiration donnent le MÊME événement métier.
   *
   * `echouerCommande` traite les deux de la même façon — la commande n'est pas
   * payée, aucun droit n'est octroyé — et le prestataire ne distingue pas non
   * plus l'abandon du refus dans ses conséquences. Deux événements distincts
   * pour un même effet auraient donné deux chemins à éprouver au lieu d'un.
   */
  'payment.canceled': 'paiement.abandonne',
  'payment.expired': 'paiement.abandonne',
};

interface ReponseInitialisation {
  transaction?: string;
  authorization_url?: string;
  message?: string;
}

interface TransactionNotchPay {
  id?: string;
  reference?: string;
  merchant_reference?: string;
  status?: StatutNotchPay;
  amount?: number;
  currency?: string;
}

export class NotchPayPaymentProvider implements PaymentProvider {
  readonly nom = 'notchpay';

  /** Faux : c'est un vrai prestataire, et la console de simulation disparaît. */
  readonly simule = false;

  readonly enteteSignature = ENTETE_SIGNATURE_NOTCHPAY;

  readonly #clePublique: string;
  readonly #clePrivee: string;
  readonly #cleHachage: string;
  readonly #transport: Transport;
  readonly #urlApplication: string;

  constructor(options: OptionsNotchPay = {}) {
    const { publique, privee, hachage } = exigerLesTroisCles({
      publique: options.clePublique,
      privee: options.clePrivee,
      hachage: options.cleHachage,
    });

    const autoriserProduction = options.autoriserProduction ?? false;

    if (!autoriserProduction) {
      const production = [
        estCleDeTest(publique) ? null : 'NOTCHPAY_PUBLIC_KEY',
        estCleDeTest(privee) ? null : 'NOTCHPAY_PRIVATE_KEY',
        estCleDeTest(hachage) ? null : 'NOTCHPAY_HASH_KEY',
      ].filter((nom): nom is string => nom !== null);

      if (production.length > 0) {
        throw new Error(
          `Ces clés Notch Pay ne sont pas des clés de test : ${production.join(', ')}. ` +
            'Le projet est en mode test ; posez NOTCHPAY_AUTORISER_PRODUCTION=true pour ' +
            'encaisser réellement.',
        );
      }
    }

    this.#clePublique = publique;
    this.#clePrivee = privee;
    this.#cleHachage = hachage;
    this.#transport = options.transport ?? ((url, init) => fetch(url, init));
    this.#urlApplication = options.urlApplication ?? '';
  }

  // ---------------------------------------------------------------------
  // Contrat PaymentProvider
  // ---------------------------------------------------------------------

  /** Voir l'encadré en tête de fichier : Notch Pay ne le sait qu'après coup. */
  paysDuMoyenDePaiement(_client: ClientPaiement): Promise<string | null> {
    return Promise.resolve(null);
  }

  /**
   * Ouvre un paiement et rend la page hébergée où envoyer le client.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ `reference` PORTE L'IDENTIFIANT DE LA COMMANDE, ET C'EST TOUT LE     │
   * │ LIEN ENTRE LES DEUX MONDES.                                          │
   * │                                                                      │
   * │ Notch Pay le recopie tel quel dans ses webhooks. C'est par lui que le │
   * │ gestionnaire retrouve la commande à honorer — jamais par le montant,  │
   * │ jamais par l'email, qui ne désignent pas une commande de façon        │
   * │ unique.                                                              │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * `callback` ne ramène le NAVIGATEUR nulle part de décisif : le droit naît
   * du webhook signé (CLAUDE.md règle 5). L'écran de retour relit la commande
   * en base et affiche ce qu'elle dit — « en cours de confirmation » si le
   * webhook n'est pas encore arrivé.
   */
  async ouvrirCheckout(demande: DemandeCheckout): Promise<SessionCheckout> {
    const corps = {
      amount: demande.montant.montant,
      currency: demande.montant.devise,
      email: demande.client.email,
      reference: demande.orderId,
      description: `Commande ${demande.orderId}`,
      callback: demande.urlRetourSucces,
      /*
       * La devise est VERROUILLÉE sur celle de la commande : sans cela, le
       * client pourrait en changer sur la page hébergée, et payer 4,99 dans
       * une monnaie qui n'est pas celle qui l'engage.
       */
      locked_currency: demande.montant.devise,
    };

    const reponse = await this.#appeler('POST', '/payments', corps);
    const donnees = (await reponse.json()) as ReponseInitialisation;

    if (!reponse.ok || !donnees.authorization_url || !donnees.transaction) {
      throw new Error(
        `Notch Pay a refusé l'ouverture du paiement (${String(reponse.status)}) : ${
          donnees.message ?? 'réponse incomplète'
        }`,
      );
    }

    logger.info('Tunnel Notch Pay ouvert', {
      orderId: demande.orderId,
      transaction: donnees.transaction,
    });

    return {
      id: donnees.transaction,
      url: donnees.authorization_url,
      /*
       * Notch Pay ne rend pas d'échéance. Trente minutes est la valeur que
       * l'application emploie déjà pour ses sessions : elle n'ouvre ni ne
       * ferme aucun droit — c'est une information d'affichage.
       */
      expireLe: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  /**
   * NON DISPONIBLE — et ça échoue franchement.
   *
   * Voir l'encadré en tête de fichier : l'API de Notch Pay ne porte aucun
   * prélèvement programmé. Ouvrir un tunnel qui encaisse une fois donnerait un
   * abonnement qui ne se renouvelle pas et dont personne n'aurait décidé —
   * c'est-à-dire une règle métier inventée ici, ce que `CLAUDE.md` interdit.
   */
  souscrireAbonnement(demande: DemandeAbonnement): Promise<AbonnementPrestataire> {
    return Promise.reject(
      new Error(
        `Notch Pay n'expose pas de prélèvement récurrent : l'abonnement ${demande.codeOffre} ` +
          'ne peut pas être souscrit par cet adaptateur. Voir docs/NOTCHPAY.md.',
      ),
    );
  }

  annulerAbonnement(idPrestataire: string): Promise<void> {
    return Promise.reject(
      new Error(
        `Notch Pay n'expose pas de prélèvement récurrent : rien à annuler pour ${idPrestataire}.`,
      ),
    );
  }

  /**
   * Rembourse, totalement ou partiellement.
   *
   * C'est la seule opération qui exige la clé PRIVÉE : `X-Grant`. Le
   * remboursement lui-même reste décidé en base par `refund_order` — cette
   * méthode ne fait que demander l'argent au prestataire.
   */
  async rembourser(demande: DemandeRemboursement): Promise<void> {
    const reponse = await this.#appeler(
      'POST',
      '/refunds',
      {
        payment: demande.referencePaiement,
        ...(demande.montant ? { amount: demande.montant.montant } : {}),
        reason: 'Remboursement demandé par le marchand',
      },
      { grant: true },
    );

    if (!reponse.ok) {
      const detail = await reponse.text();
      throw new Error(
        `Notch Pay a refusé le remboursement (${String(reponse.status)}) : ${detail.slice(0, 300)}`,
      );
    }

    logger.info('Remboursement demandé à Notch Pay', {
      reference: demande.referencePaiement,
    });
  }

  /**
   * Vérifie la signature d'un webhook.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA CLÉ DE HACHAGE, ET NI LA PUBLIQUE NI LA PRIVÉE.                   │
   * │                                                                      │
   * │ La documentation de Notch Pay y insiste, et c'est le contresens le    │
   * │ plus courant : signer avec `sk_` produit une signature qui ne         │
   * │ correspondra jamais, et le symptôme — « tous mes webhooks sont        │
   * │ rejetés » — ne désigne pas la cause.                                  │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ PAS D'HORODATAGE, DONC PAS DE FENÊTRE — ET CE N'EST PAS UN TROU.     │
   * │                                                                      │
   * │ Notch Pay ne signe pas d'instant, on ne peut donc pas rejeter un      │
   * │ événement trop ancien comme le fait le faux prestataire. Le rejeu est │
   * │ arrêté un cran plus loin, et de façon plus sûre : `webhook_events`    │
   * │ porte un index unique sur l'identifiant d'événement, et un second     │
   * │ passage est acquitté sans être appliqué.                             │
   * │                                                                      │
   * │ `instant` est donc inutilisé ici, et c'est une propriété de ce        │
   * │ prestataire — pas un oubli.                                          │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  verifierSignatureWebhook(
    corpsBrut: string,
    entete: string | null,
    _instant: Date,
  ): ResultatVerificationWebhook {
    if (!entete) return { valide: false, raison: 'signature_absente' };

    const attendue = createHmac('sha256', this.#cleHachage).update(corpsBrut).digest('hex');

    const recue = Buffer.from(entete.trim(), 'utf8');
    const calculee = Buffer.from(attendue, 'utf8');

    /*
     * `timingSafeEqual` LÈVE quand les longueurs diffèrent : la comparer avant
     * n'est pas une optimisation, c'est ce qui évite qu'une signature tronquée
     * produise une exception au lieu d'un refus. Une longueur ne révèle rien —
     * celle d'un condensé SHA-256 est publique.
     */
    if (recue.length !== calculee.length) return { valide: false, raison: 'signature_invalide' };
    if (!timingSafeEqual(recue, calculee)) return { valide: false, raison: 'signature_invalide' };

    return { valide: true };
  }

  /**
   * Traduit un webhook Notch Pay en événement du métier.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ L'IDENTIFIANT D'ÉVÉNEMENT PORTE LE TYPE, ET IL LE FAUT.              │
   * │                                                                      │
   * │ Notch Pay ne numérote pas ses événements : il envoie un type et une   │
   * │ transaction. Prendre l'identifiant de la transaction seule ferait     │
   * │ passer `payment.complete` pour un REJEU de `payment.created` — même   │
   * │ clé — et le paiement ne serait jamais honoré.                        │
   * │                                                                      │
   * │ `<type>:<id de transaction>` est stable d'une réémission à l'autre —  │
   * │ ce que l'idempotence demande — et distinct d'un type à l'autre.       │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  lireEvenement(corpsBrut: string): EvenementPaiement {
    const brut: unknown = JSON.parse(corpsBrut);
    if (typeof brut !== 'object' || brut === null) {
      throw new TypeError('Charge de webhook Notch Pay illisible.');
    }

    const charge = brut as { type?: unknown; data?: unknown };
    if (typeof charge.type !== 'string') {
      throw new TypeError('Charge de webhook Notch Pay sans type.');
    }

    const transaction: TransactionNotchPay =
      typeof charge.data === 'object' && charge.data !== null ? charge.data : {};

    const type = EVENEMENTS[charge.type] ?? 'evenement.ignore';

    /*
     * `reference` est CELLE QU'ON A POSÉE — l'identifiant de la commande.
     * `merchant_reference` est le nom qu'emploient certaines réponses pour la
     * même chose ; on lit les deux plutôt que de dépendre d'un seul, et on ne
     * retombe JAMAIS sur `id`, qui est la référence du prestataire et ne
     * désigne aucune commande chez nous.
     */
    const orderId = transaction.reference ?? transaction.merchant_reference;

    const donnees: DonneesEvenement = {
      ...(orderId ? { orderId } : {}),
      ...(transaction.id ? { referencePaiement: transaction.id } : {}),
      ...(typeof transaction.amount === 'number' && transaction.currency
        ? { montant: { montant: transaction.amount, devise: transaction.currency } }
        : {}),
      ...(type === 'paiement.echoue' || type === 'paiement.abandonne'
        ? { motif: charge.type }
        : {}),
    };

    return {
      id: `${charge.type}:${transaction.id ?? orderId ?? 'sans-reference'}`,
      type,
      /*
       * L'instant du webhook, et non celui du paiement : Notch Pay n'horodate
       * pas ses envois, et `completed_at` n'existe pas sur tous les types.
       * Cette date ne sert qu'à la traçabilité ; aucun droit n'en dépend, et
       * les échéances métier se calculent contre `app_now()` en base.
       */
      survenuLe: new Date().toISOString(),
      donnees,
    };
  }

  // ---------------------------------------------------------------------
  // Propre à Notch Pay
  // ---------------------------------------------------------------------

  /**
   * Relit un paiement chez le prestataire.
   *
   * La documentation le recommande avant toute livraison. Ici, ce n'est PAS le
   * chemin d'octroi — c'est le webhook signé qui l'ouvre, et lui seul — mais
   * c'est le moyen de rattraper un webhook perdu, et de diagnostiquer une
   * commande restée en attente.
   */
  async relirePaiement(reference: string): Promise<TransactionNotchPay | null> {
    const reponse = await this.#appeler('GET', `/payments/${encodeURIComponent(reference)}`);
    if (!reponse.ok) return null;

    const donnees = (await reponse.json()) as { transaction?: TransactionNotchPay };
    return donnees.transaction ?? null;
  }

  /**
   * L'appel HTTP, et le seul.
   *
   * `Authorization` porte la clé PUBLIQUE — c'est la convention de Notch Pay,
   * déroutante mais documentée. `X-Grant` porte la privée, et n'accompagne que
   * les opérations qui la réclament : l'envoyer partout élargirait sans raison
   * la surface d'une clé qui rembourse.
   */
  async #appeler(
    methode: 'GET' | 'POST',
    chemin: string,
    corps?: unknown,
    options: { grant?: boolean } = {},
  ): Promise<Response> {
    const entetes: Record<string, string> = {
      Authorization: this.#clePublique,
      Accept: 'application/json',
    };

    if (options.grant) entetes['X-Grant'] = this.#clePrivee;
    if (corps !== undefined) entetes['Content-Type'] = 'application/json';

    return this.#transport(`${BASE_API}${chemin}`, {
      method: methode,
      headers: entetes,
      ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    });
  }

  /** L'adresse de l'application, pour les retours de navigateur. */
  get urlApplication(): string {
    return this.#urlApplication;
  }
}
