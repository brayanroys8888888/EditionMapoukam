/**
 * Garde-fou de la console de simulation.
 *
 * CLAUDE.md : « toutes les routes sous /dev sont inaccessibles si
 * NODE_ENV === 'production'. Un test doit le prouver. »
 *
 * La lecture se fait directement dans `process.env`, et non via
 * l'environnement validé et mémorisé : ce garde-fou doit rester exact même si
 * la configuration a été lue avant, et il doit être vérifiable par un test qui
 * bascule la variable.
 *
 * Le refus est un 404, non un 403 : en production, ces routes ne doivent pas
 * seulement être interdites, elles ne doivent pas exister. Un 403 confirmerait
 * à un visiteur qu'une console de simulation est déployée.
 */
export function consoleDisponible(): boolean {
  return process.env['NODE_ENV'] !== 'production';
}

/** Réponse à renvoyer quand la console est indisponible. */
export function reponseIndisponible(): Response {
  return new Response(JSON.stringify({ erreur: { code: 'introuvable', message: 'Ressource introuvable.' } }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Garde des routes d'API de la console.
 *
 * Renvoie `null` quand l'accès est permis, la réponse de refus sinon.
 */
export function garderConsole(): Response | null {
  return consoleDisponible() ? null : reponseIndisponible();
}
