'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * CRÉATION D'UN CODE PROMO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ELLE APPELLE LA ROUTE. ELLE NE TOUCHE PAS LA BASE.                      │
 * │                                                                          │
 * │ Comme les actions du catalogue, et pour la même raison : l'administration │
 * │ passe par `service_role`, donc RLS est contourné par construction. Une    │
 * │ action serveur qui écrirait directement le ferait avec un acteur nul — le │
 * │ journal d'audit cesserait de dire QUI a créé le code.                     │
 * │                                                                          │
 * │ `POST /api/admin/promos` existait depuis l'étape 12 et aucun écran ne     │
 * │ l'appelait. C'est cet écran, pas cette route, qui manquait.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VALIDATION RESTE CELLE DE LA ROUTE. CE FICHIER NE LA REJOUE PAS.     │
 * │                                                                          │
 * │ Un code en POURCENTAGE ne porte ni devise ni zone : 20 % valent 20 %      │
 * │ partout, et lui donner une zone suggérerait qu'il ne vaut pas ailleurs.   │
 * │ Un code à MONTANT FIXE exige les deux : « 5 € de réduction » n'a aucun    │
 * │ sens sur un panier en francs CFA, et la zone `afrique` couvre XAF et XOF. │
 * │                                                                          │
 * │ Ces deux règles sont écrites une fois, dans le schéma Zod de la route.    │
 * │ Ce que fait cette action est plus modeste et différent : elle N'ENVOIE    │
 * │ PAS les champs qu'un pourcentage ne doit pas porter, parce qu'un          │
 * │ formulaire HTML envoie tous ses champs, y compris ceux qu'un `<select>`   │
 * │ de type vient de rendre sans objet.                                       │
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

/** Nombre lu d'un formulaire, ou `undefined` si le champ est laissé vide. */
function nombre(donnees: FormData, nom: string): number | undefined {
  const brut = texte(donnees, nom);
  if (brut === undefined) return undefined;
  const converti = Number(brut);
  return Number.isFinite(converti) ? converti : undefined;
}

/**
 * Une DATE de formulaire devient un instant, à la fin du jour choisi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI 23:59:59 ET NON MINUIT.                                        │
 * │                                                                          │
 * │ `<input type="date">` rend « 2026-12-31 », et la route attend un instant  │
 * │ complet. Le compléter par minuit ferait expirer le code au tout début du  │
 * │ 31 décembre — c'est-à-dire un jour plus tôt que ce que l'éditeur a saisi,  │
 * │ et il ne le découvrirait que par une réclamation de client.               │
 * │                                                                          │
 * │ L'heure est posée en UTC, comme tout le reste du projet : `app_now()` est │
 * │ en UTC, et la comparaison d'expiration s'y fait.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function finDeJour(donnees: FormData, nom: string): string | undefined {
  const jour = texte(donnees, nom);
  if (jour === undefined) return undefined;
  return `${jour}T23:59:59Z`;
}

export async function creerPromo(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/promos`;

  const type = donnees.get('type') === 'montant' ? 'montant' : 'pourcentage';

  const reponse = await fetch(`${getServerEnv().NEXT_PUBLIC_APP_URL}/api/admin/promos`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: await enteteCookie(),
    },
    body: JSON.stringify({
      code: texte(donnees, 'code'),
      type,
      valeur: nombre(donnees, 'valeur'),
      // Devise et zone ne PARTENT QUE pour un montant fixe. Le formulaire les
      // envoie toujours — un `<select>` masqué reste un `<select>` rempli — et
      // la route rejetterait un pourcentage qui les porte.
      ...(type === 'montant'
        ? { devise: texte(donnees, 'devise'), zone: texte(donnees, 'zone') }
        : {}),
      ...(finDeJour(donnees, 'expire_le') !== undefined
        ? { expire_le: finDeJour(donnees, 'expire_le') }
        : {}),
      ...(nombre(donnees, 'usage_max') !== undefined
        ? { usage_max: nombre(donnees, 'usage_max') }
        : {}),
      // `actif` est une case à cocher : décochée, elle n'est pas envoyée. Un
      // témoin caché de même nom la précède dans l'écran, et le dernier gagne.
      actif: donnees.getAll('actif').at(-1) === 'oui',
    }),
    cache: 'no-store',
  });

  const corps = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;

  if (reponse.status !== 201) redirect(`${ecran}?erreur=${codeErreur(corps)}`);

  revalidatePath(ecran);
  redirect(`${ecran}?cree=1`);
}
