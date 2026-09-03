'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';
import { estMoyenPaiement } from '@/domain/payments/moyens';
import { estDomaineAbonnement } from '@/domain/subscriptions/domaines';
import { verifierCoordonnees } from '@/lib/tunnel/coordonnees';

/**
 * ACTIONS DU TUNNEL D'ABONNEMENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLES N'ACTIVENT AUCUN ABONNEMENT, ET NE LE PEUVENT PAS.                │
 * │                                                                          │
 * │ §9.1 : « la notification par webhook est la seule source de vérité du    │
 * │ statut de paiement. Ne jamais activer un abonnement sur la seule base    │
 * │ d'une redirection navigateur. » Ces actions appellent deux routes, dans  │
 * │ cet ordre, et n'écrivent rien elles-mêmes :                             │
 * │                                                                          │
 * │   1. `POST /api/subscriptions` ouvre la souscription chez le prestataire ;│
 * │   2. `POST /api/abonnement-simule` émet l'événement signé qu'un vrai     │
 * │      prestataire enverrait, et c'est le gestionnaire de webhooks qui     │
 * │      crée l'abonnement.                                                  │
 * │                                                                          │
 * │ Les deux appels sont VOULUS : sauter le premier ferait naître un         │
 * │ abonnement sans qu'aucune souscription ait été ouverte, ce qui n'arrive  │
 * │ jamais en vrai — et laisserait le 409 « abonnement déjà actif » du       │
 * │ premier sans jamais être éprouvé.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

async function appeler(
  chemin: string,
  charge: unknown,
): Promise<{ statut: number; corps: Record<string, unknown> | null }> {
  const magasin = await cookies();
  const entete = magasin
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');

  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}${chemin}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // La session voyage par cookie : sans ce report, chaque action serait vue
      // comme un visiteur.
      cookie: entete,
    },
    body: JSON.stringify(charge),
    cache: 'no-store',
  });

  return {
    statut: reponse.status,
    corps: (await reponse.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

function codeErreur(corps: Record<string, unknown> | null): string {
  const erreur = corps?.['erreur'];
  if (erreur && typeof erreur === 'object' && 'code' in erreur) {
    const code = (erreur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'erreur_interne';
}

/**
 * Souscrit — ou simule l'échec du premier prélèvement.
 *
 * L'offre est relue DEPUIS LE FORMULAIRE et revalidée : vide, elle ramène au
 * choix de la formule plutôt que de retomber sur une formule par défaut, ce qui
 * abonnerait quelqu'un à un contrat qu'il n'a pas choisi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE ACTION NE VÉRIFIE PAS QUE LE CODE EXISTE, ET C'EST VOULU.         │
 * │                                                                          │
 * │ Depuis la migration 0068, les formules sont créées par l'éditeur : leur  │
 * │ liste n'est plus une valeur close, et la connaître ici demanderait un    │
 * │ troisième appel. `POST /api/subscriptions` la connaît, lui, et refuse en │
 * │ 404 `offre_indisponible` — code inconnu, formule désactivée ou sans prix │
 * │ dans la zone. Ce refus est déjà traité en dessous, et il est PLUS FORT   │
 * │ qu'une liste blanche recopiée ici, qui vieillirait.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function souscrire(
  langueBrute: string,
  issue: 'reussi' | 'echoue',
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);

  // Le domaine suit le formulaire d'un bout à l'autre : sans lui, un échec de
  // saisie renverrait un adhérent sur le tunnel de LECTURE, où il choisirait
  // une formule de catalogue en croyant adhérer.
  const domaineBrut = donnees.get('domaine');
  const domaine =
    typeof domaineBrut === 'string' && estDomaineAbonnement(domaineBrut)
      ? domaineBrut
      : 'lecture';

  const chemin = `/${langue}/abonnement/souscrire`;
  const suffixe = domaine === 'lecture' ? '' : `domaine=${domaine}`;
  const base = suffixe ? `${chemin}?${suffixe}` : chemin;

  /** Une adresse du tunnel, domaine compris. */
  const versTunnel = (parametres: Record<string, string>): string => {
    const query = new URLSearchParams(parametres);
    if (domaine !== 'lecture') query.set('domaine', domaine);
    return `${chemin}?${query.toString()}`;
  };

  const offreBrute = donnees.get('offre');
  const offre = typeof offreBrute === 'string' && offreBrute !== '' ? offreBrute : null;
  if (!offre) redirect(base);

  const moyenBrut = donnees.get('moyen');
  const moyen = estMoyenPaiement(moyenBrut) ? moyenBrut : null;

  // Seul le succès passe par la validation — un échec de prélèvement se produit
  // chez le prestataire, après que les coordonnées sont parties.
  if (issue === 'reussi') {
    const defauts = verifierCoordonnees(donnees);
    if (defauts.length > 0) {
      const parametres: Record<string, string> = { offre, champs: defauts.join(',') };
      if (moyen) parametres['moyen'] = moyen;
      redirect(versTunnel(parametres));
    }
  }

  // 1. La souscription chez le prestataire. Elle n'active rien.
  //    Le domaine n'est pas transmis : il est PORTÉ PAR LA FORMULE, que la route
  //    relit en base. L'envoyer ici permettrait de réclamer une formule de
  //    lecture au titre de l'association — l'étanchéité de §3.6 tiendrait alors
  //    à ce que deux paramètres soient d'accord, au lieu d'un seul.
  const ouverture = await appeler('/api/subscriptions', { offre });

  if (ouverture.statut === 401) redirect(`/${langue}/connexion`);
  if (ouverture.statut !== 200) {
    const parametres: Record<string, string> = { offre, erreur: codeErreur(ouverture.corps) };
    if (moyen) parametres['moyen'] = moyen;
    redirect(versTunnel(parametres));
  }

  // 2. L'événement signé que le prestataire enverrait. Lui seul crée
  //    l'abonnement — cette action ne fait que le déclencher.
  await appeler('/api/abonnement-simule', { offre, issue });

  // L'écran de confirmation RELIT l'abonnement en base. Il n'affiche donc pas
  // ce que cette action espérait, mais ce que le webhook a réellement produit.
  redirect(versTunnel({ fait: '1' }));
}
