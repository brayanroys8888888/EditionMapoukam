'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * LA MODÉRATION DES AVIS — actions d'écran, migration 0072.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES ACTIONS APPELLENT LES ROUTES. ELLES NE TOUCHENT PAS LA BASE.        │
 * │                                                                          │
 * │ Même raison que partout ailleurs dans l'administration : elle passe par   │
 * │ `service_role`, donc RLS est contourné par construction. Une action qui   │
 * │ écrirait directement le ferait sans acteur, et le journal cesserait de    │
 * │ dire QUI a publié — ou refusé — l'avis d'un lecteur.                      │
 * │                                                                          │
 * │ Le cookie de session part tel quel ; c'est lui, et lui seul, qui désigne  │
 * │ l'acteur côté route. Aucun `user_id` ne circule dans ces corps.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

async function enteteCookie(): Promise<string> {
  const magasin = await cookies();
  return magasin
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
}

function codeErreur(corps: Record<string, unknown> | null): string {
  const erreur = corps?.['erreur'];
  if (erreur && typeof erreur === 'object' && 'code' in erreur) {
    const code = (erreur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'erreur_interne';
}

/** Texte lu d'un formulaire, ou `undefined` si le champ est laissé vide. */
function texte(donnees: FormData, nom: string): string | undefined {
  const valeur = donnees.get(nom);
  if (typeof valeur !== 'string' || valeur.trim() === '') return undefined;
  return valeur.trim();
}

/**
 * Le filtre courant, reporté d'un envoi à l'autre.
 *
 * Une file de modération se traite du haut vers le bas. Renvoyer l'éditeur sur
 * la liste complète après chaque décision lui ferait rechercher sa place à
 * chaque avis traité — c'est le même soin que le report des filtres en champs
 * cachés dans la recherche du catalogue.
 */
function suffixeFiltre(donnees: FormData): string {
  const statut = texte(donnees, 'filtre');
  return statut === undefined ? '' : `&statut=${encodeURIComponent(statut)}`;
}

async function appelerRoute(
  ecran: string,
  chemin: string,
  methode: 'PATCH' | 'DELETE',
  corps: unknown,
  succes: string,
  attendu: number,
  suffixe: string,
): Promise<never> {
  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}${chemin}`, {
    method: methode,
    headers: {
      'content-type': 'application/json',
      cookie: await enteteCookie(),
    },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    cache: 'no-store',
  });

  if (reponse.status !== attendu) {
    // `204` n'a pas de corps ; `json()` y échouerait sans que ce soit une
    // erreur. Le `catch` couvre les deux cas d'un même geste.
    const details = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;
    redirect(`${ecran}?erreur=${codeErreur(details)}${suffixe}`);
  }

  revalidatePath(ecran);
  redirect(`${ecran}?${succes}=1${suffixe}`);
}

/**
 * Publie, refuse, ou remet un avis en attente.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MOTIF EST UN MESSAGE À L'AUTEUR, PAS UNE NOTE INTERNE.               │
 * │                                                                          │
 * │ Il s'affiche sur la fiche du titre, sous l'avis refusé, et lui seul.      │
 * │ L'auteur peut alors corriger son texte — la correction le remet en        │
 * │ attente d'elle-même, par un déclencheur, sans qu'aucun écran y pense.     │
 * │                                                                          │
 * │ La base efface le motif dès qu'un avis repasse en `publie` : un ancien    │
 * │ refus ne reste pas collé à un texte finalement accepté.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function modererAvis(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/avis`;

  await appelerRoute(
    ecran,
    `/api/admin/reviews/${texte(donnees, 'id') ?? ''}`,
    'PATCH',
    {
      decision: texte(donnees, 'decision'),
      motif: texte(donnees, 'motif') ?? null,
    },
    'modere',
    200,
    suffixeFiltre(donnees),
  );
}

/**
 * Supprime un avis — le geste qui ne laisse rien.
 *
 * Distinct du refus : un avis refusé reste visible de son auteur, avec le
 * motif, et se corrige. Un avis supprimé disparaît, et son auteur peut en
 * écrire un nouveau — l'unicité `(book_id, user_id)` le lui interdisait tant
 * que le premier existait.
 */
export async function supprimerAvis(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/avis`;

  await appelerRoute(
    ecran,
    `/api/admin/reviews/${texte(donnees, 'id') ?? ''}`,
    'DELETE',
    undefined,
    'supprime',
    204,
    suffixeFiltre(donnees),
  );
}
