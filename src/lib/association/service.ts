import { createServiceClient } from '@/lib/supabase/clients';
import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { mediaAssociatif } from '@/lib/storage/association';
import type { MotifAcces } from '@/domain/access/types';
import type { LangueInterface } from '@/i18n';

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
  blocs: Bloc[] | null;
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
 * UN BLOC DE CORPS — la forme que l'éditeur produit et que l'article rend.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEPT TYPES, ET LA BASE LES VÉRIFIE AUSSI.                               │
 * │                                                                          │
 * │ `corps_associatif_valide` — posée par la 0103, élargie à la vidéo et à   │
 * │ l'audio par la 0108 — refuse un bloc inconnu à l'écriture. Ce lecteur    │
 * │ le refuse à nouveau à la LECTURE, et ce n'est pas                        │
 * │ une répétition inutile : la base garde ce qui entre, ce lecteur garde    │
 * │ l'écran debout devant ce qui y serait entré autrement — par une          │
 * │ migration, une reprise de données, une main sur psql.                    │
 * │                                                                          │
 * │ Un bloc mal formé est ÉCARTÉ, jamais rendu à moitié : une photo sans     │
 * │ adresse laisserait un cadre vide que le lecteur prendrait pour une       │
 * │ image qui n'a pas chargé.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type Bloc =
  | { type: 'intertitre'; texte: string }
  | { type: 'paragraphe'; texte: string }
  | { type: 'liste'; elements: string[] }
  | { type: 'citation'; texte: string }
  | { type: 'photo'; url: string; legende?: string }
  | { type: 'video'; url: string; legende?: string }
  | { type: 'audio'; url: string; legende?: string };

function texteNonVide(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() !== '' ? valeur : null;
}

function enBloc(brut: unknown): Bloc | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const objet = brut as Record<string, unknown>;

  switch (objet.type) {
    case 'intertitre':
    case 'paragraphe':
    case 'citation': {
      const texte = texteNonVide(objet.texte);
      return texte === null ? null : { type: objet.type, texte };
    }

    case 'liste': {
      // `every` avec un prédicat de type suffit à restreindre le tableau :
      // aucune assertion à écrire, et c'est mieux ainsi — une assertion
      // affirmerait ce que la vérification démontre.
      const elements = Array.isArray(objet.elements)
        ? objet.elements.filter((element): element is string => typeof element === 'string')
        : [];
      return elements.length > 0 ? { type: 'liste', elements } : null;
    }

    /*
     * Les trois médias partagent leur forme — une adresse, une légende
     * facultative — et donc leur lecture. Les séparer en trois `case`
     * identiques ferait diverger le jour où l'un d'eux gagnerait un champ.
     */
    case 'photo':
    case 'video':
    case 'audio': {
      const url = texteNonVide(objet.url);
      if (url === null) return null;
      const legende = texteNonVide(objet.legende);
      return { type: objet.type, url, ...(legende === null ? {} : { legende }) };
    }

    default:
      return null;
  }
}

function enBlocs(brut: unknown): Bloc[] {
  if (!Array.isArray(brut)) return [];
  return brut.map(enBloc).filter((bloc): bloc is Bloc => bloc !== null);
}

/**
 * REMPLACE LES CHEMINS DE STOCKAGE PAR DES ADRESSES SERVABLES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ICI, ET PAS DANS LE COMPOSANT — POUR LA MÊME RAISON QUE LE CORPS.       │
 * │                                                                          │
 * │ Un chemin `association-fichiers/…` n'est servable par personne : il faut │
 * │ une signature, et signer demande la clé de service. Le faire dans un     │
 * │ composant la ferait descendre dans le navigateur ; le faire dans une     │
 * │ route de service exposerait une adresse que rien ne garde.                │
 * │                                                                          │
 * │ Ce module est déjà le seul autorisé à lire ces contenus, et il n'est     │
 * │ appelé qu'après que la base a rendu son verdict : `corps` vaut `null`    │
 * │ quand `can_read` est faux, donc AUCUNE signature n'est émise pour qui    │
 * │ n'a pas le droit de lire. La signature suit le droit, elle ne l'ouvre    │
 * │ pas.                                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Un média dont la signature échoue est ÉCARTÉ, jamais rendu avec son chemin
 * brut : un `<video src="association-fichiers/…">` afficherait un lecteur
 * mort, et le chemin serait dans la source de la page.
 */
async function servirMedias(blocs: Bloc[], client: AppSupabaseClient): Promise<Bloc[]> {
  const servis = await Promise.all(
    blocs.map(async (bloc): Promise<Bloc | null> => {
      if (bloc.type !== 'photo' && bloc.type !== 'video' && bloc.type !== 'audio') return bloc;

      const url = await mediaAssociatif(bloc.url, { client });
      if (url === null) return null;

      return { ...bloc, url };
    }),
  );

  return servis.filter((bloc): bloc is Bloc => bloc !== null);
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

  return Promise.all(((data ?? []) as LigneListe[]).map(async (ligne) => ({
    slug: ligne.slug,
    categorie: ligne.categorie,
    acces: ligne.acces,
    publieLe: ligne.publie_le,
    minutes: ligne.minutes,
    imageUrl: await couverture(ligne.image_url, client),
    vedette: ligne.vedette,
    titre: ligne.titre ?? ligne.slug,
    chapeau: ligne.chapeau ?? '',
    peutLire: ligne.can_read,
    motif: ligne.reason,
  })));
}

/**
 * La couverture, servable.
 *
 * Elle vit dans le bucket PUBLIC : `mediaAssociatif` en rend donc l'URL
 * publique, cachable par le CDN — et une adresse collée à la main repart
 * telle quelle. Elle n'est jamais signée : une couverture s'affiche sur les
 * cartes de qui n'a pas encore adhéré, et c'est précisément ce qui donne
 * envie d'adhérer.
 */
async function couverture(
  valeur: string | null,
  client: AppSupabaseClient,
): Promise<string | null> {
  return valeur === null ? null : mediaAssociatif(valeur, { client });
}

/** Le verdict d'entrée dans l'espace adhérent — A1. */
export type VerdictEspace = 'sans_adhesion' | 'ouvert' | 'impaye_tolere' | 'ferme';

export interface AccesEspace {
  verdict: VerdictEspace;
  finPeriode: string | null;
  finGrace: string | null;
}

/**
 * QUI PEUT ENTRER DANS L'ESPACE, ET DANS QUEL ÉTAT.
 *
 * Le verdict est LU en base, jamais déduit ici : `association_acces_espace`
 * lit `statut_effectif`, qui lit lui-même la période de grâce configurée. Une
 * comparaison faite en TypeScript répondrait selon l'horloge du serveur de
 * rendu et ignorerait le temps déplacé par la console de simulation.
 */
export async function verdictEspaceAdherent(
  userId: string,
  options: { client?: AppSupabaseClient; at?: Date } = {},
): Promise<AccesEspace> {
  const client = options.client ?? createServiceClient();

  const arguments_ = {
    p_user: userId,
    ...(options.at ? { p_at: options.at.toISOString() } : {}),
  } as unknown as { p_user: string };

  const { data, error } = await client.rpc('association_acces_espace', arguments_);
  if (error) {
    throw new Error(`Lecture du droit d’entrée impossible : ${error.message}`);
  }

  const ligne = ((data ?? []) as {
    verdict: VerdictEspace;
    fin_periode: string | null;
    fin_grace: string | null;
  }[])[0];

  /*
   * La fonction rend TOUJOURS une ligne — un `right join` sur une constante
   * le garantit. L'absence serait donc une panne, pas un visiteur sans
   * adhésion : on ferme plutôt que d'ouvrir par défaut.
   */
  if (!ligne) return { verdict: 'ferme', finPeriode: null, finGrace: null };

  return {
    verdict: ligne.verdict,
    finPeriode: ligne.fin_periode,
    finGrace: ligne.fin_grace,
  };
}

/** Tout ce que l'espace affiche, en un aller-retour. */
export async function lireEspaceAdherent(
  userId: string,
  options: { client?: AppSupabaseClient; langue?: LangueInterface; at?: Date } = {},
): Promise<unknown> {
  const client = options.client ?? createServiceClient();

  const arguments_ = {
    p_user: userId,
    p_langue: options.langue ?? 'fr',
    ...(options.at ? { p_at: options.at.toISOString() } : {}),
  } as unknown as { p_user: string; p_langue: string };

  const { data, error } = await client.rpc('association_espace', arguments_);
  if (error) {
    throw new Error(`Lecture de l’espace adhérent impossible : ${error.message}`);
  }

  return data;
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
    imageUrl: await couverture(ligne.image_url, client),
    titre: ligne.titre ?? ligne.slug,
    chapeau: ligne.chapeau ?? '',
    // `null` et non `[]` : « verrouillé » et « publié sans texte » ne se
    // ressemblent pas à l'écran, et l'un des deux affiche un cadenas.
    blocs: ligne.can_read ? await servirMedias(enBlocs(ligne.corps), client) : null,
    peutLire: ligne.can_read,
    motif: ligne.reason,
  };
}
