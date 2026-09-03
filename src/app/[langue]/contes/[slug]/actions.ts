'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * LES ACTIONS D'AVIS DE LA FICHE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLES APPELLENT LA ROUTE, ELLES NE TOUCHENT PAS LA TABLE.               │
 * │                                                                          │
 * │ C'est le même choix qu'au tunnel d'achat, pour la même raison : la       │
 * │ validation Zod, la traduction des refus de la base en réponses HTTP et   │
 * │ la vérification du droit d'écrire vivent dans `/api/books/[id]/reviews`. │
 * │ Les refaire ici en ferait une seconde implémentation — et c'est toujours │
 * │ la copie qui finit par avoir tort.                                       │
 * │                                                                          │
 * │ La session voyage par COOKIE : sans son report explicite, chaque action  │
 * │ serait vue comme un visiteur, et le dépôt échouerait en 401 sans que     │
 * │ rien n'explique pourquoi.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function appeler(
  chemin: string,
  methode: 'POST' | 'PATCH' | 'DELETE',
  charge?: unknown,
): Promise<{ statut: number; corps: Record<string, unknown> | null }> {
  const magasin = await cookies();
  const entete = magasin
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');

  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', cookie: entete },
    ...(charge === undefined ? {} : { body: JSON.stringify(charge) }),
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

function nombre(donnees: FormData, nom: string): number | undefined {
  const valeur = donnees.get(nom);
  if (typeof valeur !== 'string' || valeur.trim() === '') return undefined;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : undefined;
}

function texte(donnees: FormData, nom: string): string {
  const valeur = donnees.get(nom);
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/**
 * Déposer ou corriger son avis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SEUL FORMULAIRE POUR LES DEUX GESTES.                                │
 * │                                                                          │
 * │ Un lecteur n'a qu'un avis par titre — l'unicité `(book_id, user_id)` le  │
 * │ garantit en base. Deux boutons « Déposer » et « Corriger » l'obligeraient │
 * │ à savoir dans lequel des deux états il se trouve ; l'écran le sait déjà. │
 * │ La méthode est donc choisie ICI, sur la présence d'un avis existant, et  │
 * │ jamais transmise par le client.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function deposerAvis(
  langueBrute: string,
  livreId: string,
  slug: string,
  possedeDejaUnAvis: boolean,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/contes/${slug}`;

  const reponse = await appeler(
    `/api/books/${livreId}/reviews`,
    possedeDejaUnAvis ? 'PATCH' : 'POST',
    {
      note: nombre(donnees, 'note'),
      texte: texte(donnees, 'texte'),
      auteur_affiche: texte(donnees, 'auteur_affiche'),
    },
  );

  if (reponse.statut !== 200 && reponse.statut !== 201) {
    redirect(`${ecran}?erreur=${codeErreur(reponse.corps)}#avis`);
  }

  revalidatePath(ecran);
  redirect(`${ecran}?avis=enregistre#avis`);
}

/** Retirer son avis — un droit, y compris une fois publié. */
export async function retirerAvis(
  langueBrute: string,
  livreId: string,
  slug: string,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/contes/${slug}`;

  const reponse = await appeler(`/api/books/${livreId}/reviews`, 'DELETE');

  if (reponse.statut !== 204 && reponse.statut !== 200) {
    redirect(`${ecran}?erreur=${codeErreur(reponse.corps)}#avis`);
  }

  revalidatePath(ecran);
  redirect(`${ecran}?avis=retire#avis`);
}
