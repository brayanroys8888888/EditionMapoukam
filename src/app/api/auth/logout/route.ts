import { noContent } from '@/lib/http/responses';
import { cookiesEffaces } from '@/lib/auth/cookies';
import { extraireJeton } from '@/lib/auth/session';
import { revoquerSession } from '@/lib/auth/deconnexion';

/**
 * Déconnexion — §4.2 F5.
 *
 * Répond 204 même sans jeton valide : une déconnexion doit toujours aboutir.
 * Renvoyer 401 à qui cherche à partir n'aurait aucun sens et laisserait le
 * navigateur avec ses cookies.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE TRAVAIL EST DANS `revoquerSession`, ET C'EST DÉLIBÉRÉ.               │
 * │                                                                          │
 * │ Cette route a longtemps porté seule la révocation. Le rail               │
 * │ d'administration déconnecte maintenant par une Server Action, qui ne     │
 * │ peut pas appeler une route rendant 204. Les deux passent donc par le     │
 * │ même module — voir `src/lib/auth/deconnexion.ts`, qui porte le           │
 * │ raisonnement et le détail de la révocation.                             │
 * │                                                                          │
 * │ Le contrat de la route ne bouge pas d'un octet : même verbe, même 204,   │
 * │ mêmes cookies effacés. `docs/API-CONTRAT.md` reste juste.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function POST(request: Request): Promise<Response> {
  await revoquerSession(extraireJeton(request));

  return noContent({ cookies: cookiesEffaces() });
}
