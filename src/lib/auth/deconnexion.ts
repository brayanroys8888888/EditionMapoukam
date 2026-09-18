import { createServiceClient } from '@/lib/supabase/clients';
import { identifierAppelant } from '@/lib/auth/session';
import { revoquerFamilles } from '@/lib/auth/refresh';
import { logger } from '@/lib/logger';

/**
 * RÉVOQUER UNE SESSION — L'UNIQUE IMPLÉMENTATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX APPELANTS, UNE SEULE RÈGLE.                                        │
 * │                                                                          │
 * │ `POST /api/auth/logout` portait ce corps à lui seul, et c'était vrai     │
 * │ tant que personne d'autre ne déconnectait. Le rail d'administration le   │
 * │ fait maintenant, par une Server Action — et une action ne peut pas       │
 * │ appeler la route : la réponse est un 204, le navigateur resterait sur    │
 * │ une page blanche.                                                        │
 * │                                                                          │
 * │ Recopier les quatre gestes dans l'action aurait produit exactement ce    │
 * │ que `CLAUDE.md` décrit : une règle écrite deux fois, qui diverge au      │
 * │ premier correctif — et c'est toujours la copie qui a l'air d'avoir       │
 * │ raison. Le jour où une lignée de plus doit être fermée, elle l'est ici,  │
 * │ pour les deux chemins.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE JETON ENTRE EN ARGUMENT, PAS LA REQUÊTE.                             │
 * │                                                                          │
 * │ Une route HTTP a sa `Request` ; une Server Action n'en a pas, et         │
 * │ `headers()` de Next.js OMET l'en-tête `cookie` — c'est le piège que      │
 * │ `identifierAppelantAvecCookies` contourne déjà ailleurs. Prendre le      │
 * │ jeton nu évite la question : chaque appelant sait où est le sien, et     │
 * │ la révocation n'a pas à le deviner.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ne lève jamais : une déconnexion doit toujours aboutir. Un jeton déjà
 * expiré n'est pas une anomalie — c'est le cas normal de qui revient après
 * une semaine et clique sur « Sortir ».
 */
export async function revoquerSession(jeton: string | null | undefined): Promise<void> {
  if (!jeton) return;

  // L'appelant est identifié AVANT la révocation : après, son jeton ne vaut
  // plus rien et on ne saurait plus quelles lignées fermer.
  const appelant = await identifierAppelant(
    new Request('http://interne/', { headers: { authorization: `Bearer ${jeton}` } }),
  );

  // La portée `global` invalide toutes les sessions du compte. C'est le
  // comportement attendu d'un « me déconnecter » lorsqu'on soupçonne un vol de
  // jeton, et le seul qui rende la révocation réellement utile.
  const { error } = await createServiceClient().auth.admin.signOut(jeton, 'global');
  if (error) {
    // Un jeton déjà expiré ou inconnu n'est pas une anomalie : on trace sans
    // faire échouer la déconnexion.
    logger.info('Révocation sans effet', { detail: error.message });
  }

  // Les jetons de RAFRAÎCHISSEMENT survivraient à `signOut` du côté de notre
  // table : une lignée laissée ouverte ferait accepter, demain, un jeton
  // qu'une déconnexion était censée annuler.
  if (appelant) {
    await revoquerFamilles(appelant.id, 'deconnexion');
  }
}
