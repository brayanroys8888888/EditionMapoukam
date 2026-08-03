import { createServiceClient } from '@/lib/supabase/clients';
import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { getAccessForBooks } from '@/lib/access/engine';
import { ACCES_REFUSE } from '@/domain/access/types';
import { formatAmount } from '@/domain/money';
import type { Currency } from '@/domain/money';
import { getServerEnv } from '@/lib/config/env';
import { urlsCouverture } from '@/lib/storage/covers';
import type { CatalogQuery } from '@/domain/catalog/schemas';
import type {
  AchatHorsZone,
  EntreeCatalogue,
  FicheLivre,
  PageCatalogue,
  PrixAffiche,
  SuggestionLivre,
} from '@/domain/catalog/types';
import { logger } from '@/lib/logger';

/**
 * Accès au catalogue.
 *
 * La requête de liste est une fonction PostgreSQL : recherche plein texte,
 * filtres, tri, pagination et total en une seule passe. Ce module l'appelle,
 * puis complète chaque entrée par la décision du moteur de droits — en UN seul
 * appel pour toute la page, jamais un par titre.
 */
interface LigneCatalogue {
  book_id: string;
  slug: string;
  auteur: string;
  illustrateur: string | null;
  age_min: number | null;
  age_max: number | null;
  origine_culturelle: string | null;
  themes: string[];
  couverture_url: string | null;
  inclus_abonnement: boolean;
  disponible_achat: boolean;
  gratuit: boolean;
  publie_le: string | null;
  titre: string;
  resume: string | null;
  nb_pages: number | null;
  langues: string[];
  montant: number | null;
  devise: string | null;
  zone_prix: string | null;
  score_popularite: number | null;
  total: number;
}

let devisesEnCache: Map<string, Currency> | null = null;

async function devises(client: AppSupabaseClient): Promise<Map<string, Currency>> {
  if (devisesEnCache) return devisesEnCache;

  const { data, error } = await client.from('currencies').select('code, decimals, symbole');
  if (error || !data) {
    throw new Error(`Devises illisibles : ${error?.message ?? 'aucune ligne'}`);
  }

  devisesEnCache = new Map(
    data.map((d) => [d.code, { code: d.code, decimals: d.decimals, symbole: d.symbole }]),
  );
  return devisesEnCache;
}

/** Réservé aux tests : oublie les devises mémorisées. */
export function invaliderDevises(): void {
  devisesEnCache = null;
}

/**
 * Signale un titre vendu à l'unité mais sans prix dans la zone demandée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST UNE ANOMALIE, PAS UN AFFICHAGE ORDINAIRE.                         │
 * │                                                                          │
 * │ Depuis la migration 0024, un titre publié et vendu à l'unité a un prix   │
 * │ dans CHAQUE zone active : ce cas ne devrait plus se produire. Il ne      │
 * │ subsiste que pour une zone ouverte APRÈS la publication d'un titre —     │
 * │ c'est-à-dire un résidu à corriger. Il est donc journalisé, avec le titre │
 * │ et la zone, et pas seulement rendu à l'affichage.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'achat est désactivé, la lecture ne l'est pas : le titre peut être inclus
 * dans l'abonnement ou gratuit, et le retirer du catalogue appauvrirait la
 * découverte.
 */
function achatHorsZone(
  livre: { slug: string; disponible_achat: boolean },
  prix: PrixAffiche | null,
  zone: string,
): AchatHorsZone | null {
  if (!livre.disponible_achat || prix !== null) return null;

  logger.warn('Titre vendu à l’unité sans prix dans la zone demandée', {
    slug: livre.slug,
    zone,
  });

  return {
    code: 'hors_zone',
    message: 'Ce conte n’est pas encore proposé à l’achat dans votre région.',
  };
}

function construirePrix(
  ligne: Pick<LigneCatalogue, 'montant' | 'devise' | 'zone_prix'>,
  table: Map<string, Currency>,
): PrixAffiche | null {
  if (ligne.montant === null || !ligne.devise || !ligne.zone_prix) return null;

  const devise = table.get(ligne.devise);
  if (!devise) return null;

  return {
    montant: ligne.montant,
    devise: ligne.devise,
    zone: ligne.zone_prix,
    // Le formatage passe par src/lib/money, seule autorité sur le nombre de
    // décimales : 1500 XAF vaut 1 500 FCFA, pas 15,00.
    affichage: formatAmount(ligne.montant, devise),
  };
}

export async function listerCatalogue(
  userId: string | null,
  query: CatalogQuery,
  options: { client?: AppSupabaseClient; at?: Date } = {},
): Promise<PageCatalogue> {
  const client = options.client ?? createServiceClient();

  const { data, error } = await client.rpc('catalog_list', {
    p_langue: query.langue,
    p_recherche: query.q ?? null,
    p_age_min: query.age_min ?? null,
    p_age_max: query.age_max ?? null,
    p_themes: query.themes ?? null,
    p_origine: query.origine ?? null,
    p_acces: query.acces ?? null,
    p_zone: query.zone,
    p_tri: query.tri,
    p_page: query.page,
    p_taille: query.taille,
    ...(options.at ? { p_at: options.at.toISOString() } : {}),
  } as never);

  if (error) {
    throw new Error(`Catalogue illisible : ${error.message}`);
  }

  const lignes = (data ?? []) as unknown as LigneCatalogue[];
  const table = await devises(client);
  const identifiants = lignes.map((l) => l.book_id);

  // UN SEUL appel pour toute la page. Sans cela, une page de 50 titres
  // déclencherait 50 résolutions de droits.
  const acces = await getAccessForBooks(userId, identifiants, {
    client,
    ...(options.at ? { at: options.at } : {}),
  });

  const affichage = await donneesDAffichage(client, identifiants, options.at);

  const total = lignes[0]?.total ?? 0;
  return {
    entrees: lignes.map((ligne) =>
      versEntree(ligne, table, acces.get(ligne.book_id), query.zone, affichage.get(ligne.book_id)),
    ),
    page: query.page,
    taille: query.taille,
    total,
    pages: Math.max(Math.ceil(total / query.taille), 1),
  };
}

/**
 * Ce que l'affichage exige et que `catalog_list` ne porte pas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EN LOT, COMME LES DROITS — jamais un appel par titre.                   │
 * │                                                                          │
 * │ Deux valeurs, toutes deux calculées EN BASE et pour la même raison :     │
 * │ les recalculer ici les ferait diverger de leur autorité. La date         │
 * │ d'entrée dans l'abonnement dépend d'un réglage que l'administration      │
 * │ déplace rétroactivement ; le jeton de couverture désigne un jeu de       │
 * │ fichiers dont seul `src/lib/storage/covers.ts` connaît la convention.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
interface DonneesAffichage {
  disponibleLe: string | null;
  region: EntreeCatalogue['region'];
  jetonCouverture: string | null;
}

async function donneesDAffichage(
  client: AppSupabaseClient,
  identifiants: readonly string[],
  at?: Date,
): Promise<Map<string, DonneesAffichage>> {
  const resultat = new Map<string, DonneesAffichage>();
  if (identifiants.length === 0) return resultat;

  const [dates, livres] = await Promise.all([
    client.rpc('abonnement_a_partir_du', {
      p_books: [...identifiants],
      ...(at ? { p_at: at.toISOString() } : {}),
    } as never),
    client.from('books').select('id, region, couverture_jeton').in('id', [...identifiants]),
  ]);

  if (dates.error) throw new Error(`Fenêtre d’abonnement illisible : ${dates.error.message}`);
  if (livres.error) throw new Error(`Couvertures illisibles : ${livres.error.message}`);

  const parLivre = new Map(
    ((dates.data ?? []) as unknown as { book_id: string; disponible_le: string | null }[]).map(
      (d) => [d.book_id, d.disponible_le],
    ),
  );

  for (const livre of livres.data ?? []) {
    resultat.set(livre.id, {
      disponibleLe: parLivre.get(livre.id) ?? null,
      region: livre.region,
      jetonCouverture: livre.couverture_jeton,
    });
  }

  return resultat;
}

function versEntree(
  ligne: LigneCatalogue,
  table: Map<string, Currency>,
  acces: EntreeCatalogue['acces'] | undefined,
  zone: string,
  affichage: DonneesAffichage | undefined,
): EntreeCatalogue {
  const prix = construirePrix(ligne, table);

  return {
    id: ligne.book_id,
    slug: ligne.slug,
    titre: ligne.titre,
    resume: ligne.resume,
    auteur: ligne.auteur,
    illustrateur: ligne.illustrateur,
    age_min: ligne.age_min,
    age_max: ligne.age_max,
    origine_culturelle: ligne.origine_culturelle,
    themes: ligne.themes,
    region: affichage?.region ?? null,
    couverture_url: ligne.couverture_url,
    couverture: urlsCouverture(affichage?.jetonCouverture ?? null),
    nb_pages: ligne.nb_pages,
    langues: ligne.langues,
    publie_le: ligne.publie_le,
    abonnement_a_partir_du: affichage?.disponibleLe ?? null,
    inclus_abonnement: ligne.inclus_abonnement,
    disponible_achat: ligne.disponible_achat,
    gratuit: ligne.gratuit,
    prix,
    achat_hors_zone: achatHorsZone(ligne, prix, zone),
    acces: acces ?? ACCES_REFUSE,
  };
}

/**
 * Fiche détaillée d'un titre (§4.1 F3).
 *
 * Renvoie `null` pour un brouillon, un titre archivé ou un slug inconnu : du
 * point de vue d'un visiteur, ces trois cas doivent se ressembler.
 */
export async function lireFiche(
  userId: string | null,
  slug: string,
  query: { langue: 'fr' | 'en'; zone: 'international' | 'afrique' },
  options: { client?: AppSupabaseClient; at?: Date } = {},
): Promise<FicheLivre | null> {
  const client = options.client ?? createServiceClient();

  // Interrogation directe plutôt que par `catalog_list` : la fiche n'a besoin
  // ni de recherche, ni de tri, ni de pagination, mais de champs que la liste
  // ne porte pas — longueur de l'extrait, toutes les versions linguistiques,
  // suggestions.
  const fiche = await client
    .from('books')
    .select(
      `id, slug, auteur, illustrateur, age_min, age_max, origine_culturelle, themes,
       region, couverture_url, couverture_jeton,
       inclus_abonnement, disponible_achat, gratuit, nb_pages_extrait,
       publie_le, statut,
       book_translations!inner(langue, titre, resume, nb_pages, statut),
       book_prices(zone, montant, devise)`,
    )
    .eq('slug', slug)
    .eq('statut', 'publie')
    .eq('book_translations.langue', query.langue)
    .eq('book_translations.statut', 'publie')
    .maybeSingle();

  if (fiche.error || !fiche.data) return null;

  const livre = fiche.data;
  const traduction = livre.book_translations[0];
  if (!traduction) return null;

  const toutesLangues = await client
    .from('book_translations')
    .select('langue')
    .eq('book_id', livre.id)
    .eq('statut', 'publie')
    .order('langue');

  // ┌────────────────────────────────────────────────────────────────────────┐
  // │ AUCUN REPLI SUR UNE AUTRE ZONE : la zone demandée, ou aucun prix.      │
  // │                                                                        │
  // │ Afficher « 4,99 € » à un visiteur de la zone Afrique parce que le      │
  // │ titre n'a pas de prix local serait une substitution silencieuse de     │
  // │ devise — et le panier refuserait ensuite ce même titre. Mieux vaut ne  │
  // │ pas annoncer de prix que d'en annoncer un qu'on ne pourra pas          │
  // │ encaisser.                                                             │
  // │                                                                        │
  // │ Le cas est résiduel : depuis la migration 0024, un titre publié et     │
  // │ vendu à l'unité a un prix dans chaque zone active. Il ne subsiste que  │
  // │ pour une zone ouverte après la publication.                            │
  // └────────────────────────────────────────────────────────────────────────┘
  const prixZone = livre.book_prices.find((p) => p.zone === query.zone) ?? null;

  const table = await devises(client);
  const prixFiche = prixZone
    ? construirePrix(
        { montant: prixZone.montant, devise: prixZone.devise, zone_prix: prixZone.zone },
        table,
      )
    : null;
  const acces = await getAccessForBooks(userId, [livre.id], {
    client,
    ...(options.at ? { at: options.at } : {}),
  });

  return {
    id: livre.id,
    slug: livre.slug,
    titre: traduction.titre,
    resume: traduction.resume,
    auteur: livre.auteur,
    illustrateur: livre.illustrateur,
    age_min: livre.age_min,
    age_max: livre.age_max,
    origine_culturelle: livre.origine_culturelle,
    themes: livre.themes,
    region: livre.region,
    couverture_url: livre.couverture_url,
    couverture: urlsCouverture(livre.couverture_jeton),
    nb_pages: traduction.nb_pages,
    langues: (toutesLangues.data ?? []).map((t) => t.langue),
    publie_le: livre.publie_le,
    // Même appel que pour la liste : la règle des trois mois n'est écrite
    // qu'une fois, en base, et la fiche ne la recalcule pas davantage.
    abonnement_a_partir_du:
      (await donneesDAffichage(client, [livre.id], options.at)).get(livre.id)?.disponibleLe ?? null,
    inclus_abonnement: livre.inclus_abonnement,
    disponible_achat: livre.disponible_achat,
    gratuit: livre.gratuit,
    prix: prixFiche,
    achat_hors_zone: achatHorsZone(livre, prixFiche, query.zone),
    acces: acces.get(livre.id) ?? ACCES_REFUSE,
    pages_extrait: livre.nb_pages_extrait ?? getServerEnv().EXCERPT_PAGES_DEFAULT,
    suggestions: await suggestions(client, livre.id, livre.themes, query.langue),
  };
}

/**
 * Titres proches, par thèmes partagés.
 *
 * Volontairement simple : une recommandation élaborée relèverait d'un autre
 * chantier, et une suggestion approximative vaut mieux qu'une section vide.
 */
async function suggestions(
  client: AppSupabaseClient,
  bookId: string,
  themes: string[],
  langue: string,
): Promise<SuggestionLivre[]> {
  if (themes.length === 0) return [];

  const { data } = await client
    .from('books')
    .select('id, slug, couverture_url, book_translations!inner(titre, langue, statut)')
    .eq('statut', 'publie')
    .neq('id', bookId)
    .overlaps('themes', themes)
    .eq('book_translations.langue', langue)
    .eq('book_translations.statut', 'publie')
    .limit(4);

  return (data ?? []).map((livre) => ({
    id: livre.id,
    slug: livre.slug,
    titre: livre.book_translations[0]?.titre ?? livre.slug,
    couverture_url: livre.couverture_url,
  }));
}
