'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide, type LangueInterface } from '@/i18n';
import { descripteursDeSession } from '@/lib/auth/cookies';
import { getServerEnv } from '@/lib/config/env';

/**
 * SERVER ACTIONS DES ÉCRANS D'AUTHENTIFICATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLES APPELLENT LES ROUTES, ELLES NE LES REFONT PAS.                    │
 * │                                                                          │
 * │ Limitation des tentatives, indistinguabilité des réponses, contrôle du   │
 * │ statut du compte, ouverture de la lignée de jetons : tout cela vit dans  │
 * │ `src/app/api/auth/*` et y reste. Une action qui parlerait directement à  │
 * │ Supabase serait une SECONDE implémentation de l'authentification, dont   │
 * │ personne ne remarquerait la dérive avant qu'elle ne laisse passer        │
 * │ quelque chose (docs/PLAN.md §5 quinquies, PLAN-FRONTEND §1.2).           │
 * │                                                                          │
 * │ Le middleware procède déjà ainsi pour le rafraîchissement : il appelle   │
 * │ `/api/auth/refresh` par `fetch` plutôt que de rejouer sa logique.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Aucune de ces actions ne renvoie de valeur : elles redirigent. L'état
 * d'erreur vit donc dans l'URL, et non dans un état de composant — ce qui le
 * rend lisible par un écran rendu SANS JAVASCRIPT, survivant au rechargement,
 * et testable par simple lecture des paramètres.
 */

interface ReponseApi {
  statut: number;
  corps: Record<string, unknown> | null;
  retryAfter: number | null;
}

async function appeler(chemin: string, charge: unknown, jeton?: string): Promise<ReponseApi> {
  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}${chemin}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify(charge),
    cache: 'no-store',
  });

  const entete = reponse.headers.get('retry-after');

  return {
    statut: reponse.status,
    corps: (await reponse.json().catch(() => null)) as Record<string, unknown> | null,
    retryAfter: entete ? Number(entete) : null,
  };
}

/** Code d'erreur rendu par l'API, ou `erreur_interne` si la forme est inattendue. */
function codeErreur(reponse: ReponseApi): string {
  const erreur = reponse.corps?.['erreur'];
  if (erreur && typeof erreur === 'object' && 'code' in erreur) {
    const code = (erreur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'erreur_interne';
}

/** Renvoie l'écran d'où l'on vient, en portant le motif du refus. */
function repartirEnErreur(
  langue: LangueInterface,
  ecran: string,
  reponse: ReponseApi,
  parametres: Record<string, string> = {},
): never {
  const cible = new URLSearchParams({ ...parametres, erreur: codeErreur(reponse) });
  if (reponse.retryAfter !== null && !Number.isNaN(reponse.retryAfter)) {
    cible.set('attente', String(reponse.retryAfter));
  }
  redirect(`/${langue}/${ecran}?${cible.toString()}`);
}

/**
 * Pose les cookies de session à partir d'une réponse d'API.
 *
 * Les attributs viennent de `descripteursDeSession` — la politique de cookies
 * n'est PAS réécrite ici. Voir l'encadré de `src/lib/auth/cookies.ts`.
 */
async function poserSession(corps: Record<string, unknown> | null): Promise<string | null> {
  const acces = corps?.['access_token'];
  const rafraichissement = corps?.['refresh_token'];
  const duree = corps?.['expires_in'];

  if (typeof acces !== 'string' || typeof rafraichissement !== 'string' || typeof duree !== 'number') {
    return null;
  }

  const magasin = await cookies();
  for (const descripteur of descripteursDeSession({
    access_token: acces,
    refresh_token: rafraichissement,
    expires_in: duree,
  })) {
    magasin.set(descripteur.nom, descripteur.valeur, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: descripteur.maxAgeSeconds,
      secure: descripteur.secure,
    });
  }

  return acces;
}

function texte(donnees: FormData, champ: string): string {
  const valeur = donnees.get(champ);
  return typeof valeur === 'string' ? valeur : '';
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNEXION
// ═══════════════════════════════════════════════════════════════════════════

export async function connexion(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);

  const reponse = await appeler('/api/auth/login', {
    email: texte(donnees, 'email'),
    password: texte(donnees, 'password'),
  });

  if (reponse.statut !== 200) repartirEnErreur(langue, 'connexion', reponse);

  await poserSession(reponse.corps);
  redirect(`/${langue}/catalogue`);
}

export async function renvoyerCode(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);

  // La réponse est un 204 dans tous les cas : il n'y a rien à examiner, et
  // c'est précisément ce qui rend cette action sans danger.
  await appeler('/api/auth/resend', { email: texte(donnees, 'email') });
  redirect(`/${langue}/confirmation?envoye=1`);
}

// ═══════════════════════════════════════════════════════════════════════════
// INSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Inscription.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA REDIRECTION EST LA MÊME QUE L'ADRESSE SOIT CONNUE OU NON.            │
 * │                                                                          │
 * │ Le backend rend 201 dans les deux cas — il va jusqu'à absorber le 429    │
 * │ que Supabase produit sur une adresse déjà inscrite. Cette action ne doit │
 * │ donc surtout pas distinguer ce que la route a pris soin de confondre.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function inscription(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const nom = texte(donnees, 'nom_complet').trim();

  const reponse = await appeler('/api/auth/register', {
    email: texte(donnees, 'email'),
    password: texte(donnees, 'password'),
    ...(nom ? { nom_complet: nom } : {}),
    langue_preferee: langue,
  });

  if (reponse.statut !== 201) repartirEnErreur(langue, 'inscription', reponse);

  // Quand la vérification est court-circuitée, envoyer vers la saisie du code
  // serait un cul-de-sac : le code n'a jamais été émis, et l'écran demanderait
  // indéfiniment quelque chose qui n'arrivera pas.
  if (getServerEnv().AUTH_CONFIRMATION_AUTOMATIQUE) {
    redirect(`/${langue}/connexion?inscrit=1`);
  }

  redirect(`/${langue}/confirmation?envoye=1`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MOT DE PASSE OUBLIÉ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Demande de réinitialisation.
 *
 * Aucun branchement sur la réponse : la route rend 204 même quand l'envoi a
 * échoué, et l'écran suivant affiche « vérifiez votre boîte » sans condition.
 * C'est la deuxième des trois indistinguabilités.
 */
export async function demanderReinitialisation(
  langueBrute: string,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);

  await appeler('/api/auth/password/reset', { email: texte(donnees, 'email') });
  redirect(`/${langue}/nouveau-mot-de-passe?envoye=1`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CODE À USAGE UNIQUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Confirmation d'adresse — échange du code de type `signup`.
 */
export async function confirmerAdresse(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);

  const reponse = await appeler('/api/auth/otp', {
    email: texte(donnees, 'email'),
    code: texte(donnees, 'code'),
    type: 'signup',
  });

  if (reponse.statut !== 200) repartirEnErreur(langue, 'confirmation', reponse);

  await poserSession(reponse.corps);
  redirect(`/${langue}/catalogue?confirme=1`);
}

/**
 * Nouveau mot de passe — échange du code de type `recovery`, PUIS changement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX APPELS, ET L'ORDRE N'EST PAS INTERCHANGEABLE.                      │
 * │                                                                          │
 * │ `/api/auth/password/update` exige une session valide — c'est ce qui      │
 * │ empêche n'importe qui de changer le mot de passe d'autrui. Le code       │
 * │ ouvre cette session ; le changement la consomme aussitôt.                │
 * │                                                                          │
 * │ Si le second appel échoue, la session est déjà posée et le code déjà     │
 * │ consommé : l'utilisateur est connecté mais son mot de passe est          │
 * │ inchangé. On le renvoie donc vers l'écran avec le motif du refus — un    │
 * │ mot de passe trop faible, le cas courant — et non vers une demande de    │
 * │ nouveau code, qui échouerait puisqu'il n'en a plus besoin.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function changerMotDePasse(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);

  const echange = await appeler('/api/auth/otp', {
    email: texte(donnees, 'email'),
    code: texte(donnees, 'code'),
    type: 'recovery',
  });

  if (echange.statut !== 200) repartirEnErreur(langue, 'nouveau-mot-de-passe', echange);

  const jeton = await poserSession(echange.corps);
  if (!jeton) repartirEnErreur(langue, 'nouveau-mot-de-passe', echange);

  const changement = await appeler(
    '/api/auth/password/update',
    { password: texte(donnees, 'password') },
    jeton,
  );

  if (changement.statut !== 204) {
    repartirEnErreur(langue, 'nouveau-mot-de-passe', changement, { session: 'ouverte' });
  }

  redirect(`/${langue}/catalogue?motdepasse=change`);
}
