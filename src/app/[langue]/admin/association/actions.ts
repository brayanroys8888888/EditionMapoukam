'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { langueValide } from '@/i18n';
import { getServerEnv } from '@/lib/config/env';

/**
 * L'ESPACE ASSOCIATIF — actions d'écran, §3.6.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CES ACTIONS APPELLENT LES ROUTES. ELLES NE TOUCHENT PAS LA BASE.        │
 * │                                                                          │
 * │ Même raison que partout ailleurs dans l'administration : elle passe par   │
 * │ `service_role`, donc RLS est contourné par construction. Une action qui   │
 * │ écrirait directement le ferait sans acteur, et le journal cesserait de    │
 * │ dire QUI a publié un texte au nom de l'association.                       │
 * │                                                                          │
 * │ Le cookie de session part tel quel ; c'est lui, et lui seul, qui désigne  │
 * │ l'acteur côté route. Aucun `user_id` ne circule dans ces corps.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `acces` EST UNE ÉTIQUETTE POSÉE SUR UN TEXTE, PAS UN DROIT.             │
 * │                                                                          │
 * │ Écrire `libre` ou `abonnes` sur un contenu ne décide de rien : c'est      │
 * │ `access_for_association` qui, seule, confronte cette étiquette à          │
 * │ l'abonnement du lecteur, et c'est le privilège SELECT sur la colonne      │
 * │ `corps` qui empêche matériellement de la contourner. Ces actions          │
 * │ transportent le mot ; elles n'en tirent aucune conséquence.               │
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

/** Une section du corps, telle que la route l'attend. */
interface SectionSaisie {
  titre: string;
  paragraphes?: string[];
  points?: string[];
}

/**
 * Le texte saisi dans une zone de saisie, découpé en sections.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE MISE EN FORME, PAS UNE RÈGLE.                                       │
 * │                                                                          │
 * │ Le back-office n'a AUCUN JavaScript client — c'est une décision du        │
 * │ chantier d'interface, et elle interdit l'éditeur riche. Reste une zone    │
 * │ de saisie, et une convention que l'aide du champ énonce mot pour mot :    │
 * │                                                                          │
 * │   • un bloc par section, séparés par une ligne vide ;                     │
 * │   • la première ligne du bloc est le titre de la section ;                │
 * │   • les suivantes sont des paragraphes, sauf celles qui commencent par    │
 * │     « - », qui deviennent une liste à puces.                              │
 * │                                                                          │
 * │ Ce découpage n'ouvre ni ne ferme aucun droit : il donne une FORME à du    │
 * │ texte. La forme est ensuite revalidée par le schéma Zod de la route,      │
 * │ puis par la base. C'est pour cela qu'il peut vivre ici sans contredire    │
 * │ « une seule implémentation » — il n'implémente aucune règle.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les puces sont rassemblées en UNE liste, rendue après les paragraphes de la
 * section : c'est l'ordre dans lequel l'écran public les affiche, et prétendre
 * ici les entrelacer donnerait un aperçu que la lecture dément.
 */
function decouperEnSections(brut: string): SectionSaisie[] {
  const sections: SectionSaisie[] = [];

  // `\r\n` autant que `\n` : un texte collé depuis un traitement de texte
  // Windows arriverait sinon avec un retour chariot collé à chaque ligne.
  for (const bloc of brut.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lignes = bloc
      .split('\n')
      .map((ligne) => ligne.trim())
      .filter((ligne) => ligne !== '');

    const titre = lignes.shift();
    if (titre === undefined) continue;

    const paragraphes: string[] = [];
    const points: string[] = [];

    for (const ligne of lignes) {
      if (ligne.startsWith('- ')) points.push(ligne.slice(2).trim());
      else paragraphes.push(ligne);
    }

    sections.push({
      titre,
      ...(paragraphes.length > 0 ? { paragraphes } : {}),
      ...(points.length > 0 ? { points } : {}),
    });
  }

  return sections;
}

export async function creerContenu(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/association`;

  /*
   * Aucun champ « publié » : un contenu NAÎT EN BROUILLON, et la route ne
   * l'accepte même pas. La publication est un second geste, refusé tant que la
   * version française manque — or elle vient à peine d'être créée avec le seul
   * titre saisi ici, sans corps.
   */
  await appelerRoute(
    ecran,
    '/api/admin/association',
    'POST',
    {
      slug: texte(donnees, 'slug'),
      categorie: texte(donnees, 'categorie'),
      titre: texte(donnees, 'titre'),
      chapeau: texte(donnees, 'chapeau') ?? '',
      acces: texte(donnees, 'acces'),
      minutes: nombre(donnees, 'minutes') ?? null,
      image_url: texte(donnees, 'image_url') ?? null,
    },
    'cree',
    201,
  );
}

/**
 * Change le rangement d'un contenu : catégorie, accès, mise en avant, ordre.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ QUATRE CHAMPS, ET PAS LES SIX QUE LA ROUTE ACCEPTE.                     │
 * │                                                                          │
 * │ `admin_lister_contenus_association` ne rend ni la durée de lecture ni    │
 * │ l'illustration : l'écran ne peut donc pas les AFFICHER, et un formulaire  │
 * │ sans JavaScript renvoie tous ses champs à chaque envoi. Les faire        │
 * │ figurer ici les remettrait à vide au premier changement de catégorie,     │
 * │ sans que rien ne le dise. Un champ qu'on ne sait pas montrer ne doit pas  │
 * │ pouvoir effacer.                                                         │
 * │                                                                          │
 * │ Les deux se posent à la création, et la route les accepte toujours — par │
 * │ API, ou le jour où un écran de rédaction par contenu existera.            │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Ni le slug ni le statut n'y figurent non plus. Le slug est l'adresse publique
 * du contenu, et les anciennes adresses du blog y renvoient en 308 : le
 * renommer casserait des liens déjà partagés. Le statut, lui, a son propre
 * geste, qui passe par le contrôle des manques.
 */
export async function modifierContenu(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/association`;

  await appelerRoute(
    ecran,
    `/api/admin/association/${texte(donnees, 'id') ?? ''}`,
    'PATCH',
    {
      categorie: texte(donnees, 'categorie'),
      acces: texte(donnees, 'acces'),
      // Une case à cocher absente des données vaut « décochée », et non
      // « inchangée » : ce formulaire renvoie toujours l'état entier de la
      // ligne, jamais un écart.
      vedette: donnees.get('vedette') === 'oui',
      ordre: nombre(donnees, 'ordre') ?? 0,
    },
    'maj',
    200,
  );
}

export async function poserVersion(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/association`;

  const corps = decouperEnSections(texte(donnees, 'corps') ?? '');

  await appelerRoute(
    ecran,
    `/api/admin/association/${texte(donnees, 'id') ?? ''}/versions`,
    'PUT',
    {
      langue: texte(donnees, 'langueVersion'),
      titre: texte(donnees, 'titre'),
      chapeau: texte(donnees, 'chapeau') ?? null,
      // Un corps vide part en `null`, et non en tableau vide : la base
      // distingue « pas encore écrit » de « écrit, et sans section », et
      // l'écran public ne montre le mur d'adhésion que pour le premier.
      corps: corps.length > 0 ? corps : null,
    },
    'version',
    200,
  );
}

/**
 * Publie un contenu, ou le retire de l'espace associatif.
 *
 * Comme pour la mise en vente d'une offre, l'écran envoie l'état VOULU et non
 * « bascule » : deux onglets ouverts inverseraient sinon deux fois un statut
 * touché une seule fois. Le refus de publier sans version française vient de la
 * base, et cette action ne le rejoue pas.
 */
export async function changerPublication(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/association`;

  await appelerRoute(
    ecran,
    `/api/admin/association/${texte(donnees, 'id') ?? ''}/publication`,
    'PUT',
    { publie: donnees.get('publie') === 'oui' },
    donnees.get('publie') === 'oui' ? 'publie' : 'depublie',
    200,
  );
}

export async function supprimerContenu(langueBrute: string, donnees: FormData): Promise<void> {
  const langue = langueValide(langueBrute);
  const ecran = `/${langue}/admin/association`;

  await appelerRoute(
    ecran,
    `/api/admin/association/${texte(donnees, 'id') ?? ''}`,
    'DELETE',
    undefined,
    'supprime',
    204,
  );
}
