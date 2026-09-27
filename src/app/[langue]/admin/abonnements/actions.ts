'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * RÉSILIER, OU REVENIR SUR UNE RÉSILIATION — actions d'écran.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLES APPELLENT LA ROUTE. ELLES NE TOUCHENT NI LA BASE NI LE            │
 * │ PRESTATAIRE.                                                             │
 * │                                                                          │
 * │ La route parle au prestataire ; c'est l'événement signé qui changera le  │
 * │ statut. L'écran, lui, ne fait que transporter une intention — et le      │
 * │ cookie de session, qui désigne l'acteur pour l'audit.                    │
 * │                                                                          │
 * │ Conséquence visible, et voulue : après le clic, l'abonnement n'a PAS     │
 * │ encore changé d'état. Le message de retour le dit, plutôt que de laisser │
 * │ l'éditeur croire à un échec.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

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

/** Les filtres courants, reportés pour que l'éditeur ne perde pas sa place. */
function suffixeFiltres(donnees: FormData): string {
  const parametres = new URLSearchParams();
  for (const nom of ['statut', 'domaine', 'q']) {
    const valeur = donnees.get(nom);
    if (typeof valeur === 'string' && valeur.trim() !== '') parametres.set(nom, valeur.trim());
  }
  const chaine = parametres.toString();
  return chaine ? `&${chaine}` : '';
}

/**
 * Demande la résiliation à la fin de la période, ou son annulation.
 *
 * Le geste est lu dans le formulaire plutôt que porté par deux fonctions : les
 * deux boutons ne diffèrent que par un mot, et deux actions jumelles auraient
 * fini par diverger sur le report des filtres ou le code d'erreur.
 */
export async function resilier(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/abonnements`;
  const suffixe = suffixeFiltres(donnees);

  const id = donnees.get('abonnement');
  const geste = donnees.get('geste');

  if (typeof id !== 'string' || id === '') redirect(`${ecran}?erreur=requete_invalide${suffixe}`);
  if (geste !== 'resilier' && geste !== 'reprendre') {
    redirect(`${ecran}?erreur=requete_invalide${suffixe}`);
  }

  const reponse = await fetch(
    `${getServerEnv().NEXT_PUBLIC_APP_URL}/api/admin/subscriptions/${encodeURIComponent(
      id,
    )}/resiliation`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await enteteCookie() },
      body: JSON.stringify({ geste }),
      cache: 'no-store',
    },
  );

  if (reponse.status !== 200) {
    const details = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;
    redirect(
      `${ecran}?erreur=${codeErreur(details)}&abonnement=${encodeURIComponent(id)}${suffixe}`,
    );
  }

  revalidatePath(ecran);
  /*
   * Le panneau reste OUVERT : la demande est partie, mais le statut ne changera
   * qu'à l'arrivée de l'événement. Refermer donnerait à croire que c'est fait.
   */
  redirect(`${ecran}?${geste === 'resilier' ? 'resilie' : 'repris'}=1&abonnement=${encodeURIComponent(id)}${suffixe}`);
}
