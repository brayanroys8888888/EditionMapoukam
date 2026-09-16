import { getServerEnv } from '@/lib/config/env';
import { errors } from '@/lib/http/responses';

/**
 * ROUTES DE BETTER AUTH — montées seulement quand c'est lui qui sert.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ADRESSE DE RAPPEL DE GOOGLE ABOUTIT ICI, ET NULLE PART AILLEURS.      │
 * │                                                                          │
 * │ `/api/better-auth/callback/google` est déclarée dans la console Google : │
 * │ c'est l'adresse à laquelle le fournisseur renvoie le code d'autorisation │
 * │ sous `AUTH_GOOGLE=better-auth`. Sous les deux autres modes, ces routes   │
 * │ répondent 404 — une surface d'authentification qui reste ouverte sans    │
 * │ que rien ne s'en serve est une surface qu'on oublie de surveiller.       │
 * │                                                                          │
 * │ Le gestionnaire est appelé directement plutôt que par `toNextJsHandler`. │
 * │ Les deux sont équivalents ; celui-ci rend une `Response` dont NOUS       │
 * │ posons les cookies, sans dépendre du contexte asynchrone de Next — ce    │
 * │ qui rend la route appelable telle quelle par un test, comme toutes les   │
 * │ autres de ce dépôt.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function servir(request: Request): Promise<Response> {
  if (getServerEnv().AUTH_GOOGLE !== 'better-auth') return errors.introuvable();

  const { obtenirBetterAuth } = await import('@/lib/auth/better-auth');
  return obtenirBetterAuth().handler(request);
}

export const GET = servir;
export const POST = servir;
