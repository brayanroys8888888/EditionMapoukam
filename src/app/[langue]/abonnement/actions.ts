'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';
import { estMoyenPaiement } from '@/domain/payments/moyens';
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
 * L'offre est relue DEPUIS LE FORMULAIRE et revalidée : une valeur inattendue
 * ramène au choix de la formule plutôt que de retomber sur « mensuel », ce qui
 * abonnerait quelqu'un à une formule qu'il n'a pas choisie.
 */
export async function souscrire(
  langueBrute: string,
  issue: 'reussi' | 'echoue',
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const base = `/${langue}/abonnement/souscrire`;

  const offreBrute = donnees.get('offre');
  const offre = offreBrute === 'mensuel' || offreBrute === 'annuel' ? offreBrute : null;
  if (!offre) redirect(base);

  const moyenBrut = donnees.get('moyen');
  const moyen = estMoyenPaiement(moyenBrut) ? moyenBrut : null;

  // Seul le succès passe par la validation — un échec de prélèvement se produit
  // chez le prestataire, après que les coordonnées sont parties.
  if (issue === 'reussi') {
    const defauts = verifierCoordonnees(donnees);
    if (defauts.length > 0) {
      const parametres = new URLSearchParams({ offre, champs: defauts.join(',') });
      if (moyen) parametres.set('moyen', moyen);
      redirect(`${base}?${parametres.toString()}`);
    }
  }

  // 1. La souscription chez le prestataire. Elle n'active rien.
  const ouverture = await appeler('/api/subscriptions', { offre });

  if (ouverture.statut === 401) redirect(`/${langue}/connexion`);
  if (ouverture.statut !== 200) {
    const parametres = new URLSearchParams({
      offre,
      erreur: codeErreur(ouverture.corps),
    });
    if (moyen) parametres.set('moyen', moyen);
    redirect(`${base}?${parametres.toString()}`);
  }

  // 2. L'événement signé que le prestataire enverrait. Lui seul crée
  //    l'abonnement — cette action ne fait que le déclencher.
  await appeler('/api/abonnement-simule', { offre, issue });

  // L'écran de confirmation RELIT l'abonnement en base. Il n'affiche donc pas
  // ce que cette action espérait, mais ce que le webhook a réellement produit.
  redirect(`${base}?fait=1`);
}
