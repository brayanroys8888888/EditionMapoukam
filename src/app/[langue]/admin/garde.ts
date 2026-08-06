import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { langueValide, type LangueInterface } from '@/i18n';
import { identifierAppelant } from '@/lib/auth/session';

/**
 * GARDE DES ÉCRANS D'ADMINISTRATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE RÔLE EST RELU EN BASE, À CHAQUE REQUÊTE.                             │
 * │                                                                          │
 * │ `identifierAppelant` ne fait jamais confiance au jeton seul : il relit le │
 * │ profil. Un compte rétrogradé perd donc l'accès au rendu suivant, sans    │
 * │ qu'il faille attendre l'expiration de sa session.                        │
 * │                                                                          │
 * │ Cette garde protège l'ÉCRAN. Elle ne protège pas les données : chaque    │
 * │ route d'API et chaque fonction SQL refait le contrôle pour son compte.   │
 * │ Trois gardes valent mieux qu'une quand chacune peut être contournée      │
 * │ seule (CLAUDE.md règle 4).                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN NON-ADMINISTRATEUR REÇOIT UN 404, PAS UN 403.                        │
 * │                                                                          │
 * │ « Vous n'avez pas accès à cette page » confirme que la page existe, et   │
 * │ donc qu'il y a une administration à cette adresse. Un 404 ne dit rien —  │
 * │ c'est la même raison qui fait répondre 404 sur un brouillon de conte.    │
 * │                                                                          │
 * │ Un visiteur NON CONNECTÉ, lui, est envoyé se connecter : il n'y a rien à │
 * │ cacher à quelqu'un qui n'a pas encore dit qui il est, et le renvoyer sur │
 * │ un 404 lui ferait croire que son marque-page est mort.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function exigerAdministrateur(langueBrute: string): Promise<LangueInterface> {
  const langue = langueValide(langueBrute);

  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: await headers() }),
  );

  if (!appelant) redirect(`/${langue}/connexion`);
  if (appelant.role !== 'admin') notFound();

  return langue;
}
