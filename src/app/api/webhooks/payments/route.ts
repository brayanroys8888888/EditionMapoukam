import { getPaymentProvider } from '@/adapters/registry';
import { getClock } from '@/lib/clock';
import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import { SIGNATURE_HEADER } from '@/lib/crypto/webhook-signature';
import { echouerCommande, honorerCommande, rembourserCommande } from '@/lib/orders/fulfillment';
import { appliquerEvenement } from '@/lib/subscriptions/handlers';
import { viderFileEnArrierePlan } from '@/lib/emails/file';
import type { EvenementAbonnement } from '@/domain/subscriptions/state-machine';
import type { EvenementPaiement } from '@/adapters/payment/types';
import { logger } from '@/lib/logger';

/**
 * Gestionnaire de webhooks de paiement — §9.1, CLAUDE.md règle 5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE GESTIONNAIRE EST RÉEL, MÊME FACE AU FAUX PRESTATAIRE.                │
 * │                                                                          │
 * │ « Seul l'émetteur est simulé, le récepteur est réel. » La vérification   │
 * │ de signature, l'idempotence et l'octroi atomique sont donc développés et │
 * │ éprouvés pour de bon. Le jour où un prestataire réel se substitue, ce    │
 * │ fichier ne bouge pas — seul l'adaptateur change.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'ORDRE DES OPÉRATIONS EST LA SÉCURITÉ MÊME :
 *
 *   1. lire le corps BRUT — jamais `request.json()`, qui perdrait les octets
 *      exacts sur lesquels porte la signature ;
 *   2. vérifier la signature AVANT tout parsing ;
 *   3. journaliser l'événement, dont la contrainte d'unicité porte
 *      l'idempotence ;
 *   4. seulement alors, appliquer.
 *
 * Inverser 2 et 3 ferait traiter un corps non authentifié ; inverser 3 et 4
 * rendrait un rejeu indiscernable d'un premier passage.
 */

/**
 * Réponse volontairement muette.
 *
 * Un prestataire n'a besoin que du code HTTP. Détailler la cause d'un rejet
 * indiquerait à un attaquant ce qui manque à sa contrefaçon — s'il lui faut un
 * horodatage plus frais ou une autre clé.
 */
function reponse(statut: number): Response {
  return new Response(null, { status: statut });
}

export async function POST(request: Request): Promise<Response> {
  // 1. Le corps BRUT. Re-sérialiser un JSON change les octets et invalide la
  //    signature — c'est l'erreur classique de ce type de montage.
  const corpsBrut = await request.text();
  const entete = request.headers.get(SIGNATURE_HEADER);

  const provider = getPaymentProvider();
  const maintenant = getClock().now();

  // 2. La signature, avant tout parsing.
  const signature = provider.verifierSignatureWebhook(corpsBrut, entete, maintenant);

  const client = createServiceClient();

  if (!signature.valide) {
    // Journalisé PUIS rejeté : une signature invalide répétée est un signal de
    // sécurité, et l'effacer reviendrait à s'aveugler. L'identifiant est celui
    // du corps s'il est lisible, sinon un substitut — on ne fait aucune
    // confiance au contenu à ce stade.
    await journaliserRejet(client, corpsBrut, signature.raison);
    logger.warn('Webhook rejeté : signature invalide', { raison: signature.raison });
    return reponse(400);
  }

  // 3. L'événement est authentifié : on peut enfin le lire.
  let evenement: EvenementPaiement;
  try {
    evenement = provider.lireEvenement(corpsBrut);
  } catch (erreur) {
    logger.warn('Webhook authentifié mais illisible', { detail: erreur });
    return reponse(400);
  }

  const journal = await enregistrer(client, evenement, corpsBrut);

  // Déjà traité intégralement : un prestataire réel réémet tant qu'il n'a pas
  // reçu de 200. Ce n'est pas une erreur, c'est le fonctionnement normal.
  if (journal.dejaTraite) {
    logger.info('Webhook déjà traité, rejeu ignoré', { evenementId: evenement.id });
    return reponse(200);
  }

  // 4. Application.
  try {
    await appliquer(client, evenement, journal.id);
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);

    // `traite_le` reste NUL : la ligne de journal existe, mais l'événement
    // n'est pas marqué traité. Une réémission du prestataire le reprendra donc
    // au lieu de le considérer comme fait — c'est ce que permet la distinction
    // entre « reçu » et « traité ».
    await client
      .from('webhook_events')
      .update({ erreur: detail.slice(0, 2000) })
      .eq('id', journal.id);

    logger.error('Webhook authentifié mais non appliqué', {
      evenementId: evenement.id,
      type: evenement.type,
      detail,
    });

    // 500 : le prestataire doit réessayer. Un 200 lui ferait croire que
    // l'événement est traité, et le paiement resterait sans droits.
    return reponse(500);
  }

  await client
    .from('webhook_events')
    .update({ traite_le: maintenant.toISOString(), erreur: null })
    .eq('id', journal.id);

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ L'ENVOI DES EMAILS A LIEU ICI, ET SEULEMENT ICI.                       │
  // │                                                                        │
  // │ APRÈS le commit du fait métier, et APRÈS que l'événement a été marqué   │
  // │ traité. La demande d'email, elle, a été écrite DANS la transaction par  │
  // │ `programmer_email` : elle est donc atomique avec l'octroi des droits.   │
  // │                                                                        │
  // │ Ce vidage ne peut ni faire échouer ce webhook, ni le retarder :         │
  // │ `viderFileEnArrierePlan` n'est pas attendu et avale ses propres         │
  // │ erreurs. Un serveur de messagerie en panne laisse des lignes en         │
  // │ attente — la commande reste payée, les droits restent octroyés, et      │
  // │ l'email partira au prochain vidage.                                     │
  // │                                                                        │
  // │ L'inverse — attendre l'envoi avant de répondre — transformerait une     │
  // │ panne de messagerie en rejeu de webhook, donc en second traitement      │
  // │ d'un paiement déjà appliqué.                                            │
  // └────────────────────────────────────────────────────────────────────────┘
  viderFileEnArrierePlan({ client });

  return reponse(200);
}

/** Trace un corps dont la signature n'a pas été validée. */
async function journaliserRejet(
  client: AppSupabaseClient,
  corpsBrut: string,
  raison: string,
): Promise<void> {
  let eventId = `invalide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  let type = 'inconnu';

  try {
    const brut: unknown = JSON.parse(corpsBrut);
    if (typeof brut === 'object' && brut !== null) {
      const partiel = brut as { id?: unknown; type?: unknown };
      // Préfixé : un corps non authentifié ne doit jamais occuper l'identifiant
      // d'un événement légitime, sous peine de faire rejeter le vrai comme un
      // rejeu.
      if (typeof partiel.id === 'string') eventId = `invalide_${partiel.id}`;
      if (typeof partiel.type === 'string') type = partiel.type;
    }
  } catch {
    // Corps illisible : les valeurs de substitution suffisent.
  }

  await client.from('webhook_events').insert({
    event_id: eventId,
    type,
    payload: corpsBrut.slice(0, 10_000),
    signature_valide: false,
    erreur: raison,
  });
}

/**
 * Journalise un événement authentifié.
 *
 * La contrainte d'unicité sur `event_id` est la PREMIÈRE ligne de défense de
 * l'idempotence. La distinction entre « reçu » et « traité » est ce qui permet
 * de reprendre un événement dont l'application avait échoué : un événement reçu
 * mais non traité doit être rejoué, pas ignoré.
 */
async function enregistrer(
  client: AppSupabaseClient,
  evenement: EvenementPaiement,
  corpsBrut: string,
): Promise<{ id: string; dejaTraite: boolean }> {
  const insertion = await client
    .from('webhook_events')
    .insert({
      event_id: evenement.id,
      type: evenement.type,
      payload: JSON.parse(corpsBrut) as never,
      signature_valide: true,
    })
    .select('id')
    .single();

  if (!insertion.error && insertion.data) {
    return { id: insertion.data.id, dejaTraite: false };
  }

  // Collision sur `event_id` : l'événement est déjà passé. Reste à savoir s'il
  // avait été appliqué jusqu'au bout.
  const existant = await client
    .from('webhook_events')
    .select('id, traite_le')
    .eq('event_id', evenement.id)
    .single();

  if (existant.error || !existant.data) {
    throw new Error(`Journalisation impossible : ${insertion.error.message}`);
  }

  return { id: existant.data.id, dejaTraite: existant.data.traite_le !== null };
}

/**
 * Applique un événement.
 *
 * Les types d'abonnement sont reconnus mais laissés à l'étape 10 : les
 * accepter en silence maintenant reviendrait à répondre 200 sur des événements
 * qu'aucun code ne traite, et le prestataire cesserait de les réémettre.
 */
async function appliquer(
  client: AppSupabaseClient,
  evenement: EvenementPaiement,
  webhookEventId: string,
): Promise<void> {
  const { orderId, referencePaiement, motif } = evenement.donnees;

  switch (evenement.type) {
    case 'paiement.reussi': {
      if (!orderId) throw new Error('paiement.reussi sans identifiant de commande.');
      await honorerCommande(orderId, {
        referencePaiement: referencePaiement ?? null,
        webhookEventId,
        client,
      });
      return;
    }

    case 'paiement.echoue':
    case 'paiement.abandonne': {
      if (!orderId) throw new Error(`${evenement.type} sans identifiant de commande.`);
      await echouerCommande(orderId, { motif: motif ?? null, webhookEventId, client });
      return;
    }

    case 'remboursement.effectue': {
      if (!orderId) throw new Error('remboursement.effectue sans identifiant de commande.');
      await rembourserCommande(orderId, {
        // Absent = remboursement total. Un prestataire qui détaille ses lignes
        // permet de ne retirer que l'article remboursé : sur un panier de
        // quatre titres, en rembourser un ne doit pas faire perdre les trois
        // autres.
        bookIds: evenement.donnees.livres ?? null,
        webhookEventId,
        client,
      });
      return;
    }

    case 'abonnement.souscrit':
    case 'abonnement.renouvele':
    case 'abonnement.prelevement_echoue':
    case 'abonnement.annule':
    case 'abonnement.expire': {
      const { userId } = evenement.donnees;
      if (!userId) throw new Error(`${evenement.type} sans identifiant d'utilisateur.`);

      const resultat = await appliquerEvenement(
        {
          userId,
          // Le préfixe `abonnement.` est retiré : la machine à états raisonne
          // sur l'événement métier, pas sur le nom qu'un prestataire lui donne.
          evenement: evenement.type.slice('abonnement.'.length) as EvenementAbonnement,
          ...(evenement.donnees.offre ? { offre: evenement.donnees.offre } : {}),
          ...(evenement.donnees.montant
            ? {
                montant: evenement.donnees.montant.montant,
                devise: evenement.donnees.montant.devise,
              }
            : {}),
          ...(evenement.donnees.zone ? { zone: evenement.donnees.zone } : {}),
          ...(evenement.donnees.joursEssai !== undefined
            ? { joursEssai: evenement.donnees.joursEssai }
            : {}),
          webhookEventId,
        },
        { client },
      );

      // Une transition refusée n'est PAS une panne : c'est un événement que
      // l'état courant ne permet pas — un renouvellement après annulation, par
      // exemple. Rejeter par un 500 ferait réémettre indéfiniment un événement
      // qui ne deviendra jamais applicable.
      if (!resultat.ok) {
        logger.warn('Événement d’abonnement sans effet', {
          type: evenement.type,
          raison: resultat.raison,
        });
      }
      return;
    }

    default: {
      // Un type inconnu n'est pas une erreur d'application : un prestataire en
      // ajoute au fil du temps, et refuser ferait réessayer indéfiniment un
      // événement qui ne nous concerne pas.
      logger.info('Type de webhook ignoré', { type: evenement.type });
      return;
    }
  }
}
