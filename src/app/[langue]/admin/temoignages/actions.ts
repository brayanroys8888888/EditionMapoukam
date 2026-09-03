'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * LES TÉMOIGNAGES DU SITE — actions d'écran, migration 0073.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES ACTIONS APPELLENT LES ROUTES. ELLES NE TOUCHENT PAS LA BASE.        │
 * │                                                                          │
 * │ L'administration passe par `service_role`, donc RLS est contourné par     │
 * │ construction. Une action qui écrirait directement le ferait sans acteur,  │
 * │ et le journal cesserait de dire QUI a changé le texte de l'accueil.       │
 * │                                                                          │
 * │ Le cookie de session part tel quel ; c'est lui, et lui seul, qui désigne  │
 * │ l'acteur côté route.                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉCRAN ENVOIE TOUJOURS LES DEUX LANGUES, ET C'EST DÉLIBÉRÉ.            │
 * │                                                                          │
 * │ `admin_enregistrer_temoignage` traite une langue ABSENTE du tableau comme │
 * │ « laisse-la tranquille », et une langue au texte VIDE comme « supprime-la ».│
 * │ Un formulaire sans JavaScript renvoie tous ses champs à chaque envoi :     │
 * │ vider la zone anglaise est donc le geste qui retire la version anglaise,   │
 * │ et l'aide du champ le dit mot pour mot.                                    │
 * │                                                                          │
 * │ C'est aussi pourquoi l'écran lit le DÉTAIL de chaque témoignage et non la  │
 * │ ligne de liste : celle-ci ne porte que le texte français, et un            │
 * │ formulaire bâti sur elle enverrait un anglais vide — donc l'effacerait.    │
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

async function appelerRoute(
  ecran: string,
  chemin: string,
  methode: 'POST' | 'PUT' | 'DELETE',
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
 * Les deux versions linguistiques, lues du formulaire.
 *
 * Le texte vide est CONSERVÉ dans le tableau : c'est lui qui demande la
 * suppression de la version. Le rôle, lui, est facultatif — un témoignage sans
 * qualité affichée reste un témoignage.
 */
function versions(donnees: FormData): { langue: string; texte: string; role: string | null }[] {
  return (['fr', 'en'] as const).map((code) => ({
    langue: code,
    texte: (donnees.get(`texte_${code}`) as string | null)?.trim() ?? '',
    role: texte(donnees, `role_${code}`) ?? null,
  }));
}

export async function enregistrerTemoignage(
  langueBrute: string,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/temoignages`;

  await appelerRoute(
    ecran,
    `/api/admin/testimonials/${texte(donnees, 'id') ?? ''}`,
    'PUT',
    {
      auteur: texte(donnees, 'auteur') ?? '',
      ordre: nombre(donnees, 'ordre') ?? 0,
      versions: versions(donnees),
    },
    'maj',
    200,
  );
}

export async function creerTemoignage(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/temoignages`;

  /*
   * Le formulaire de création n'envoie que le français : une signature sans
   * texte anglais est le cas ordinaire, et proposer les deux zones dès la
   * création allongerait l'écran pour un contenu qu'on écrit rarement d'un
   * bloc. L'anglais s'ajoute ensuite, sur la carte du témoignage.
   */
  await appelerRoute(
    ecran,
    '/api/admin/testimonials',
    'POST',
    {
      auteur: texte(donnees, 'auteur') ?? '',
      ordre: nombre(donnees, 'ordre') ?? 0,
      versions: [
        {
          langue: 'fr',
          texte: (donnees.get('texte_fr') as string | null)?.trim() ?? '',
          role: texte(donnees, 'role_fr') ?? null,
        },
      ],
    },
    'cree',
    201,
  );
}

/**
 * Publie ou retire un témoignage.
 *
 * L'état VOULU part dans le formulaire, jamais « bascule » : deux onglets
 * ouverts sur cette liste inverseraient sinon deux fois un statut touché une
 * seule fois. La base refuse la publication d'un témoignage sans texte
 * français, et la route nomme ce refus `texte_francais_absent`.
 */
export async function changerPublicationTemoignage(
  langueBrute: string,
  donnees: FormData,
): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/temoignages`;
  const publie = texte(donnees, 'publie') === 'oui';

  await appelerRoute(
    ecran,
    `/api/admin/testimonials/${texte(donnees, 'id') ?? ''}/publication`,
    'PUT',
    { publie },
    publie ? 'publie' : 'depublie',
    200,
  );
}

export async function supprimerTemoignage(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/temoignages`;

  await appelerRoute(
    ecran,
    `/api/admin/testimonials/${texte(donnees, 'id') ?? ''}`,
    'DELETE',
    undefined,
    'supprime',
    204,
  );
}
