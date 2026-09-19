'use server';

import { redirect } from 'next/navigation';

import { langueValide } from '@/i18n';

/**
 * ACTIONS DE L'ESPACE PERSONNEL.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TÉLÉCHARGEMENT N'EST PLUS UNE ACTION SERVEUR, ET C'EST DÉLIBÉRÉ.     │
 * │                                                                          │
 * │ Il en a été une : `telechargerConte` lisait l'URL signée puis y          │
 * │ redirigeait. Le défaut n'était pas dans son code mais dans le mécanisme. │
 * │ Une action serveur est exécutée par le ROUTEUR côté client ; sa          │
 * │ redirection devient une navigation, et comme le stockage répond           │
 * │ `Content-Disposition: attachment`, le navigateur la convertit en          │
 * │ téléchargement. Le document ne se décharge donc JAMAIS, la navigation     │
 * │ attendue n'aboutit pas, et la file d'actions du routeur reste bloquée :   │
 * │ passé deux téléchargements, plus aucune action ne partait de l'écran      │
 * │ jusqu'à un rechargement complet.                                        │
 * │                                                                          │
 * │ Le chemin est maintenant `GET /{langue}/telechargement/{bookId}`, atteint │
 * │ par une soumission GET native. Voir l'encadré de cette route : elle ne    │
 * │ décide rien et ne signe rien, elle appelle le gestionnaire d'API en       │
 * │ mémoire et traduit sa réponse en redirection.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Enregistre les modifications de profil (nom complet et téléphone).
 * L'adresse email n'est pas modifiable.
 */
export async function enregistrerProfil(
  langueBrute: string,
  donnees: FormData,
): Promise<void> {
  const { headers } = await import('next/headers');
  const { identifierAppelantAvecCookies } = await import('@/lib/auth/session');
  const { createServiceClient } = await import('@/lib/supabase/clients');

  const langue = langueValide(langueBrute);
  const appelant = await identifierAppelantAvecCookies(
    new Request('http://interne/', { headers: await headers() }),
  );
  if (!appelant) redirect(`/${langue}/connexion`);

  const nomComplet = (donnees.get('nom_complet') as string)?.trim() || null;
  const telephone = (donnees.get('telephone') as string)?.trim() || null;

  await createServiceClient()
    .from('users')
    .update({
      nom_complet: nomComplet,
      telephone: telephone,
    })
    .eq('id', appelant.id);

  redirect(`/${langue}/compte?toast=profilEnregistre`);
}
