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
  filtres: { statut?: string | null; type?: string | null } & Pagination,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_livres', {
    p_statut: filtres.statut ?? null,
    p_page: filtres.page,
    p_taille: filtres.taille,
    // Le support filtre EN BASE, pas sur la page reçue : sinon `total_lignes`
    // compterait tout le catalogue, et la pagination annoncerait des pages de
    // livrets qui n'existent pas.
    p_type: filtres.type ?? null,
  });
}

/**
 * Un titre, et tout ce que l'écran d'édition en modifie.
 *
 * Rend `introuvable` sur un identifiant inconnu — la fonction SQL ne rend
 * aucune ligne, et `maybeSingle` n'est pas disponible sur un appel RPC qui
 * déclare `returns table`. Le tableau vide est donc traduit ici, une fois,
 * plutôt que dans chaque appelant.
 */
export async function lireLivre(
  bookId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<Record<string, unknown>>> {
  const client = options.client ?? createServiceClient();

  const resultat = await appeler<Record<string, unknown>[]>(client, 'admin_lire_livre', {
    p_book_id: bookId,
  });
  if (!resultat.ok) return resultat;

  const ligne = resultat.donnees[0];
  if (!ligne) {
    return { ok: false, raison: 'introuvable', detail: 'Aucun titre pour cet identifiant.' };
  }

  return { ok: true, donnees: ligne };
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

/**
 * Le TYPE DE SUPPORT, créé par la migration 0061.
 *
 * Un conte est un récit ; un livret pédagogique est un support d'apprentissage.
 * Les deux vivent dans `books` et partagent tout le reste — droits, prix,
 * ingestion, lecture en ligne — ce qui est précisément pourquoi il s'agit d'une
 * colonne et non d'une seconde table.
 */
export type TypeDocument = 'conte' | 'livret_pedagogique';

/**
 * L'ORIENTATION de la mise en page, créée par la migration 0061.
 *
 * Elle n'est pas déduite du fichier déposé : un livret porte souvent une
 * couverture portrait devant des planches paysage. Une déduction se tromperait
 * sans le dire, sur le champ qui décide de la mise en page.
 */
export type OrientationPage = 'paysage' | 'portrait';

export async function modifierLivre(
  acteur: ActeurId,
  bookId: string,
  champs: {
    gratuit?: boolean;
    inclusAbonnement?: boolean;
    disponibleAchat?: boolean;
    auteur?: string;
    illustrateur?: string;
    origineCulturelle?: string;
    /**
     * Les THÈMES du titre — saisie libre, plusieurs par titre.
     *
     * La colonne existait depuis l'origine et alimentait une facette du
     * catalogue depuis la migration 0050, mais aucune fonction `admin_*` ne
     * pouvait l'écrire : la facette était donc vide sur tout titre déposé. La
     * migration 0070 a ouvert le champ.
     *
     * `undefined` laisse les thèmes intacts ; un tableau VIDE les efface —
     * c'est ainsi que l'éditeur retire le dernier thème d'un titre.
     */
    themes?: string[];
    typeDocument?: TypeDocument;
    orientation?: OrientationPage;
    ageMin?: number;
    ageMax?: number;
    nbPagesExtrait?: number;
    /**
     * Le NIVEAU scolaire visé — « PS · MS · GS ». Migration 0079, écrivable
     * depuis la 0081.
     *
     * Trois valeurs, trois sens, et le troisième est ce qui distingue ce champ
     * des autres : `undefined` laisse intact, une chaîne remplace, et la
     * CHAÎNE VIDE efface. La colonne est nullable, et la convention « `null`
     * veut dire ne touche pas » qui gouverne toute la fonction rendrait sinon
     * l'effacement impossible.
     */
    niveau?: string;
    /**
     * Les OBJECTIFS pédagogiques, un par entrée, DANS L'ORDRE DE SAISIE.
     *
     * Ce sont les étapes d'un livret : les trier alphabétiquement, comme le
     * fait `themes`, les mélangerait. `undefined` laisse intact ; un tableau
     * vide les efface.
     */
    objectifs?: string[];
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
    // LA RÉGION N'EST PLUS POSÉE PAR L'INTERFACE, et `null` veut dire « ne
    // touche pas » (`region = coalesce(p_region, region)`).
    //
    // La migration 0066 lui avait retiré le pouvoir de bloquer une
    // publication, la 0071 l'a retirée du catalogue public. Le paramètre reste
    // dans la signature SQL parce qu'une migration ne se réécrit pas ; il est
    // câblé à `null` ici pour que la donnée existante soit PRÉSERVÉE plutôt
    // qu'effacée au premier enregistrement d'une fiche.
    p_region: null,
    p_themes: champs.themes ?? null,
    p_illustrateur: champs.illustrateur ?? null,
    // Créés par la migration 0061, posables depuis la 0062 seulement. Entre les
    // deux, tout le catalogue serait resté « conte » et « portrait » — le même
    // défaut que `region`, mais MUET, puisque leurs valeurs par défaut ne sont
    // pas nulles et ne retiennent donc pas la publication.
    p_type_document: champs.typeDocument ?? null,
    p_orientation: champs.orientation ?? null,
    // Migration 0081. `?? null` garde la convention : un champ que l'écran
    // n'envoie pas n'est pas touché. L'effacement est une chaîne vide pour le
    // niveau, un tableau vide pour les objectifs — jamais `null`.
    p_niveau: champs.niveau ?? null,
    p_objectifs: champs.objectifs ?? null,
  });
}

/**
 * Corrige le titre et le résumé d'une version linguistique.
 *
 * La chaîne d'ingestion lit le titre dans le PDF — elle a donc raison la
 * plupart du temps, et tort exactement là où on ne peut rien y faire : un PDF
 * exporté d'un traitement de texte porte souvent « Document1 ». Le résumé, lui,
 * n'est jamais extrait, et c'est le texte que lit un client avant d'acheter.
 */
export async function modifierTraduction(
  acteur: ActeurId,
  bookId: string,
  translationId: string,
  champs: { titre?: string; resume?: string | null; description?: string | null },
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_modifier_traduction', {
    p_acteur: acteur,
    // Le titre parent EST une garde : la fonction refuse une version qui ne lui
    // appartient pas, et répond « introuvable » — la même chose qu'un
    // identifiant inventé, qui ne dit donc rien de plus.
    p_book_id: bookId,
    p_translation_id: translationId,
    p_titre: champs.titre ?? null,
    // `null` laisse le résumé intact ; la chaîne VIDE le retire. La distinction
    // est portée jusqu'ici parce qu'un éditeur doit pouvoir effacer un texte
    // qu'il a écrit.
    p_resume: champs.resume ?? null,
    // Même convention pour la description longue, créée par la migration 0070.
    p_description: champs.description ?? null,
  });
}

/**
 * Supprime un BROUILLON, et lui seul.
 *
 * Un dépôt raté doit pouvoir disparaître. Un titre publié ou archivé, non :
 * `entitlements` et `order_items` le référencent en cascade, si bien qu'une
 * suppression effacerait en silence des droits payés et des pièces comptables.
 * La garde est en base — celle-ci ne fait que transporter.
 */
export async function supprimerLivre(
  acteur: ActeurId,
  bookId: string,
  motif: string,
  options: { client?: AppSupabaseClient } = {},
) {
  const client = options.client ?? createServiceClient();
  return await appeler<null>(client, 'admin_supprimer_livre', {
    p_acteur: acteur,
    p_book_id: bookId,
    p_motif: motif,
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

/* ───────────────────────────────────────────────────────────────────────────
 * LES OFFRES D'ABONNEMENT — §4.3 F12 bis, migration 0068.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE DOMAINE ET LA PÉRIODE NE SE MODIFIENT PAS, ET CE N'EST PAS ICI QUE   │
 * │ CELA SE DÉCIDE.                                                          │
 * │                                                                          │
 * │ `admin_modifier_offre` ne prend NI `p_domaine` NI `p_periode` : la règle  │
 * │ est écrite dans sa signature, en base, une seule fois. Une offre déjà     │
 * │ souscrite qui changerait de domaine déplacerait des droits acquis d'un    │
 * │ espace à l'autre sans que personne l'ait demandé — et une offre mensuelle │
 * │ devenue annuelle facturerait douze fois ce qui a été accepté.             │
 * │                                                                          │
 * │ Le redire ici serait déjà une seconde implémentation : il suffirait qu'un │
 * │ jour la base s'assouplisse pour que ce module mente.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 * ─────────────────────────────────────────────────────────────────────────── */

/** Toutes les offres, actives ou non, avec leurs prix et ce qui leur manque. */
export async function listerOffres(
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown[]>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_offres', {});
}

export async function creerOffre(
  acteur: ActeurId,
  offre: {
    code: string;
    domaine: 'lecture' | 'association';
    periode: string;
    libelleFr: string;
    libelleEn: string;
    descriptifFr?: string | null;
    descriptifEn?: string | null;
    ordre?: number;
  },
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_creer_offre', {
    p_acteur: acteur,
    p_code: offre.code,
    p_domaine: offre.domaine,
    p_periode: offre.periode,
    p_libelle_fr: offre.libelleFr,
    p_libelle_en: offre.libelleEn,
    p_descriptif_fr: offre.descriptifFr ?? null,
    p_descriptif_en: offre.descriptifEn ?? null,
    p_ordre: offre.ordre ?? 0,
  });
}

/**
 * Modifie une offre. Un champ non transmis est laissé tel quel.
 *
 * « absent » et `null` ne se confondent pas dans la fonction SQL : elle ne
 * remplace que ce qu'on lui donne. Ce module omet donc purement et simplement
 * les clés non touchées, plutôt que d'envoyer `null` — qui, lui, effacerait.
 */
export async function modifierOffre(
  acteur: ActeurId,
  id: string,
  champs: {
    libelleFr?: string;
    libelleEn?: string;
    descriptifFr?: string;
    descriptifEn?: string;
    ordre?: number;
    actif?: boolean;
  },
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_modifier_offre', {
    p_acteur: acteur,
    p_id: id,
    ...(champs.libelleFr !== undefined ? { p_libelle_fr: champs.libelleFr } : {}),
    ...(champs.libelleEn !== undefined ? { p_libelle_en: champs.libelleEn } : {}),
    ...(champs.descriptifFr !== undefined ? { p_descriptif_fr: champs.descriptifFr } : {}),
    ...(champs.descriptifEn !== undefined ? { p_descriptif_en: champs.descriptifEn } : {}),
    ...(champs.ordre !== undefined ? { p_ordre: champs.ordre } : {}),
    ...(champs.actif !== undefined ? { p_actif: champs.actif } : {}),
  });
}

/**
 * Pose le prix d'une offre dans UNE zone.
 *
 * Le montant est exprimé dans la plus petite unité de sa devise — et le franc
 * CFA n'en a pas : 500 vaut 500 FCFA quand 500 vaut 5 € (migration 0005).
 * C'est la même convention que `definirPrix` pour les titres, et c'est la
 * raison pour laquelle aucune des deux ne divise ni ne multiplie quoi que ce
 * soit : l'entier arrive déjà exprimé ainsi.
 */
export async function poserPrixOffre(
  acteur: ActeurId,
  id: string,
  prix: { zone: 'international' | 'afrique'; montant: number; devise: string },
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_poser_prix_offre', {
    p_acteur: acteur,
    p_id: id,
    p_zone: prix.zone,
    p_montant: prix.montant,
    p_devise: prix.devise,
  });
}

/**
 * Supprime une offre — la base refuse si des abonnements s'y rattachent.
 *
 * Ce refus remonte en `regle_metier`, jamais en `introuvable` : l'éditeur doit
 * comprendre que l'offre existe et qu'elle est tenue par des contrats. La
 * désactiver est le geste qui reste, et il n'efface l'historique de personne.
 */
export async function supprimerOffre(
  acteur: ActeurId,
  id: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<null>> {
  const client = options.client ?? createServiceClient();
  return await appeler<null>(client, 'admin_supprimer_offre', { p_acteur: acteur, p_id: id });
}

/* ───────────────────────────────────────────────────────────────────────────
 * LES CONTENUS DE L'ASSOCIATION — §3.6, migration 0069.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE LIT `corps`, ET C'EST LE SEUL DU DÉPÔT QUI EN A LE DROIT.     │
 * │                                                                          │
 * │ `admin_lire_contenu_association` rend le corps de TOUTES les versions,    │
 * │ sans verdict d'accès : c'est l'écran de rédaction, et un rédacteur relit  │
 * │ ce qu'il écrit. L'appel passe par `service_role`, donc les privilèges de  │
 * │ colonne qui ferment `corps` à `anon` et `authenticated` ne s'y opposent   │
 * │ pas — et c'est exactement pour cela que la garde d'administration est     │
 * │ obligatoire sur chaque route qui appelle ceci.                            │
 * │                                                                          │
 * │ Le chemin PUBLIC ne passe jamais par ici. Il passe par                    │
 * │ `src/lib/association/service.ts`, qui appelle `association_contenu` et    │
 * │ reçoit `corps` à `null` dès que le droit est fermé.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 * ─────────────────────────────────────────────────────────────────────────── */

export async function listerContenusAssociation(
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown[]>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_contenus_association', {});
}

/** Le détail d'un contenu, versions et corps compris. */
export async function lireContenuAssociation(
  id: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_lire_contenu_association', { p_id: id });
}

export async function creerContenuAssociation(
  acteur: ActeurId,
  contenu: {
    slug: string;
    categorie: string;
    titre: string;
    chapeau?: string;
    acces?: 'libre' | 'abonnes';
    minutes?: number | null;
    imageUrl?: string | null;
  },
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_creer_contenu_association', {
    p_acteur: acteur,
    p_slug: contenu.slug,
    p_categorie: contenu.categorie,
    p_titre: contenu.titre,
    p_chapeau: contenu.chapeau ?? '',
    p_acces: contenu.acces ?? 'abonnes',
    p_minutes: contenu.minutes ?? null,
    p_image_url: contenu.imageUrl ?? null,
  });
}

export async function modifierContenuAssociation(
  acteur: ActeurId,
  id: string,
  champs: {
    categorie?: string;
    acces?: 'libre' | 'abonnes';
    minutes?: number | null;
    imageUrl?: string | null;
    vedette?: boolean;
    ordre?: number;
  },
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_modifier_contenu_association', {
    p_acteur: acteur,
    p_id: id,
    ...(champs.categorie !== undefined ? { p_categorie: champs.categorie } : {}),
    ...(champs.acces !== undefined ? { p_acces: champs.acces } : {}),
    ...(champs.minutes !== undefined ? { p_minutes: champs.minutes } : {}),
    ...(champs.imageUrl !== undefined ? { p_image_url: champs.imageUrl } : {}),
    ...(champs.vedette !== undefined ? { p_vedette: champs.vedette } : {}),
    ...(champs.ordre !== undefined ? { p_ordre: champs.ordre } : {}),
  });
}

/**
 * Écrit une version — titre, chapeau, corps — dans UNE langue.
 *
 * Le corps est transporté tel quel. Le valider ici rejouerait une forme que la
 * base contraint déjà (`jsonb_typeof(corps) = 'array'`) et que le lecteur
 * public relit une dernière fois, section par section, avant de rendre la page.
 */
export async function poserVersionAssociation(
  acteur: ActeurId,
  id: string,
  version: { langue: string; titre: string; chapeau?: string | null; corps?: unknown },
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_poser_version_association', {
    p_acteur: acteur,
    p_id: id,
    p_langue: version.langue,
    p_titre: version.titre,
    p_chapeau: version.chapeau ?? null,
    p_corps: version.corps ?? null,
  });
}

/**
 * Publie ou dépublie — la base refuse une publication sans version française.
 *
 * C'est le pendant exact de `manques_pour_publication` pour les titres : le
 * contrôle vit dans la fonction, jamais dans l'écran qui l'appelle.
 */
export async function publierContenuAssociation(
  acteur: ActeurId,
  id: string,
  publie: boolean,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_publier_contenu_association', {
    p_acteur: acteur,
    p_id: id,
    p_publie: publie,
  });
}

export async function supprimerContenuAssociation(
  acteur: ActeurId,
  id: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<null>> {
  const client = options.client ?? createServiceClient();
  return await appeler<null>(client, 'admin_supprimer_contenu_association', {
    p_acteur: acteur,
    p_id: id,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LES AVIS DES LECTEURS — migration 0072
// ═══════════════════════════════════════════════════════════════════════════

/* ───────────────────────────────────────────────────────────────────────────
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI L'ADMINISTRATION VOIT DES AVIS QUE PERSONNE D'AUTRE NE VOIT.   │
 * │                                                                          │
 * │ `book_reviews` est fermée par RLS : le public ne lit que les avis         │
 * │ `publie`, et un lecteur connecté voit en plus le sien. La file de         │
 * │ modération a besoin de l'inverse — tout ce qui attend, et tout ce qui a   │
 * │ été refusé — ce que seule une fonction `security definer` appelée par     │
 * │ `service_role` peut rendre.                                              │
 * │                                                                          │
 * │ `admin_lister_avis` rend aussi l'ADRESSE ÉLECTRONIQUE de l'auteur. C'est  │
 * │ la seule surface du dépôt où elle apparaît à côté d'un avis, et c'est ce  │
 * │ qui permet de répondre à une contestation. Elle ne sort donc jamais des   │
 * │ routes gardées par `gardeAdmin`.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 * ─────────────────────────────────────────────────────────────────────────── */

export type StatutAvis = 'en_attente' | 'publie' | 'rejete';

export async function listerAvis(
  filtre: { statut?: StatutAvis; book?: string } = {},
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown[]>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_avis', {
    p_statut: filtre.statut ?? null,
    p_book: filtre.book ?? null,
  });
}

/**
 * Publie ou refuse un avis.
 *
 * Le motif n'accompagne qu'un refus, et il est RENDU À SON AUTEUR sur la fiche
 * du titre : c'est un message, pas une note interne. La base l'efface d'ailleurs
 * dès qu'un avis repasse en `publie`, pour qu'un ancien refus ne reste pas
 * collé à un texte finalement accepté.
 */
export async function modererAvis(
  acteur: ActeurId,
  avis: string,
  decision: StatutAvis,
  motif?: string | null,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_moderer_avis', {
    p_acteur: acteur,
    p_avis: avis,
    p_decision: decision,
    p_motif: motif ?? null,
  });
}

/**
 * Supprime un avis — le geste qui ne laisse rien.
 *
 * Distinct du refus : un avis refusé reste visible de son auteur, avec le motif,
 * et peut être corrigé. Un avis supprimé disparaît, et son auteur peut en écrire
 * un nouveau — l'unicité `(book_id, user_id)` le lui interdisait tant que le
 * premier existait.
 */
export async function supprimerAvis(
  acteur: ActeurId,
  avis: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<null>> {
  const client = options.client ?? createServiceClient();
  return await appeler<null>(client, 'admin_supprimer_avis', {
    p_acteur: acteur,
    p_avis: avis,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LES TÉMOIGNAGES DU SITE — migration 0073
// ═══════════════════════════════════════════════════════════════════════════

/* ───────────────────────────────────────────────────────────────────────────
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE SONT LES TROIS CITATIONS DE LA PAGE D'ACCUEIL.                       │
 * │                                                                          │
 * │ Elles vivaient dans `src/i18n/fr.json`, en dur : les changer demandait un │
 * │ déploiement, et rien ne distinguait une citation de lecteur d'un libellé  │
 * │ de bouton. La migration 0073 les a reprises mot pour mot dans            │
 * │ `testimonials`, et ce sont désormais du CONTENU.                          │
 * │                                                                          │
 * │ À ne pas confondre avec `book_reviews` juste au-dessus : un témoignage    │
 * │ parle du SITE et il est écrit par l'éditeur, un avis parle d'un TITRE et  │
 * │ il est écrit par un lecteur depuis son compte. Le premier n'a pas de      │
 * │ file de modération, puisqu'il ne vient de personne d'autre.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 * ─────────────────────────────────────────────────────────────────────────── */

export async function listerTemoignages(
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown[]>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown[]>(client, 'admin_lister_temoignages', {});
}

export async function lireTemoignage(
  id: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_lire_temoignage', { p_id: id });
}

/**
 * Crée ou met à jour un témoignage, versions comprises.
 *
 * `id` à `null` crée. Les versions arrivent en bloc, et la base y applique une
 * règle qu'aucun écran ne rejoue : une langue absente du tableau est laissée
 * intacte, une langue présente avec un texte vide est supprimée.
 */
export async function enregistrerTemoignage(
  acteur: ActeurId,
  temoignage: {
    id?: string | null;
    auteur: string;
    ordre?: number;
    versions?: { langue: string; texte: string; role?: string | null }[];
  },
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_enregistrer_temoignage', {
    p_acteur: acteur,
    p_id: temoignage.id ?? null,
    p_auteur: temoignage.auteur,
    p_ordre: temoignage.ordre ?? 0,
    p_versions: temoignage.versions ?? [],
  });
}

/** Publie ou dépublie — la base refuse une publication sans texte français. */
export async function publierTemoignage(
  acteur: ActeurId,
  id: string,
  publie: boolean,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<unknown>> {
  const client = options.client ?? createServiceClient();
  return await appeler<unknown>(client, 'admin_publier_temoignage', {
    p_acteur: acteur,
    p_id: id,
    p_publie: publie,
  });
}

export async function supprimerTemoignage(
  acteur: ActeurId,
  id: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatAdmin<null>> {
  const client = options.client ?? createServiceClient();
  return await appeler<null>(client, 'admin_supprimer_temoignage', {
    p_acteur: acteur,
    p_id: id,
  });
}
