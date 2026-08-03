'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * ACTIONS DU TUNNEL D'ACHAT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLES APPELLENT LES ROUTES, ELLES NE REFONT NI PANIER NI TOTAL.         │
 * │                                                                          │
 * │ La tarification, la zone d'encaissement, les refus de ligne et le calcul │
 * │ du total vivent dans `src/lib/orders` et y restent. Aucune addition      │
 * │ n'est écrite ici — c'est le piège le plus probable de tout ce chantier,  │
 * │ et un test d'architecture échoue sur toute arithmétique portant sur      │
 * │ `prix_unitaire`.                                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

async function appeler(
  chemin: string,
  methode: 'POST' | 'PUT' | 'DELETE',
  charge?: unknown,
): Promise<{ statut: number; corps: Record<string, unknown> | null }> {
  const magasin = await cookies();
  const entete = magasin
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');

  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}${chemin}`, {
    method: methode,
    headers: {
      'content-type': 'application/json',
      // La session voyage par cookie : sans ce report, chaque action serait
      // vue comme un visiteur, et le panier resterait vide sans explication.
      cookie: entete,
    },
    ...(charge === undefined ? {} : { body: JSON.stringify(charge) }),
    cache: 'no-store',
  });

  return {
    statut: reponse.status,
    corps: (await reponse.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

function codeErreur(corps: Record<string, unknown> | null): string {
  const erreur = corps?.['erreur'];
  if (erreur && typeof erreur === 'object' && 'code' in erreur) {
    const code = (erreur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'erreur_interne';
}

/** Chemin courant, pour revenir là où l'on était après une action. */
async function retour(langue: string, defaut: string): Promise<string> {
  const chemin = (await headers()).get('x-chemin');
  return chemin && chemin.startsWith(`/${langue}/`) ? chemin : defaut;
}

// ═══════════════════════════════════════════════════════════════════════════

export async function ajouterAuPanier(
  langueBrute: string,
  livreId: string,
  langueContenu: string,
): Promise<void> {
  const langue = langueValide(langueBrute);

  const reponse = await appeler('/api/cart', 'POST', {
    book_id: livreId,
    langue: langueValide(langueContenu),
  });

  // Un visiteur non connecté est envoyé se connecter, et non laissé devant un
  // bouton qui ne fait rien.
  if (reponse.statut === 401) redirect(`/${langue}/connexion`);
  if (reponse.statut >= 400) {
    redirect(`${await retour(langue, `/${langue}/catalogue`)}?erreur=${codeErreur(reponse.corps)}`);
  }

  redirect(`/${langue}/panier`);
}

export async function retirerDuPanier(langueBrute: string, livreId: string): Promise<void> {
  const langue = langueValide(langueBrute);

  await appeler(`/api/cart/items/${livreId}`, 'DELETE');
  redirect(`/${langue}/panier`);
}

/**
 * Passe la commande, puis mène au règlement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `409 confirmation_requise` N'EST PAS UNE ERREUR À AVALER.               │
 * │                                                                          │
 * │ Il signale que le pays du moyen de paiement change la grille tarifaire.  │
 * │ D4 point 5 : « aucun montant n'est jamais modifié silencieusement ». On  │
 * │ renvoie donc au panier avec le motif, pour que l'écran affiche le        │
 * │ nouveau montant et exige un geste explicite.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function commander(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);

  const promo = donnees.get('code_promo');
  const confirme = donnees.get('total_confirme');

  const reponse = await appeler('/api/orders', 'POST', {
    zone_affichee: 'international',
    ...(typeof promo === 'string' && promo.trim() ? { code_promo: promo.trim() } : {}),
    ...(typeof confirme === 'string' && confirme ? { total_confirme: Number(confirme) } : {}),
  });

  if (reponse.statut === 401) redirect(`/${langue}/connexion`);

  if (reponse.statut !== 201) {
    const parametres = new URLSearchParams({ erreur: codeErreur(reponse.corps) });
    if (typeof promo === 'string' && promo.trim()) parametres.set('promo', promo.trim());

    const total = reponse.corps?.['total'];
    if (typeof total === 'number') parametres.set('a_confirmer', String(total));

    redirect(`/${langue}/panier?${parametres.toString()}`);
  }

  const identifiant = reponse.corps?.['commande_id'];
  if (typeof identifiant !== 'string') redirect(`/${langue}/panier?erreur=erreur_interne`);

  redirect(`/${langue}/paiement/${identifiant}`);
}

/**
 * Règlement SIMULÉ d'une commande.
 *
 * L'événement part vers le vrai gestionnaire de webhooks, qui seul accorde les
 * droits. Cette action n'octroie rien et ne peut rien octroyer — c'est la
 * règle 5 de CLAUDE.md, tenue jusque dans l'interface.
 */
export async function reglerCommande(
  langueBrute: string,
  commandeId: string,
  issue: 'reussi' | 'echoue' | 'abandonne',
): Promise<void> {
  const langue = langueValide(langueBrute);

  await appeler('/api/paiement-simule', 'POST', { commande_id: commandeId, issue });

  // On revient sur l'écran de règlement, qui RELIT la commande. Le statut
  // affiché est celui de la base, jamais celui que cette action espérait.
  redirect(`/${langue}/paiement/${commandeId}`);
}
