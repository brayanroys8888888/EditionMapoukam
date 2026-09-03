'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * LES OFFRES D'ABONNEMENT — actions d'écran, §4.3 F12 bis.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES ACTIONS APPELLENT LES ROUTES. ELLES NE TOUCHENT PAS LA BASE.        │
 * │                                                                          │
 * │ Comme celles des promos et du catalogue, et pour la même raison :         │
 * │ l'administration passe par `service_role`, donc RLS est contourné par     │
 * │ construction. Une action serveur qui écrirait directement le ferait sans  │
 * │ acteur, et le journal d'audit cesserait de dire QUI a mis une offre en    │
 * │ vente — c'est-à-dire qui a changé le prix payé par des clients.           │
 * │                                                                          │
 * │ Le cookie de session est transmis tel quel : c'est lui, et lui seul, qui  │
 * │ identifie l'acteur côté route. Aucun `user_id` ne circule dans ces corps. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE DE CES ACTIONS NE JUGE DE CE QU'UNE OFFRE OUVRE.                 │
 * │                                                                          │
 * │ Elles transportent un `domaine` — `lecture` ou `association` — jusqu'à    │
 * │ la base, qui le recopie sur l'abonnement au moment de la souscription.    │
 * │ Ce que chacun de ces deux mots ouvre est écrit une fois, dans             │
 * │ `abonnement_ouvre_droit`, et l'étanchéité de §3.6 en découle. Créer une   │
 * │ offre ne crée jamais un droit ; elle vend un droit qui existe déjà.       │
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

/** Texte lu d'un formulaire, ou `undefined` si le champ est laissé vide. */
function texte(donnees: FormData, nom: string): string | undefined {
  const valeur = donnees.get(nom);
  if (typeof valeur !== 'string' || valeur.trim() === '') return undefined;
  return valeur.trim();
}

function nombre(donnees: FormData, nom: string): number | undefined {
  const brut = texte(donnees, nom);
  if (brut === undefined) return undefined;
  const converti = Number(brut);
  return Number.isFinite(converti) ? converti : undefined;
}

/**
 * Un appel à une route d'administration, et le retour à l'écran.
 *
 * Le succès et l'échec reviennent au MÊME écran, avec un paramètre qui dit
 * lequel : un back-office sans JavaScript client n'a pas d'autre moyen de
 * rendre un message, et laisser l'éditeur sur une page d'erreur nue lui ferait
 * perdre ce qu'il venait de saisir.
 */
async function appelerRoute(
  ecran: string,
  chemin: string,
  methode: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  corps: unknown,
  succes: string,
  attendu: number,
): Promise<never> {
  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}${chemin}`, {
    method: methode,
    headers: {
      'content-type': 'application/json',
      cookie: await enteteCookie(),
    },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    cache: 'no-store',
  });

  if (reponse.status !== attendu) {
    // `204` n'a pas de corps ; `json()` y échouerait sans que ce soit une
    // erreur. Le `catch` couvre les deux cas d'un même geste.
    const details = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;
    redirect(`${ecran}?erreur=${codeErreur(details)}`);
  }

  revalidatePath(ecran);
  redirect(`${ecran}?${succes}=1`);
}

export async function creerOffre(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/offres`;

  /*
   * Pas de champ `actif` : une offre NAÎT HORS VENTE, et la route ne l'accepte
   * même pas. Mettre en vente une offre encore sans prix la rendrait invisible
   * partout — `offres_publiques` la joint à ses prix et n'en trouverait aucun
   * — et l'éditeur croirait avoir ouvert quelque chose que personne ne voit.
   */
  await appelerRoute(
    ecran,
    '/api/admin/offers',
    'POST',
    {
      code: texte(donnees, 'code'),
      domaine: texte(donnees, 'domaine'),
      periode: texte(donnees, 'periode'),
      libelle_fr: texte(donnees, 'libelle_fr'),
      libelle_en: texte(donnees, 'libelle_en'),
      ...(texte(donnees, 'descriptif_fr') !== undefined
        ? { descriptif_fr: texte(donnees, 'descriptif_fr') }
        : {}),
      ...(texte(donnees, 'descriptif_en') !== undefined
        ? { descriptif_en: texte(donnees, 'descriptif_en') }
        : {}),
      ordre: nombre(donnees, 'ordre') ?? 0,
    },
    'cree',
    201,
  );
}

/**
 * Met une offre en vente, ou l'en retire.
 *
 * L'écran envoie l'état VOULU, jamais « bascule » : deux onglets ouverts sur la
 * même liste inverseraient sinon deux fois de suite un drapeau que l'éditeur
 * n'a touché qu'une fois.
 *
 * Le refus d'activer une offre sans prix vient de la base — `admin_modifier_offre`
 * le nomme —, et cette action ne le rejoue pas.
 */
export async function changerVente(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/offres`;

  await appelerRoute(
    ecran,
    `/api/admin/offers/${texte(donnees, 'id') ?? ''}`,
    'PATCH',
    { actif: donnees.get('actif') === 'oui' },
    'maj',
    200,
  );
}

export async function poserPrix(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/offres`;

  /*
   * Le montant part TEL QUEL, dans la plus petite unité de sa devise : 799
   * pour 7,99 €, 2500 pour 2 500 FCFA. Aucune multiplication ici — le franc
   * CFA n'a pas de sous-unité, et diviser ou multiplier par cent selon la
   * devise serait une règle de conversion écrite dans un écran.
   */
  await appelerRoute(
    ecran,
    `/api/admin/offers/${texte(donnees, 'id') ?? ''}/prices`,
    'PUT',
    {
      zone: texte(donnees, 'zone'),
      montant: nombre(donnees, 'montant'),
      devise: texte(donnees, 'devise'),
    },
    'prix',
    200,
  );
}

export async function supprimerOffre(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/offres`;

  // La base refuse une offre déjà souscrite. Le refus revient en 422, et
  // l'écran affiche « action_impossible » avec l'aide qui dit quoi faire à la
  // place : la retirer de la vente.
  await appelerRoute(
    ecran,
    `/api/admin/offers/${texte(donnees, 'id') ?? ''}`,
    'DELETE',
    undefined,
    'supprime',
    204,
  );
}
