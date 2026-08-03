import { NextResponse, type NextRequest } from 'next/server';

import { LANGUES_INTERFACE, LANGUE_PAR_DEFAUT, langueValide, type LangueInterface } from '@/i18n';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { doitRafraichir } from '@/lib/auth/echeance';

/**
 * Enveloppe de chaque requête de navigation : LANGUE, puis SESSION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE RAFRAÎCHISSEMENT VIT ICI, ET NON DANS LE LECTEUR.                    │
 * │                                                                          │
 * │ Le placer dans le lecteur aurait paru naturel — c'est là qu'une session  │
 * │ longue se joue. Ç'aurait été un défaut de conception : chaque écran      │
 * │ aurait fini par porter sa propre logique de reprise, et le lecteur       │
 * │ n'est de toute façon PAS l'endroit où la perte de session se voit.       │
 * │ `/api/books/[id]/pages/[page]` est publique : un jeton mort y vaut       │
 * │ « visiteur », et l'enfant reçoit « achetez ce titre » sur un conte que   │
 * │ ses parents ont acheté (établi par tests/e2e/session-longue).            │
 * │                                                                          │
 * │ La session est donc surveillée AU-DESSUS de tous les écrans, sur chaque  │
 * │ navigation, et PRÉVENTIVEMENT — jamais en réaction à un premier échec.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Chemins servis tels quels : pas de préfixe de langue, pas de session. */
const HORS_PERIMETRE = ['/api', '/dev', '/_next', '/favicon.ico', '/robots.txt', '/sitemap.xml'];

function horsPerimetre(chemin: string): boolean {
  return HORS_PERIMETRE.some((prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`));
}

/** Langue déjà présente en tête du chemin, ou `null`. */
function languePrefixee(chemin: string): LangueInterface | null {
  const premier = chemin.split('/')[1] ?? '';
  return LANGUES_INTERFACE.includes(premier as LangueInterface)
    ? (premier as LangueInterface)
    : null;
}

/**
 * Langue à retenir pour une requête sans préfixe.
 *
 * Trois sources, dans cet ordre — de la plus explicite à la plus devinée :
 * la préférence enregistrée du compte, l'en-tête du navigateur, puis le
 * français. Aucune n'est digne de confiance en tant que telle : `langueValide`
 * replie tout ce qui n'est pas une langue connue.
 */
function langueDeducte(requete: NextRequest): LangueInterface {
  const preferee = requete.cookies.get('contes_langue')?.value;
  if (preferee) return langueValide(preferee);

  const entete = requete.headers.get('accept-language') ?? '';
  for (const morceau of entete.split(',')) {
    const code = morceau.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (code && LANGUES_INTERFACE.includes(code as LangueInterface)) {
      return code as LangueInterface;
    }
  }

  return LANGUE_PAR_DEFAUT;
}

/**
 * Rafraîchit la session si le jeton approche de son échéance.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ÉCHEC DE RAFRAÎCHISSEMENT NE BLOQUE JAMAIS LA NAVIGATION.            │
 * │                                                                          │
 * │ Le catalogue, la fiche et l'extrait sont publics : un visiteur doit      │
 * │ pouvoir les parcourir, et une session morte le ramène simplement à       │
 * │ l'état de visiteur. Renvoyer tout le monde vers la connexion parce qu'un │
 * │ cookie a expiré fermerait la vitrine.                                    │
 * │                                                                          │
 * │ Le seul cas nommé est la RÉVOCATION POUR VOL : elle est portée jusqu'à   │
 * │ l'écran par un paramètre, pour que l'interface dise autre chose qu'un    │
 * │ « session expirée » générique. C'est ce qui amènera la victime à changer │
 * │ son mot de passe — voir `src/app/api/auth/refresh/route.ts`.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
async function rafraichirSiNecessaire(
  requete: NextRequest,
  reponse: NextResponse,
): Promise<'inchange' | 'rafraichi' | 'revoquee'> {
  const acces = requete.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const rafraichissement = requete.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  // Aucun jeton de rafraîchissement : c'est un visiteur, pas une anomalie.
  if (!rafraichissement) return 'inchange';

  // L'échéance d'un jeton est appliquée en HEURE RÉELLE par le fournisseur.
  // C'est le seul endroit du frontend où la comparer à l'heure réelle est
  // juste (docs/PLAN.md §5 duodecies).
  if (!doitRafraichir(acces, Math.floor(Date.now() / 1000))) return 'inchange';

  const appel = await fetch(new URL('/api/auth/refresh', requete.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: rafraichissement }),
  }).catch(() => null);

  // Réseau indisponible : on laisse passer. La page s'affichera en visiteur si
  // le jeton est réellement mort, et les cookies restent en place pour la
  // tentative suivante — les effacer ici priverait d'une session encore
  // valable un utilisateur simplement hors ligne un instant.
  if (!appel) return 'inchange';

  // Les cookies posés par la route sont recopiés sur la réponse de navigation :
  // sans cela, le jeton neuf resterait dans une réponse que personne ne lit.
  for (const cookie of appel.headers.getSetCookie()) {
    reponse.headers.append('set-cookie', cookie);
  }

  if (appel.ok) return 'rafraichi';

  const corps = (await appel.json().catch(() => null)) as
    | { erreur?: { code?: string } }
    | null;

  return corps?.erreur?.code === 'session_revoquee' ? 'revoquee' : 'inchange';
}

export async function middleware(requete: NextRequest): Promise<NextResponse> {
  const { pathname, search } = requete.nextUrl;

  if (horsPerimetre(pathname)) return NextResponse.next();

  // ── Langue ───────────────────────────────────────────────────────────────
  const prefixe = languePrefixee(pathname);

  if (!prefixe) {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ REDIRECTION, ET NON RÉÉCRITURE SILENCIEUSE.                        │
    // │                                                                    │
    // │ §5.4 exige des URL « lisibles et structurées par langue » et des    │
    // │ balises `hreflang`. Une réécriture servirait deux langues sous la   │
    // │ même adresse : les moteurs n'en indexeraient qu'une, et un lien     │
    // │ partagé n'emporterait pas la langue de son auteur.                  │
    // └────────────────────────────────────────────────────────────────────┘
    const langue = langueDeducte(requete);
    const cible = new URL(`/${langue}${pathname === '/' ? '' : pathname}${search}`, requete.url);
    return NextResponse.redirect(cible);
  }

  // ┌──────────────────────────────────────────────────────────────────────┐
  // │ LE CHEMIN EST TRANSMIS À L'ENVELOPPE, QUI NE PEUT PAS LE CONNAÎTRE.  │
  // │                                                                      │
  // │ `headers()` ne porte pas l'URL demandée, et un composant serveur n'a  │
  // │ pas accès à la requête. Sans ces en-têtes, le sélecteur de langue ne  │
  // │ saurait pas quelle page reconstruire — et renverrait à l'accueil, ce  │
  // │ qui est précisément le défaut qu'on veut éviter.                      │
  // └──────────────────────────────────────────────────────────────────────┘
  const entetes = new Headers(requete.headers);
  entetes.set('x-langue', prefixe);
  entetes.set('x-chemin', pathname);
  entetes.set('x-requete', search);

  const reponse = NextResponse.next({ request: { headers: entetes } });

  // La langue de l'URL fait foi et devient la préférence : elle est le choix
  // le plus explicite que l'utilisateur puisse exprimer.
  reponse.cookies.set('contes_langue', prefixe, {
    path: '/',
    maxAge: 365 * 24 * 3600,
    sameSite: 'lax',
    // Lisible par le JavaScript de page, délibérément : ce n'est pas un
    // secret, et le sélecteur de langue doit pouvoir le poser sans requête.
    httpOnly: false,
  });

  // ── Session ──────────────────────────────────────────────────────────────
  const etat = await rafraichirSiNecessaire(requete, reponse);

  if (etat === 'revoquee') {
    const cible = new URL(`/${prefixe}/connexion`, requete.url);
    // Porté jusqu'à l'écran : F3 affichera le message de sécurité, et non un
    // « session expirée » qui laisserait la victime se reconnecter sans jamais
    // savoir qu'elle a été compromise.
    cible.searchParams.set('motif', 'session_revoquee');

    const redirection = NextResponse.redirect(cible);
    for (const cookie of reponse.headers.getSetCookie()) {
      redirection.headers.append('set-cookie', cookie);
    }
    return redirection;
  }

  return reponse;
}

export const config = {
  /**
   * Tout sauf les fichiers statiques et les routes d'API.
   *
   * Le filtre est répété dans `horsPerimetre` : ce motif épargne l'exécution
   * du middleware, la fonction épargne un traitement erroné si le motif change.
   * Deux gardes valent mieux qu'une quand l'une est une expression régulière.
   */
  matcher: ['/((?!api|dev|_next/static|_next/image|favicon.ico).*)'],
};
