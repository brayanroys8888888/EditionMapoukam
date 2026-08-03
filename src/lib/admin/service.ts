import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import type { Database } from '@/lib/supabase/database.types';
import { purgerCopies } from '@/lib/downloads/service';
import { logger } from '@/lib/logger';

/**
 * Opérations d'administration — §4.3 F10 à F12.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE COUCHE N'IMPLÉMENTE AUCUNE RÈGLE. ELLE APPELLE.                   │
 * │                                                                          │
 * │ L'administration est la surface la plus privilégiée du projet : elle      │
 * │ passe par `service_role`, donc RLS est contourné par construction. Le     │
 * │ seul rempart qui subsiste est le code — et un rempart réécrit deux fois   │
 * │ n'en est plus un (docs/PLAN.md §5 quinquies).                             │
 * │                                                                          │
 * │ Chaque mutation passe donc par une fonction `admin_*` de la migration     │
 * │ 0036, qui vérifie le rôle EN BASE, pose l'acteur pour les déclencheurs    │
 * │ d'audit, et applique la règle. Ce module transporte des arguments.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'ACTEUR EST TOUJOURS LE PREMIER ARGUMENT, et il vient de la session vérifiée
 * — jamais du corps de la requête. C'est la traduction en signature du point 2
 * de l'étape : aucune route n'accepte un `user_id` pour « agir au nom de ».
 */

/** Un identifiant de compte transmis par le CLIENT ne peut jamais être l'acteur. */
export type ActeurId = string;

export type ResultatAdmin<T> =
  | { ok: true; donnees: T }
  | { ok: false; raison: RefusAdmin; detail: string };

export type RefusAdmin =
  | 'introuvable'
  | 'refuse'
  | 'regle_metier'
  | 'indisponible';

/**
 * Traduit une erreur PostgreSQL en refus nommé.
 *
 * Le détail interne n'est JAMAIS renvoyé au client : les fonctions
 * d'administration nomment des tables et des contraintes dans leurs messages,
 * et une contrainte violée décrit la structure de la base.
 */
function traduire(code: string | undefined, message: string): ResultatAdmin<never> {
  switch (code) {
    case 'P0002':
    case 'no_data_found':
      return { ok: false, raison: 'introuvable', detail: message };
    case '42501':
      return { ok: false, raison: 'refuse', detail: message };
    case '23514':
    case '23505':
    case '23503':
    case '23P01':
      return { ok: false, raison: 'regle_metier', detail: message };
    default:
      return { ok: false, raison: 'indisponible', detail: message };
  }
}

interface ErreurPostgres {
  code?: string;
  message: string;
}

/** Fonction PostgreSQL exposée par le schéma généré. */
type NomFonction = keyof Database['public']['Functions'];

async function appeler<T>(
  client: AppSupabaseClient,
  nom: NomFonction,
  args: Record<string, unknown>,
): Promise<ResultatAdmin<T>> {
  // Le nom est contraint aux fonctions RÉELLEMENT présentes dans le schéma
  // généré : une faute de frappe ne compile pas. Les arguments, eux, sont
  // effacés — les énumérer par fonction dupliquerait quinze signatures que
  // `db:types` régénère déjà, et chaque appelant les type à son niveau.
  const reponse = (await client.rpc(nom as never, args as never)) as {
    data: unknown;
    error: ErreurPostgres | null;
  };
  const erreur = reponse.error;

  if (erreur) {
    // Tracé côté serveur avec son détail, rendu au client sans.
    logger.warn('Opération d’administration refusée', {
      operation: nom,
      code: erreur.code,
      detail: erreur.message,
    });
    return traduire(erreur.code, erreur.message);
  }

  return { ok: true, donnees: reponse.data as T };
}

// ═══════════════════════════════════════════════════════════════════════════
// LECTURES
// ═══════════════════════════════════════════════════════════════════════════

export interface Pagination {
  page: number;
  taille: number;
}

/**
 * Les listes ne prennent PAS d'acteur : elles ne mutent rien, et le contrôle du
 * rôle a déjà eu lieu dans la route. Le plafond de pagination, lui, vit en base
 * (`taille_page_admin`) et non dans le schéma Zod : une route ajoutée plus tard
 * en hérite sans y penser.
 */
export async function listerUtilisateurs(
  filtres: { recherche?: string | null; statut?: string | null } & Pagination,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_utilisateurs', {
    p_recherche: filtres.recherche ?? null,
    p_statut: filtres.statut ?? null,
    p_page: filtres.page,
    p_taille: filtres.taille,
  });
}

export async function listerCommandes(
  filtres: { statut?: string | null; userId?: string | null } & Pagination,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_commandes', {
    p_statut: filtres.statut ?? null,
    p_user_id: filtres.userId ?? null,
    p_page: filtres.page,
    p_taille: filtres.taille,
  });
}

export async function listerLivres(
  filtres: { statut?: string | null } & Pagination,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_livres', {
    p_statut: filtres.statut ?? null,
    p_page: filtres.page,
    p_taille: filtres.taille,
  });
}

export async function listerAbonnements(
  filtres: { statut?: string | null } & Pagination,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_abonnements', {
    p_statut: filtres.statut ?? null,
    p_page: filtres.page,
    p_taille: filtres.taille,
  });
}

export async function listerPromos(
  pagination: Pagination,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_promos', {
    p_page: pagination.page,
    p_taille: pagination.taille,
  });
}

export async function listerAudit(
  filtres: { action?: string | null; cibleId?: string | null } & Pagination,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_audit', {
    p_action: filtres.action ?? null,
    p_cible_id: filtres.cibleId ?? null,
    p_page: filtres.page,
    p_taille: filtres.taille,
  });
}

export async function tableauDeBord(options: { client?: AppSupabaseClient } = {}) {
  const client = options.client ?? createServiceClient();
  return await appeler<Record<string, unknown>>(client, 'admin_tableau_de_bord', {});
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function octroyerDroit(
  acteur: ActeurId,
  demande: {
    userId: string;
    bookId: string;
    motif: string;
    peutTelecharger?: boolean;
    expireLe?: string | null;
  },
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_octroyer_droit', {
    p_acteur: acteur,
    p_user_id: demande.userId,
    p_book_id: demande.bookId,
    // Le motif est obligatoire côté base aussi : ce n'est pas une politesse
    // d'interface, c'est la contrepartie du levier qui donne du contenu.
    p_motif: demande.motif,
    p_peut_telecharger: demande.peutTelecharger ?? false,
    p_expire_le: demande.expireLe ?? null,
  });
}

export async function retirerDroit(
  acteur: ActeurId,
  entitlementId: string,
  motif: string | null,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<null>(client, 'admin_retirer_droit', {
    p_acteur: acteur,
    p_entitlement_id: entitlementId,
    p_motif: motif,
  });
}

export async function modifierLivre(
  acteur: ActeurId,
  bookId: string,
  champs: {
    gratuit?: boolean;
    inclusAbonnement?: boolean;
    disponibleAchat?: boolean;
    auteur?: string;
    origineCulturelle?: string;
    ageMin?: number;
    ageMax?: number;
    nbPagesExtrait?: number;
  },
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_modifier_livre', {
    p_acteur: acteur,
    p_book_id: bookId,
    p_gratuit: champs.gratuit ?? null,
    p_inclus_abonnement: champs.inclusAbonnement ?? null,
    p_disponible_achat: champs.disponibleAchat ?? null,
    p_auteur: champs.auteur ?? null,
    p_origine_culturelle: champs.origineCulturelle ?? null,
    p_age_min: champs.ageMin ?? null,
    p_age_max: champs.ageMax ?? null,
    p_nb_pages_extrait: champs.nbPagesExtrait ?? null,
  });
}

export async function definirPrix(
  acteur: ActeurId,
  bookId: string,
  prix: { zone: 'international' | 'afrique'; montant: number; devise: string },
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_definir_prix', {
    p_acteur: acteur,
    p_book_id: bookId,
    p_zone: prix.zone,
    p_montant: prix.montant,
    p_devise: prix.devise,
  });
}

/**
 * Publication ou archivage, à l'unité ou en lot.
 *
 * La liste d'identifiants est le SEUL chemin, y compris pour un titre unique :
 * deux chemins auraient fini par diverger, et c'est le chemin groupé qui aurait
 * perdu la validation.
 */
export async function changerPublication(
  acteur: ActeurId,
  bookIds: readonly string[],
  statut: 'brouillon' | 'publie' | 'archive',
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_changer_publication', {
    p_acteur: acteur,
    p_book_ids: bookIds,
    p_statut: statut,
  });
}

export async function modifierParametres(
  acteur: ActeurId,
  champs: {
    fenetreNouveauteJours?: number;
    periodeGraceJours?: number;
    joursEssai?: number;
    toleranceRenouvellementHeures?: number;
    retentionCopiesMois?: number;
    abonnementOuvert?: boolean;
  },
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_modifier_parametres', {
    p_acteur: acteur,
    p_fenetre_nouveaute_jours: champs.fenetreNouveauteJours ?? null,
    p_periode_grace_jours: champs.periodeGraceJours ?? null,
    p_jours_essai: champs.joursEssai ?? null,
    p_tolerance_renouvellement_heures: champs.toleranceRenouvellementHeures ?? null,
    p_retention_copies_mois: champs.retentionCopiesMois ?? null,
    p_abonnement_ouvert: champs.abonnementOuvert ?? null,
  });
}

export async function definirStatutCompte(
  acteur: ActeurId,
  userId: string,
  suspendu: boolean,
  motif: string | null,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_definir_statut_compte', {
    p_acteur: acteur,
    p_user_id: userId,
    p_suspendu: suspendu,
    p_motif: motif,
  });
}

/** Changement de zone d'un abonnement — arbitrage N4. Jamais offert à l'utilisateur. */
export async function changerZoneAbonnement(
  acteur: ActeurId,
  subscriptionId: string,
  zone: 'international' | 'afrique',
  motif: string | null,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_changer_zone_abonnement', {
    p_acteur: acteur,
    p_subscription_id: subscriptionId,
    p_zone: zone,
    p_motif: motif,
  });
}

export async function enregistrerPromo(
  acteur: ActeurId,
  code: {
    code: string;
    type: 'montant' | 'pourcentage';
    valeur: number;
    devise?: string | null;
    zone?: 'international' | 'afrique' | null;
    expireLe?: string | null;
    usageMax?: number | null;
    actif?: boolean;
  },
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_enregistrer_promo', {
    p_acteur: acteur,
    p_code: code.code,
    p_type: code.type,
    p_valeur: code.valeur,
    p_devise: code.devise ?? null,
    p_zone: code.zone ?? null,
    p_expire_le: code.expireLe ?? null,
    p_usage_max: code.usageMax ?? null,
    p_actif: code.actif ?? true,
  });
}

/**
 * Remboursement — délégué au gestionnaire de commandes.
 *
 * Réutilise `refund_order`, la MÊME fonction qu'appelle le webhook de
 * remboursement : le retrait des droits par ligne (arbitrage Q9.1) ne doit pas
 * exister deux fois.
 */
export async function rembourserCommande(
  acteur: ActeurId,
  orderId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();

  // L'acteur est posé d'abord, dans une transaction distincte : `refund_order`
  // est partagée avec le webhook et ne prend pas d'acteur. Le déclencheur
  // d'audit tracera donc le remboursement avec un acteur nul, comme pour un
  // remboursement venu du prestataire — et la trace ci-dessous nomme, elle,
  // l'administrateur qui l'a demandé.
  const verification = await appeler<null>(client, 'admin_poser_acteur', {
    p_acteur: acteur,
    p_motif: null,
  });
  if (!verification.ok) return verification;

  return await appeler<unknown>(client, 'refund_order', { p_order_id: orderId });
}

/**
 * Purge des copies filigranées — déclenchement manuel.
 *
 * Solution intermédiaire pour P1 de docs/PLAN.md §5 quater : un déclenchement à
 * la main vaut mieux qu'un appel qui n'existe pas.
 *
 * C'est une opération de MAINTENANCE et non une simulation : sa place est ici et
 * pas dans la console `/dev` (point 8 de l'étape).
 */
export async function declencherPurgeCopies(
  acteur: ActeurId,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<{ effacees: number }>> {
  const client = options.client ?? createServiceClient();

  const verification = await appeler<null>(client, 'admin_poser_acteur', {
    p_acteur: acteur,
    p_motif: null,
  });
  if (!verification.ok) return verification;

  const effacees = await purgerCopies({ client });

  // Tracé APRÈS l'effacement, avec le nombre réellement effacé : une trace
  // écrite d'avance annoncerait un résultat qu'elle ne connaît pas.
  const trace = await appeler<null>(client, 'admin_tracer_purge', {
    p_acteur: acteur,
    p_nombre: effacees,
  });
  if (!trace.ok) return trace;

  return { ok: true, donnees: { effacees } };
}
