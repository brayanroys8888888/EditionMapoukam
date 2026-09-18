'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide } from '@/i18n';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { revoquerSession } from '@/lib/auth/deconnexion';

/**
 * SORTIR DE L'ADMINISTRATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PREMIER MOYEN DE SE DÉCONNECTER DE TOUT LE PRODUIT.                  │
 * │                                                                          │
 * │ `docs/REFONTE-V3.md` §12 l'avait inscrit comme un manque de PRODUIT :    │
 * │ « la route `POST /api/auth/logout` existe et fonctionne ; aucun écran ne │
 * │ l'appelle ». Le prototype d'administration du 17 septembre 2026 pose un  │
 * │ lien « Sortir » au pied du rail, et le propriétaire a tranché : il       │
 * │ déconnecte pour de bon.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UNE ACTION, ET NON UN APPEL À LA ROUTE.                        │
 * │                                                                          │
 * │ Les autres actions de ce répertoire appellent leur route, et c'est juste │
 * │ pour elles : la route porte l'acteur et le journal d'audit. Celle-ci ne  │
 * │ le peut pas. `POST /api/auth/logout` rend un 204 dont les `Set-Cookie`   │
 * │ ne traversent PAS un `fetch` fait côté serveur : le navigateur           │
 * │ garderait ses cookies, et l'on serait « déconnecté » sans l'être.        │
 * │                                                                          │
 * │ L'action efface donc les cookies par le magasin de Next.js, et la        │
 * │ révocation — la seule vraie règle — reste unique dans                    │
 * │ `revoquerSession`. La route et l'action appellent la MÊME fonction.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ORDRE DES TROIS GESTES N'EST PAS INDIFFÉRENT.                         │
 * │                                                                          │
 * │ Révoquer AVANT d'effacer : le jeton est lu dans le cookie, et l'effacer  │
 * │ d'abord laisserait la session vivante côté serveur — une déconnexion     │
 * │ qui ne déconnecte que l'écran. Rediriger EN DERNIER : `redirect()` lève, │
 * │ et tout ce qui suivrait ne s'exécuterait jamais.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function deconnecter(donnees: FormData): Promise<void> {
  // `FormData.get` peut rendre un fichier : seule une chaîne est une langue,
  // et `langueValide` replie tout le reste sur le français.
  const champ = donnees.get('langue');
  const langue = langueValide(typeof champ === 'string' ? champ : '');
  const magasin = await cookies();

  await revoquerSession(magasin.get(ACCESS_TOKEN_COOKIE)?.value);

  magasin.delete(ACCESS_TOKEN_COOKIE);
  magasin.delete(REFRESH_TOKEN_COOKIE);

  redirect(`/${langue}`);
}
