import { z } from 'zod';

import { errors, ok } from '@/lib/http/responses';
import { REFRESH_TOKEN_COOKIE, cookiesDeSession, cookiesEffaces, lireCookie } from '@/lib/auth/cookies';
import { rafraichir } from '@/lib/auth/refresh';
import { adresseAppelant, RateLimiter } from '@/lib/http/rate-limit';
import { logger } from '@/lib/logger';

/**
 * Rafraîchissement de session — §4.2 F5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE ROUTE MÉRITE LE MÊME SOIN QUE LE GESTIONNAIRE DE WEBHOOKS, ET     │
 * │ POUR LA MÊME RAISON : ELLE ACCEPTE UN SECRET PORTEUR DE DROITS.         │
 * │                                                                          │
 * │ Un jeton de rafraîchissement vaut trente jours d'accès à un compte, à sa │
 * │ bibliothèque et à son moyen de paiement. C'est le secret le plus         │
 * │ durable que la plateforme émette — plus durable qu'un mot de passe, qui  │
 * │ se change.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Trois dispositifs, aucun suffisant seul :
 *
 *  1. **Rotation** — chaque échange consomme le jeton présenté et en émet un
 *     autre. Un jeton intercepté n'a donc de valeur que jusqu'au prochain
 *     rafraîchissement de sa victime.
 *  2. **Détection de réutilisation** — un jeton rejoué hors course tue la
 *     lignée ENTIÈRE. C'est ce qui transforme la rotation en dispositif de
 *     détection : sans elle, le voleur et la victime alterneraient
 *     indéfiniment sans que rien ne l'apprenne à personne.
 *  3. **Limitation de débit** — voir plus bas.
 */

/**
 * Quota.
 *
 * Un client légitime rafraîchit une fois par heure, deux ou trois s'il a
 * plusieurs onglets. Vingt par quart d'heure et par adresse est très au-dessus
 * de tout usage réel, et très en dessous de ce qu'exigerait l'essai de jetons
 * au hasard.
 *
 * La clé est l'ADRESSE, non le compte : à ce stade, l'appelant n'est pas encore
 * identifié — c'est précisément ce que la requête cherche à établir. Une clé
 * par compte serait fournie par l'attaquant lui-même.
 */
const QUOTA = { limite: 20, fenetreMs: 15 * 60 * 1000 } as const;

const limiteur = new RateLimiter();

/** Réservé aux tests : le quota vit en mémoire du processus. */
export function reinitialiserQuotaRafraichissement(): void {
  limiteur.vider();
}

/**
 * Le jeton vient du cookie, ou du corps pour un appelant programmatique.
 *
 * Le cookie est `HttpOnly` : un navigateur ne peut pas le lire, et n'a donc
 * rien à transmettre. Le corps sert aux clients qui ont reçu le jeton dans la
 * réponse de connexion — tests d'intégration compris.
 */
const corpsSchema = z.object({
  refresh_token: z.string().min(10).max(4096).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const quota = limiteur.consommer(adresseAppelant(request), QUOTA);
  if (!quota.autorise) {
    return errors.tropDeRequetes(quota.retryAfter);
  }

  // Un corps vide est le cas NORMAL — le navigateur envoie son cookie et rien
  // d'autre. Il ne doit donc pas être traité comme une requête malformée.
  let corps: { refresh_token?: string } = {};
  const texte = await request.text();
  if (texte.trim().length > 0) {
    let brut: unknown;
    try {
      brut = JSON.parse(texte);
    } catch {
      return errors.corpsIllisible();
    }
    const parsed = corpsSchema.safeParse(brut);
    if (!parsed.success) {
      return errors.validation({ refresh_token: ['Jeton de rafraîchissement invalide.'] });
    }
    corps = parsed.data;
  }

  const jeton = corps.refresh_token ?? lireCookie(request, REFRESH_TOKEN_COOKIE);
  if (!jeton) {
    return errors.nonAuthentifie();
  }

  const resultat = await rafraichir(jeton);

  if (!resultat.ok) {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ TOUS LES REFUS EFFACENT LES COOKIES.                                 │
    // │                                                                      │
    // │ Laisser un cookie mort en place condamne le navigateur à rejouer le  │
    // │ même jeton refusé à chaque navigation — ce qui, hors tolérance, se   │
    // │ lit comme une réutilisation et tuerait la lignée suivante.           │
    // └──────────────────────────────────────────────────────────────────────┘
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ DEUX MOTIFS MÈNENT AU MESSAGE DE SÉCURITÉ, ET LE SECOND EST LE PLUS │
    // │ IMPORTANT DES DEUX.                                                  │
    // │                                                                      │
    // │   `reutilisation`    — l'appelant vient de DÉCLENCHER la détection.  │
    // │                        Dans le seul scénario qui compte, c'est le    │
    // │                        voleur.                                        │
    // │   `revoque_pour_vol` — l'appelant arrive APRÈS, sur une lignée déjà  │
    // │                        tuée. C'est la VICTIME, et c'est elle qui doit │
    // │                        changer son mot de passe.                     │
    // │                                                                      │
    // │ Ne traiter que le premier laissait la victime devant un « session    │
    // │ expirée » générique : elle se reconnectait sans jamais savoir.       │
    // │                                                                      │
    // │ Le code `session_revoquee` est ce sur quoi l'interface branche       │
    // │ (étape F2) — jamais sur le texte du message.                          │
    // └──────────────────────────────────────────────────────────────────────┘
    const compromise =
      resultat.raison === 'reutilisation' || resultat.raison === 'revoque_pour_vol';

    const erreur = compromise
      ? {
          code: 'session_revoquee',
          message:
            'Votre session a été fermée par sécurité : un identifiant de connexion a été réutilisé. Reconnectez-vous, et changez votre mot de passe si vous ne reconnaissez pas cette activité.',
        }
      : { code: 'session_expiree', message: 'Votre session a expiré. Reconnectez-vous.' };

    logger.info('Rafraîchissement refusé', { raison: resultat.raison });

    return new Response(JSON.stringify({ erreur }), {
      status: 401,
      headers: entetesAvecCookies(cookiesEffaces()),
    });
  }

  return ok(
    {
      expires_in: resultat.session.expiresIn,
      // Rendus au client programmatique, qui ne dispose pas des cookies. Un
      // navigateur les ignore : ses cookies viennent d'être reposés.
      access_token: resultat.session.accessToken,
      refresh_token: resultat.session.refreshToken,
    },
    {
      cookies: cookiesDeSession({
        access_token: resultat.session.accessToken,
        refresh_token: resultat.session.refreshToken,
        expires_in: resultat.session.expiresIn,
      }),
    },
  );
}

/** Un `Headers` portant plusieurs `set-cookie`, ce qu'un objet simple ne permet pas. */
function entetesAvecCookies(cookies: readonly string[]): Headers {
  const entetes = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  for (const cookie of cookies) entetes.append('set-cookie', cookie);
  return entetes;
}
