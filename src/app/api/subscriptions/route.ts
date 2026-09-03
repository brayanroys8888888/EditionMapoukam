import { z } from 'zod';

import { requireUser } from '@/lib/auth/session';
import { ok, fail } from '@/lib/http/responses';
import { parseJsonBody } from '@/lib/http/validate';
import { createServiceClient } from '@/lib/supabase/clients';
import { getPaymentProvider } from '@/adapters/registry';
import { abonnementCourant, type AbonnementCourant } from '@/lib/subscriptions/handlers';
import { lireOffreParCode } from '@/lib/offers/service';
import type { DomaineAbonnement } from '@/domain/subscriptions/domaines';
import { preparerSouscription } from '@/lib/subscriptions/souscription';
import { getClock } from '@/lib/clock';
import { logger } from '@/lib/logger';

/**
 * Abonnements — §9.1.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE DE CES ROUTES NE CHANGE LE STATUT D'UN ABONNEMENT.               │
 * │                                                                          │
 * │ §9.1 : « La notification par webhook est la seule source de vérité du    │
 * │ statut de paiement. Ne jamais activer un abonnement sur la seule base    │
 * │ d'une redirection navigateur, qui peut être falsifiée. »                │
 * │                                                                          │
 * │ Souscrire ouvre une session chez le prestataire. Annuler la DEMANDE au   │
 * │ prestataire. Dans les deux cas, c'est l'événement signé qui suit qui     │
 * │ fait évoluer l'état — et lui seul.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE ZONE N'EST ACCEPTÉE EN ENTRÉE — même règle que pour les commandes.│
 * │                                                                          │
 * │ §3.3 : la zone vient du pays du moyen de paiement. Elle est demandée au   │
 * │ prestataire, puis FIGÉE sur l'abonnement et jamais recalculée aux         │
 * │ renouvellements (D4 point 7).                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const souscriptionSchema = z.object({
  /**
   * Le CODE d'une formule, ex. `lecture-mensuel` — plus `mensuel | annuel`.
   *
   * Depuis la migration 0068, les formules sont créées par l'éditeur dans
   * `/admin/offres` : le code n'est donc plus une valeur close que Zod
   * pourrait énumérer. La validation qui compte est ailleurs, et elle est plus
   * forte : `offre_par_code` ne rend une ligne que pour une formule ACTIVE
   * ayant un PRIX dans la zone d'encaissement. Un code inventé n'y trouve rien.
   */
  offre: z.string().min(1).max(64),
});

/** Domaine visé, pour les routes qui agissent sur un contrat existant. */
const domaineSchema = z.enum(['lecture', 'association']).default('lecture');

function domaineDemande(request: Request): DomaineAbonnement {
  const brut = new URL(request.url).searchParams.get('domaine') ?? undefined;
  const lu = domaineSchema.safeParse(brut);
  return lu.success ? lu.data : 'lecture';
}

/** Une ligne d'abonnement telle que l'interface la lit. */
function enReponse(courant: AbonnementCourant, maintenant: Date) {
  return {
    // Le statut OBSERVÉ, dates repliées : c'est celui qui décrit la réalité.
    // `anomalie` signale une période échue sans événement — presque toujours
    // un webhook perdu.
    statut: courant.statutEffectif,
    // Celui que le prestataire a rapporté, conservé à part. « Annulé » et
    // « impayé » ne racontent pas la même histoire, et l'analyse de rétention
    // (étape 14) a besoin de la distinction.
    statut_rapporte: courant.statut,
    offre: courant.offre,
    domaine: courant.domaine,
    fin_periode: courant.finPeriode.toISOString(),
    zone: courant.zone,
    devise: courant.devise,
    montant: courant.montant,
    // Calculé plutôt que stocké : `fin_periode` est la seule vérité, et un
    // drapeau « encore valable » se désynchroniserait avec le temps.
    periode_en_cours: courant.finPeriode > maintenant,
  };
}

/**
 * État des abonnements de l'appelant — LES DEUX.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX CHAMPS, ET NON UNE LISTE INDIFFÉRENCIÉE.                           │
 * │                                                                          │
 * │ Les deux abonnements sont étanches (§3.6) : ils n'ouvrent pas les mêmes  │
 * │ portes, ne se remplacent pas, et se cumulent. Les rendre dans une liste  │
 * │ obligerait chaque écran à retrouver le bon par son domaine — et le jour  │
 * │ où l'un oublierait, il afficherait « abonné » pour le mauvais contrat.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const client = createServiceClient();
  const [lecture, association] = await Promise.all([
    abonnementCourant(garde.appelant.id, 'lecture', { client }),
    abonnementCourant(garde.appelant.id, 'association', { client }),
  ]);

  const maintenant = getClock().now();

  return ok({
    abonnement: lecture ? enReponse(lecture, maintenant) : null,
    association: association ? enReponse(association, maintenant) : null,
    // Rappel utile à l'interface : l'abonnement ne donne JAMAIS le
    // téléchargement (§3.2). C'est la confusion la plus coûteuse du projet.
    donne_telechargement: false,
  });
}

/** Ouvre une souscription. N'active rien. */
export async function POST(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const corps = await parseJsonBody(request, souscriptionSchema);
  if (!corps.ok) return corps.response;

  const client = createServiceClient();

  // La zone est demandée AVANT la formule : le prix d'une formule dépend de la
  // zone d'encaissement, et la zone vient du prestataire (§3.3). Le domaine
  // n'est pas encore connu ; il l'est juste après, et l'essai est relu alors.
  const zone = (
    await preparerSouscription(
      { userId: garde.appelant.id, email: garde.appelant.email },
      'lecture',
      { client },
    )
  ).zone;

  const offre = await lireOffreParCode(corps.data.offre, zone, { client });

  if (!offre) {
    // Un seul refus pour trois causes — code inconnu, formule désactivée,
    // formule sans prix dans cette zone. Les distinguer renseignerait sur ce
    // qui existe en coulisse sans rien apporter au client.
    return fail(404, {
      code: 'offre_indisponible',
      message: 'Cette formule n’est pas disponible.',
    });
  }

  const courant = await abonnementCourant(garde.appelant.id, offre.domaine, { client });

  // Un abonnement vivant DANS CE DOMAINE interdit d'en souscrire un second : ce
  // serait un double prélèvement. L'index unique de la base le refuserait de
  // toute façon, mais un 409 explicite vaut mieux qu'une erreur de contrainte.
  // Un abonnement de lecture, lui, n'empêche pas de rejoindre l'association :
  // les deux se cumulent (§3.6).
  if (courant && courant.statut !== 'expire') {
    return fail(409, {
      code: 'abonnement_deja_actif',
      message: 'Vous avez déjà un abonnement en cours.',
    });
  }

  // §3.4 — essai gratuit, moyen de paiement requis. Zone et durée d'essai
  // viennent de `preparerSouscription`, le montant de `lireOffreParCode` :
  // écrits UNE fois chacun, la route qui simule l'événement du prestataire lit
  // exactement les mêmes valeurs, sans quoi un abonnement serait ouvert à un
  // prix et créé à un autre.
  const preparation = await preparerSouscription(
    { userId: garde.appelant.id, email: garde.appelant.email },
    offre.domaine,
    { client },
  );

  const session = await getPaymentProvider().souscrireAbonnement({
    // Aucune ligne n'existe encore en base : c'est le webhook `abonnement.souscrit`
    // qui la créera. L'identifiant transmis est celui de l'utilisateur, que
    // l'événement rapportera.
    subscriptionId: garde.appelant.id,
    offre: offre.periode,
    domaine: offre.domaine,
    codeOffre: offre.code,
    planId: offre.id,
    montant: { montant: offre.montant, devise: offre.devise },
    zone: preparation.zone,
    client: { userId: garde.appelant.id, email: garde.appelant.email },
    joursEssai: preparation.joursEssai,
  });

  logger.info('Souscription ouverte', {
    userId: garde.appelant.id,
    offre: offre.code,
    domaine: offre.domaine,
    zone: preparation.zone,
  });

  return ok({
    url: session.url,
    expire_le: session.expireLe.toISOString(),
    jours_essai: preparation.joursEssai,
    // Explicite : rien n'est actif tant que l'événement signé n'est pas arrivé.
    statut: 'en_attente_paiement',
  });
}

/** Demande l'annulation au prestataire. N'annule rien en base. */
export async function DELETE(request: Request): Promise<Response> {
  const garde = await requireUser(request);
  if (!garde.ok) return garde.response;

  const client = createServiceClient();
  // On annule UN contrat, pas « l'abonnement ». Le domaine est lu dans l'URL et
  // retombe sur `lecture`, le seul qui existait avant §3.6.
  const courant = await abonnementCourant(garde.appelant.id, domaineDemande(request), { client });

  if (!courant || courant.statut === 'annule' || courant.statut === 'expire') {
    return fail(409, {
      code: 'aucun_abonnement_actif',
      message: 'Vous n’avez pas d’abonnement en cours.',
    });
  }

  const { data } = await client
    .from('subscriptions')
    .select('id_prestataire')
    .eq('id', courant.id)
    .maybeSingle();

  if (data?.id_prestataire) {
    await getPaymentProvider().annulerAbonnement(data.id_prestataire);
  }

  logger.info('Annulation d’abonnement demandée', {
    userId: garde.appelant.id,
    subscriptionId: courant.id,
  });

  return ok({
    demande: true,
    // §9.1 — l'accès est maintenu jusqu'à la fin de la période payée. Le dire
    // ici évite le contresens le plus fréquent : croire qu'annuler coupe
    // immédiatement.
    acces_maintenu_jusqu_au: courant.finPeriode.toISOString(),
    statut: 'annulation_demandee',
  });
}
