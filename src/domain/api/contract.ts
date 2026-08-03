import type { AccessDecision, MotifAcces } from '@/domain/access/types';
import type {
  EntreeCatalogue,
  FicheLivre,
  PageCatalogue,
  PrixAffiche,
  RegionConte,
} from '@/domain/catalog/types';
import type { UrlsCouverture } from '@/lib/storage/covers';
import type { RefusLigne } from '@/domain/orders/types';
import type { RefusPromo } from '@/domain/orders/promo';

/**
 * CONTRAT D'API — enveloppes de réponse, DÉRIVÉES des types du domaine.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DÉRIVÉES, ET NON RÉÉCRITES. C'EST TOUT L'OBJET DE CE FICHIER.           │
 * │                                                                          │
 * │ Le backend connaît déjà la forme de ce qu'il rend : `EntreeCatalogue`,   │
 * │ `AccessDecision`, `PrixAffiche` existent et sont employés par les        │
 * │ routes. Redécrire ces formes à la main pour le frontend en ferait une    │
 * │ TROISIÈME source de vérité — après le SQL et le TypeScript du serveur —  │
 * │ et donc une troisième divergence en puissance (docs/PLAN.md §5           │
 * │ quinquies).                                                             │
 * │                                                                          │
 * │ Ce fichier ne déclare donc aucun champ métier. Il déclare des            │
 * │ ENVELOPPES : ce qui entoure les types existants dans une réponse HTTP.   │
 * │ `scripts/verifier-contrat-api.mjs` échoue si une route rend une clé      │
 * │ absente d'ici.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export type { AccessDecision, MotifAcces, EntreeCatalogue, FicheLivre, PrixAffiche, RegionConte };

/** Enveloppe d'erreur, identique sur toutes les routes. */
export interface ErreurApi {
  erreur: {
    /** Destiné au PROGRAMME. C'est sur lui que l'interface branche. */
    code: string;
    /** Destiné à l'utilisateur, en français uniquement. Jamais analysé. */
    message: string;
    champs?: Record<string, string[]>;
  };
}

/** Résultat d'un appel : le succès, ou l'erreur, jamais les deux. */
export type ResultatApi<T> =
  | { ok: true; statut: number; donnees: T }
  | { ok: false; statut: number; erreur: ErreurApi['erreur'] };

// ═══════════════════════════════════════════════════════════════════════════
// CATALOGUE
// ═══════════════════════════════════════════════════════════════════════════

export type ReponseCatalogue = PageCatalogue;
export type ReponseFiche = FicheLivre;

export interface Facette {
  valeur: string;
  nombre: number;
}

export interface ReponseFacettes {
  regions: Facette[];
  themes: Facette[];
  origines: Facette[];
  age: { min: number | null; max: number | null };
  langues: string[];
  total: number;
}

export interface ReponsePage {
  page: {
    numero: number;
    largeur: number;
    hauteur: number;
    au_titre_de_l_extrait: boolean;
  };
  url: string;
  expire_le: string;
  motif: MotifAcces;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPTE ET SESSION
// ═══════════════════════════════════════════════════════════════════════════

export interface Utilisateur {
  id: string;
  email: string;
  role: 'user' | 'admin';
  langue_preferee: string;
}

export interface ReponseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  utilisateur?: Utilisateur;
}

/**
 * Codes de refus du rafraîchissement, tels que l'interface les reçoit.
 *
 * `session_revoquee` couvre DEUX motifs internes — celui qui a déclenché la
 * détection, et la victime qui arrive après. L'interface n'a pas à les
 * distinguer : dans les deux cas, le message invite à changer le mot de passe.
 */
export type CodeRefusSession = 'session_expiree' | 'session_revoquee' | 'non_authentifie';

// ═══════════════════════════════════════════════════════════════════════════
// BIBLIOTHÈQUE
// ═══════════════════════════════════════════════════════════════════════════

export interface EntreeBibliotheque {
  livre_id: string;
  slug: string;
  titre: string;
  region: RegionConte | null;
  couverture: UrlsCouverture | null;
  langues: string[];
  acces: AccessDecision;
  possede: boolean;
  source: 'achat' | 'offert' | null;
  peut_telecharger: boolean;
  expire_le: string | null;
  reprise: { page: number; langue: string | null; derniere_lecture_le: string | null } | null;
}

export interface ReponseBibliotheque {
  /** Titres POSSÉDÉS. */
  achats: EntreeBibliotheque[];
  /**
   * Titres COMMENCÉS — pas nécessairement possédés.
   *
   * La progression survit à la perte d'accès (étape 12) : un ancien abonné
   * garde sa page de reprise sans garder le droit de lire. Les deux listes ne
   * coïncident donc pas, et les fondre ferait disparaître ce cas.
   */
  en_cours: EntreeBibliotheque[];
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMERCE
// ═══════════════════════════════════════════════════════════════════════════

export interface LignePanier {
  livre_id: string;
  titre: string;
  langue: string;
  prix_unitaire: number;
  devise: string;
}

export interface LigneRefusee {
  livre_id: string;
  titre: string;
  raison: RefusLigne;
}

export interface ReponsePanier {
  lignes: LignePanier[];
  refusees: LigneRefusee[];
  zone: string;
  /**
   * AUCUN TOTAL, et ce n'est pas un oubli.
   *
   * Le total dépend de la zone d'ENCAISSEMENT, que seule la création de
   * commande connaît. L'écran du panier l'obtient par `PUT /api/orders`, qui
   * calcule sans rien enregistrer.
   */
}

export interface ApercuCommande {
  lignes: { livre_id: string; titre: string; langue: string; prix_unitaire: number }[];
  refusees: LigneRefusee[];
  zone: string;
  devise: string;
  sous_total: number;
  remise: number;
  total: number;
  refus_promo: RefusPromo | null;
  zone_divergente: boolean;
}

export interface Offre {
  code: 'mensuel' | 'annuel';
  montant: number;
  devise: string;
  /** Déjà formaté par le serveur. L'interface l'affiche, ne le reformate pas. */
  affichage: string;
  periode: string;
}

export interface ReponseOffres {
  zone: string;
  devise: string;
  abonnement: {
    ouvert: boolean;
    jours_essai: number;
    offres: Offre[];
    /** Toujours `false`. Rendu explicitement : c'est LA confusion du domaine. */
    donne_telechargement: false;
  };
  achat_unite: {
    a_partir_de: number;
    devise: string;
    affichage: string;
    donne_telechargement: true;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPS
// ═══════════════════════════════════════════════════════════════════════════

export interface ReponseInstant {
  /**
   * Instant de l'horloge MÉTIER.
   *
   * Toute date de référence de l'interface vient d'ici, jamais de l'horloge du
   * navigateur : sous horloge simulée, les deux ne coïncident pas, et un
   * abonnement « qui expire dans trois jours » s'afficherait comme expiré
   * depuis six mois.
   *
   * La construction interdite est nommée dans `tests/unit/clock-discipline`,
   * qui la cherche par balayage de texte — l'écrire ici, fût-ce en
   * commentaire, ferait échouer ce test. Et c'est bien ainsi : un balayage
   * qui saurait distinguer le commentaire du code se laisserait tromper par
   * un commentaire habilement placé.
   */
  maintenant: string;
}
