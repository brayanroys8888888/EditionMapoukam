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

/**
 * Un appel qui NE REDIRIGE PAS : il rend le code d'erreur, ou `null`.
 *
 * `enregistrerOffre` enchaîne jusqu'à trois écritures ; `appelerRoute`
 * redirigerait après la première et les suivantes ne partiraient jamais.
 */
async function tenter(
  chemin: string,
  methode: 'POST' | 'PATCH' | 'PUT',
  corps: unknown,
  attendu: number,
): Promise<{ code: string | null; corps: Record<string, unknown> | null }> {
  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', cookie: await enteteCookie() },
    body: JSON.stringify(corps),
    cache: 'no-store',
  });

  const details = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;
  if (reponse.status !== attendu) return { code: codeErreur(details), corps: details };
  return { code: null, corps: details };
}

/**
 * ENREGISTRE UNE OFFRE : son identité, puis ses prix.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS ÉCRITURES, ET PAS DE TRANSACTION — ce qui est SANS DANGER ICI.     │
 * │                                                                          │
 * │ L'identité part d'abord, puis un prix par zone renseignée : il n'existe   │
 * │ pas de route qui pose les deux zones d'un coup, et en inventer une pour   │
 * │ l'occasion déplacerait une règle de tarification dans un écran.           │
 * │                                                                          │
 * │ Une interruption entre deux écritures laisse donc une offre à qui il      │
 * │ manque un prix. C'est exactement l'état qu'une offre neuve occupe déjà —  │
 * │ la base REFUSE de mettre en vente une offre sans prix (migration 0068),   │
 * │ et la carte affiche le manque. L'état intermédiaire est visible et        │
 * │ corrigeable ; il n'est jamais silencieux, et rien ne se vend entre-temps. │
 * │                                                                          │
 * │ La première erreur arrête la suite et revient à l'écran : poursuivre      │
 * │ après un refus écrirait des prix sur une offre dont le nom n'a pas été    │
 * │ accepté.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function enregistrerOffre(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/offres`;
  const id = texte(donnees, 'id');

  let cible = id;
  let succes = 'maj';

  if (cible === undefined) {
    /*
     * Pas de champ `actif` à la création : une offre NAÎT HORS VENTE, et la
     * route ne l'accepte même pas autrement. La mettre en vente sans prix la
     * rendrait invisible partout — `offres_publiques` la joint à ses prix et
     * n'en trouverait aucun — et l'éditeur croirait avoir ouvert quelque chose.
     */
    const cree = await tenter(
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
      201,
    );
    if (cree.code !== null) redirect(`${ecran}?erreur=${cree.code}`);

    // `POST /api/admin/offers` rend la LIGNE créée, telle que
    // `admin_creer_offre` la renvoie — donc `id` à la racine, pas sous `offre`.
    const neuf = cree.corps?.['id'];
    // Sans identifiant rendu, les prix n'ont pas de destinataire. L'offre
    // existe : l'éditeur la rouvre et pose ses prix, plutôt qu'un échec muet.
    if (typeof neuf !== 'string') {
      revalidatePath(ecran);
      redirect(`${ecran}?cree=1`);
    }
    cible = neuf;
    succes = 'cree';
  } else {
    /*
     * L'état VOULU de la case part tel quel — jamais « bascule ». Une case
     * décochée n'envoie RIEN en HTML : c'est son absence qui vaut `false`, et
     * c'est pourquoi on lit la présence plutôt qu'une valeur.
     */
    const modifie = await tenter(
      `/api/admin/offers/${cible}`,
      'PATCH',
      {
        libelle_fr: texte(donnees, 'libelle_fr'),
        libelle_en: texte(donnees, 'libelle_en'),
        descriptif_fr: texte(donnees, 'descriptif_fr') ?? '',
        descriptif_en: texte(donnees, 'descriptif_en') ?? '',
        ...(nombre(donnees, 'ordre') !== undefined ? { ordre: nombre(donnees, 'ordre') } : {}),
        actif: donnees.get('actif') === 'oui',
      },
      200,
    );
    if (modifie.code !== null) redirect(`${ecran}?erreur=${modifie.code}`);
  }

  /*
   * Le montant part TEL QUEL, dans la plus petite unité de sa devise : 799
   * pour 7,99 €, 2500 pour 2 500 FCFA. Aucune multiplication ici — le franc
   * CFA n'a pas de sous-unité, et convertir selon la devise serait une règle
   * de tarification écrite dans une action d'écran.
   *
   * Une zone laissée VIDE n'est pas effacée : elle est ignorée. Retirer un
   * prix existant parce qu'un champ est vide ferait disparaître une offre de
   * la vente sur une frappe malheureuse.
   */
  for (const zone of ['afrique', 'international'] as const) {
    const montant = nombre(donnees, `montant_${zone}`);
    if (montant === undefined) continue;

    const pose = await tenter(
      `/api/admin/offers/${cible}/prices`,
      'PUT',
      { zone, montant, devise: texte(donnees, `devise_${zone}`) },
      200,
    );
    if (pose.code !== null) redirect(`${ecran}?erreur=${pose.code}`);
  }

  revalidatePath(ecran);
  redirect(`${ecran}?${succes}=1`);
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
