import { createServiceClient } from '@/lib/supabase/clients';
import type { AppSupabaseClient } from '@/lib/supabase/clients';
import type { MotifAcces } from '@/domain/access/types';
import type { LangueInterface } from '@/i18n';
import type { Section } from '@/content/editorial';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEUL MODULE DU DÉPÔT AUTORISÉ À LIRE LES CONTENUS DE L'ASSOCIATION.     │
 * │                                                                          │
 * │ Ce module NE DÉCIDE RIEN. Il appelle `association_liste` et              │
 * │ `association_contenu`, et traduit leur réponse en types TypeScript. Le   │
 * │ verdict `can_read` vient de `access_for_association`, qui appelle        │
 * │ lui-même `abonnement_ouvre_droit(user, 'association')` — la MÊME         │
 * │ fonction que le moteur des livres appelle avec `'lecture'`.              │
 * │                                                                          │
 * │ Écrire ici « si l'accès est `abonnes` et que l'utilisateur est abonné,   │
 * │ alors… » serait une seconde implémentation de la règle d'accès. Elle     │
 * │ divergerait, et la divergence porterait sur du contenu payant.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CORPS N'EST PAS FILTRÉ ICI — IL NE PARVIENT MÊME PAS JUSQU'ICI.      │
 * │                                                                          │
 * │ Deux verrous indépendants, et le second ne dépend d'aucun code :         │
 * │                                                                          │
 * │ 1. `association_contenu` rend `corps` à `null` quand `can_read` est      │
 * │    faux. C'est la règle, écrite une fois, en SQL.                        │
 * │ 2. La colonne `corps` de `association_content_translations` n'est        │
 * │    JAMAIS accordée à `anon` ni à `authenticated` (migration 0069). Un    │
 * │    client de navigateur qui interrogerait la table directement se        │
 * │    verrait refuser la colonne par PostgreSQL, pas par une politique      │
 * │    qu'on aurait pu oublier d'écrire.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les catégories, telles que l'énumération PostgreSQL les fixe. */
export const CATEGORIES_ASSOCIATION = [
  'vie-associative',
  'actions',
  'accompagnement',
  'pedagogie',
  'culture',
  'besoins-specifiques',
] as const;

export type CategorieAssociation = (typeof CATEGORIES_ASSOCIATION)[number];

/** `libre` = lisible de tous ; `abonnes` = réservé à l'abonnement associatif. */
export type AccesAssociation = 'libre' | 'abonnes';

/** Une carte de la liste — jamais le corps, qui n'est pas demandé ici. */
export interface ContenuAssociatif {
  slug: string;
  categorie: CategorieAssociation;
  acces: AccesAssociation;
  /** ISO 8601, ou `null` si la base n'en porte pas (impossible sur un publié). */
  publieLe: string | null;
  minutes: number | null;
  imageUrl: string | null;
  vedette: boolean;
  titre: string;
  chapeau: string;
  /**
   * LU, jamais déduit.
   *
   * L'écran affiche un cadenas parce que cette valeur est fausse — pas parce
   * qu'il aurait comparé `acces` à l'état d'un abonnement. C'est ce que le
   * test d'architecture `frontend-architecture` impose.
   */
  peutLire: boolean;
  motif: MotifAcces;
}

/** Le détail. Le corps est `null` dès que `peutLire` est faux. */
export interface ContenuAssociatifDetaille extends Omit<ContenuAssociatif, 'vedette'> {
  sections: Section[] | null;
}

interface LigneListe {
  slug: string;
  categorie: CategorieAssociation;
  acces: AccesAssociation;
  publie_le: string | null;
  minutes: number | null;
  image_url: string | null;
  vedette: boolean;
  titre: string | null;
  chapeau: string | null;
  can_read: boolean;
  reason: MotifAcces;
}

interface LigneDetail extends Omit<LigneListe, 'vedette'> {
  corps: unknown;
}

/**
 * Le corps est du JSON en base : on le RELIT plutôt qu'on ne l'affirme.
 *
 * `corps` est contraint à un tableau par la base, mais rien n'y contraint la
 * forme de chaque élément — le back-office écrit ce que l'éditeur saisit. Une
 * section mal formée est écartée ici plutôt que de faire tomber la page
 * entière sur un `undefined` en plein rendu.
 */
function enSection(brut: unknown): Section | null {
  if (typeof brut !== 'object' || brut === null) return null;

  const objet = brut as Record<string, unknown>;
  if (typeof objet.titre !== 'string' || objet.titre.trim() === '') return null;

  // `every` avec un prédicat de type suffit à restreindre le tableau : pas
  // d'assertion à écrire ici, et c'est mieux ainsi — une assertion aurait
  // affirmé ce que la vérification démontre.
  const textes = (valeur: unknown): string[] | undefined =>
    Array.isArray(valeur) && valeur.every((element) => typeof element === 'string')
      ? valeur
      : undefined;

  const paragraphes = textes(objet.paragraphes);
  const points = textes(objet.points);

  return {
    titre: objet.titre,
    ...(paragraphes && paragraphes.length > 0 ? { paragraphes } : {}),
    ...(points && points.length > 0 ? { points } : {}),
  };
}

function enSections(brut: unknown): Section[] {
  if (!Array.isArray(brut)) return [];
  return brut.map(enSection).filter((section): section is Section => section !== null);
}

/**
 * La liste des contenus publiés, verdict d'accès compris.
 *
 * @param userId `null` pour un visiteur non connecté — chemin nominal, testé.
 */
export async function lireContenusAssociatifs(
  userId: string | null,
  options: { client?: AppSupabaseClient; langue?: LangueInterface; at?: Date } = {},
): Promise<ContenuAssociatif[]> {
  const client = options.client ?? createServiceClient();

  // Le générateur de types déclare `p_user` non nullable, alors que le
  // paramètre SQL accepte NULL — c'est le chemin du visiteur, et il est testé.
  const arguments_ = {
    p_user: userId,
    p_langue: options.langue ?? 'fr',
    ...(options.at ? { p_at: options.at.toISOString() } : {}),
  } as unknown as { p_user: string; p_langue: string };

  const { data, error } = await client.rpc('association_liste', arguments_);

  if (error) {
    // Jamais de repli permissif : une lecture de droits en échec remonte.
    throw new Error(`Lecture des contenus de l’association impossible : ${error.message}`);
  }

  return ((data ?? []) as LigneListe[]).map((ligne) => ({
    slug: ligne.slug,
    categorie: ligne.categorie,
    acces: ligne.acces,
    publieLe: ligne.publie_le,
    minutes: ligne.minutes,
    imageUrl: ligne.image_url,
    vedette: ligne.vedette,
    titre: ligne.titre ?? ligne.slug,
    chapeau: ligne.chapeau ?? '',
    peutLire: ligne.can_read,
    motif: ligne.reason,
  }));
}

/**
 * Un contenu, corps compris SI le droit est ouvert — et `null` s'il ne l'est pas.
 *
 * La fonction rend quand même la ligne dans ce cas : l'écran a besoin du titre
 * et du chapeau pour dire ce qui est verrouillé et proposer l'adhésion. C'est
 * la base qui a décidé de vider le corps, ici on transporte.
 *
 * Un slug inconnu rend `null`, ce qui devient un 404 côté écran.
 */
export async function lireContenuAssociatif(
  userId: string | null,
  slug: string,
  options: { client?: AppSupabaseClient; langue?: LangueInterface; at?: Date } = {},
): Promise<ContenuAssociatifDetaille | null> {
  const client = options.client ?? createServiceClient();

  const arguments_ = {
    p_user: userId,
    p_slug: slug,
    p_langue: options.langue ?? 'fr',
    ...(options.at ? { p_at: options.at.toISOString() } : {}),
  } as unknown as { p_user: string; p_slug: string; p_langue: string };

  const { data, error } = await client.rpc('association_contenu', arguments_);

  if (error) {
    throw new Error(`Lecture du contenu de l’association impossible : ${error.message}`);
  }

  const ligne = ((data ?? []) as LigneDetail[])[0];
  if (!ligne) return null;

  return {
    slug: ligne.slug,
    categorie: ligne.categorie,
    acces: ligne.acces,
    publieLe: ligne.publie_le,
    minutes: ligne.minutes,
    imageUrl: ligne.image_url,
    titre: ligne.titre ?? ligne.slug,
    chapeau: ligne.chapeau ?? '',
    // `null` et non `[]` : « verrouillé » et « publié sans texte » ne se
    // ressemblent pas à l'écran, et l'un des deux affiche un cadenas.
    sections: ligne.can_read ? enSections(ligne.corps) : null,
    peutLire: ligne.can_read,
    motif: ligne.reason,
  };
}
