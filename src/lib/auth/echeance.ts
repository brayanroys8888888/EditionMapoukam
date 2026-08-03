/**
 * Échéance d'un jeton d'accès, lue SANS vérification de signature.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LIRE N'EST PAS FAIRE CONFIANCE, ET LA DISTINCTION EST TOUT LE SUJET.    │
 * │                                                                          │
 * │ Ce module décode la charge utile d'un JWT sans en vérifier la signature. │
 * │ Cela paraît contredire la règle 4 de CLAUDE.md — « jamais de confiance   │
 * │ accordée à un état transmis par le client ».                             │
 * │                                                                          │
 * │ Ce n'en est pas une, parce que la valeur lue ne décide d'AUCUN droit.    │
 * │ Elle décide seulement du MOMENT où l'on va demander un rafraîchissement. │
 * │ Un jeton falsifié annonçant une échéance lointaine ne gagne rien : il    │
 * │ sera refusé par Supabase Auth à la première requête gardée, exactement   │
 * │ comme aujourd'hui. Un jeton annonçant une échéance proche ne coûte qu'un │
 * │ rafraîchissement inutile, que la rotation absorbe.                       │
 * │                                                                          │
 * │ L'autorité sur la validité reste entière du côté du fournisseur. Ce      │
 * │ module ne fait qu'éviter d'attendre son refus pour agir.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Marge avant échéance, en secondes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CINQ MINUTES, ET C'EST LA CONNEXION LENTE QUI FIXE CE CHIFFRE.          │
 * │                                                                          │
 * │ Réagir au premier 401 arrive déjà trop tard : la requête est partie, la  │
 * │ page est en vol, et l'enfant attend devant un écran qui ne dit rien.     │
 * │ Sur les connexions que §5.1 décrit comme la condition réelle d'une       │
 * │ partie du public, un aller-retour de rafraîchissement peut prendre       │
 * │ plusieurs secondes — pendant lesquelles la lecture doit continuer.       │
 * │                                                                          │
 * │ Cinq minutes laissent la place à plusieurs tentatives avant l'échéance,  │
 * │ sans rafraîchir à tout propos : sur un jeton d'une heure, cela fait un   │
 * │ renouvellement par heure, pas un par page.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const MARGE_PREVENTIVE_SECONDES = 300;

/**
 * Instant d'expiration d'un jeton, en secondes depuis l'époque Unix.
 *
 * Rend `null` sur tout ce qui n'est pas un JWT lisible — chaîne vide, format
 * inattendu, charge utile illisible, `exp` absent. L'appelant traite alors le
 * jeton comme échu : **le doute joue en faveur du rafraîchissement**, jamais
 * en faveur du maintien d'une session dont on ne sait rien.
 */
export function echeance(jeton: string | null | undefined): number | null {
  if (!jeton) return null;

  const parties = jeton.split('.');
  if (parties.length !== 3) return null;

  const charge = parties[1];
  if (!charge) return null;

  try {
    // Base64 URL : le JWT remplace `+` et `/`, et retire le remplissage.
    const normalise = charge.replace(/-/g, '+').replace(/_/g, '/');
    const complete = normalise.padEnd(Math.ceil(normalise.length / 4) * 4, '=');
    const decode = JSON.parse(
      Buffer.from(complete, 'base64').toString('utf8'),
    ) as unknown;

    if (typeof decode !== 'object' || decode === null) return null;
    const exp = (decode as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

/**
 * Faut-il rafraîchir maintenant ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `maintenantSecondes` EST L'HEURE RÉELLE, et c'est le seul endroit du    │
 * │ frontend où elle est légitime.                                           │
 * │                                                                          │
 * │ L'échéance d'un jeton est appliquée par Supabase Auth en heure réelle    │
 * │ (docs/PLAN.md §5 duodecies). La comparer à l'horloge métier ferait       │
 * │ diverger la décision de l'autorité qu'elle anticipe : sous horloge       │
 * │ avancée de trente jours, tout jeton paraîtrait échu et l'interface       │
 * │ rafraîchirait en boucle.                                                 │
 * │                                                                          │
 * │ Partout ailleurs — dates d'abonnement, fenêtre de nouveauté, reprise de  │
 * │ lecture — c'est `GET /api/time` qui fait foi.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function doitRafraichir(
  jeton: string | null | undefined,
  maintenantSecondes: number,
  marge: number = MARGE_PREVENTIVE_SECONDES,
): boolean {
  const fin = echeance(jeton);
  // Jeton illisible : on rafraîchit. Le doute ne maintient jamais une session.
  if (fin === null) return true;
  return fin - maintenantSecondes <= marge;
}
