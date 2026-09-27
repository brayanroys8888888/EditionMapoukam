'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * LE REMBOURSEMENT D'UNE COMMANDE — action d'écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE APPELLE LA ROUTE. ELLE NE TOUCHE PAS LA BASE.                      │
 * │                                                                          │
 * │ Même raison que partout ailleurs dans l'administration : elle passe par  │
 * │ `service_role`, donc RLS est contourné par construction. Une action qui  │
 * │ écrirait directement le ferait sans acteur, et le journal cesserait de   │
 * │ dire QUI a remboursé — sur l'écran qui touche à l'argent, c'est la       │
 * │ dernière trace qu'on veut perdre.                                        │
 * │                                                                          │
 * │ Le cookie de session part tel quel ; c'est lui, et lui seul, qui désigne │
 * │ l'acteur côté route. Aucun identifiant d'administrateur ne circule dans  │
 * │ ce corps.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les quatre motifs, tels que l'énumération de la 0091 les nomme. */
const MOTIFS = new Set([
  'demande_client',
  'paiement_double',
  'fichier_defectueux',
  'geste_commercial',
]);

async function enteteCookie(): Promise<string> {
  const magasin = await cookies();
  return magasin
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
}

function codeErreur(corps: Record<string, unknown> | null): string {
  const erreur = corps?.['erreur'];
  if (erreur && typeof erreur === 'object' && 'code' in erreur) {
    const code = (erreur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'erreur_interne';
}

/** Le filtre courant, reporté d'un envoi à l'autre. */
function suffixeFiltres(donnees: FormData): string {
  const parametres = new URLSearchParams();
  for (const nom of ['statut', 'devise', 'q']) {
    const valeur = donnees.get(nom);
    if (typeof valeur === 'string' && valeur.trim() !== '') parametres.set(nom, valeur.trim());
  }
  const chaine = parametres.toString();
  return chaine ? `&${chaine}` : '';
}

/**
 * Rembourse, avec son motif.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE PANNEAU SE REFERME, ET LES FILTRES SURVIVENT.                        │
 * │                                                                          │
 * │ Une file de remboursements se traite du haut vers le bas, comme une file │
 * │ de modération. Renvoyer l'éditeur sur la liste complète après chaque     │
 * │ décision lui ferait rechercher sa place à chaque commande traitée.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function rembourser(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/commandes`;
  const suffixe = suffixeFiltres(donnees);

  const id = donnees.get('commande');
  const motif = donnees.get('motif');

  if (typeof id !== 'string' || id === '') redirect(`${ecran}?erreur=requete_invalide${suffixe}`);
  /*
   * Le motif est vérifié ICI aussi, et ce n'est pas une redondance inutile :
   * la liste est courte, close, et elle produit un texte que le CLIENT lira.
   * Laisser passer une valeur inattendue jusqu'à la base pour qu'elle la
   * refuse donnerait une erreur interne là où il faut une phrase claire.
   */
  if (typeof motif !== 'string' || !MOTIFS.has(motif)) {
    redirect(`${ecran}?erreur=requete_invalide&commande=${encodeURIComponent(id)}${suffixe}`);
  }

  const reponse = await fetch(
    `${getServerEnv().NEXT_PUBLIC_APP_URL}/api/admin/orders/${encodeURIComponent(id)}/refund`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await enteteCookie() },
      body: JSON.stringify({ motif }),
      cache: 'no-store',
    },
  );

  if (reponse.status !== 200) {
    const details = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;
    redirect(
      `${ecran}?erreur=${codeErreur(details)}&commande=${encodeURIComponent(id)}${suffixe}`,
    );
  }

  revalidatePath(ecran);
  redirect(`${ecran}?rembourse=1${suffixe}`);
}
