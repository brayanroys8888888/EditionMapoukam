import { getClock } from '@/lib/clock';

/**
 * L'instant de l'horloge métier.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'INTERFACE NE COMPARE JAMAIS UNE DATE DE L'API À CELLE DU NAVIGATEUR.  │
 * │                                                                          │
 * │ Sous horloge simulée — ce que fait la console `/dev` à chaque scénario   │
 * │ d'abonnement — l'horloge du navigateur n'est pas celle du serveur. Un    │
 * │ abonnement « qui expire dans trois jours » s'afficherait comme expiré     │
 * │ depuis six mois, et personne ne comprendrait pourquoi.                   │
 * │                                                                          │
 * │ Toute date de référence vient donc d'ici. C'est la seule route dont      │
 * │ l'existence est justifiée par un dispositif de TEST — et c'est assumé :   │
 * │ un dispositif de test qui rend l'interface fausse n'est pas un           │
 * │ dispositif de test, c'est un défaut.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Publique : elle ne révèle rien qu'une en-tête `Date` HTTP ne révèle déjà.
 */
export function GET(): Response {
  return new Response(JSON.stringify({ maintenant: getClock().now().toISOString() }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Jamais mise en cache : c'est précisément la valeur qui bouge.
      'cache-control': 'no-store',
    },
  });
}
