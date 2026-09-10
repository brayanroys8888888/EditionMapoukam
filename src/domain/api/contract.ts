import type { AccessDecision, MotifAcces } from '@/domain/access/types';
import type {
  EntreeCatalogue,
  FicheLivre,
  PageCatalogue,
  PrixAffiche,
} from '@/domain/catalog/types';
import type { UrlsCouverture } from '@/lib/storage/covers';
import type { RefusLigne } from '@/domain/orders/types';
import type { RefusPromo } from '@/domain/orders/promo';
import type { DomaineAbonnement } from '@/domain/subscriptions/domaines';

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

export type { AccessDecision, MotifAcces, EntreeCatalogue, FicheLivre, PrixAffiche };

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
  /*
   * `regions` a disparu avec la migration 0071. La facette était rendue avec
   * son effectif, mais elle ne pouvait ranger que la moitié du catalogue : une
   * fiche d'activités n'a pas de région d'origine.
   */
  /**
   * Contes et livrets pédagogiques, avec leur effectif RÉEL au catalogue.
   *
   * Une pastille « Livrets pédagogiques » écrite en dur serait une porte sur
   * une pièce vide tant qu'aucun n'est publié. Elle vient donc de la base,
   * comme les thèmes.
   */
  types: Facette[];
  themes: Facette[];
  /**
   * Les NIVEAUX scolaires, éclatés en jetons — migration 0083.
   *
   * `books.niveau` est composé : « PS · MS · GS » désigne trois classes. La
   * facette compte donc les JETONS, sans quoi elle rendrait deux pastilles
   * qui se recouvrent et aucun moyen de demander « tout ce qui convient à
   * des MS ».
   *
   * Elle ne compte que les LIVRETS : un conte n'a pas de niveau, et les
   * inclure ferait un dénominateur qui ne veut rien dire.
   */
  niveaux: Facette[];
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
  /**
   * Les thèmes du titre. Ils décident la palette du substitut de couverture
   * (`teinteDepuisThemes`) — rôle que tenait `region` jusqu'à la migration 0071.
   */
  themes: string[];
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

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES MONTANTS SONT RENDUS DEUX FOIS : EN ENTIER, ET FORMATÉS.            │
 * │                                                                          │
 * │ Les entiers restent l'autorité — ils servent aux comparaisons et à la    │
 * │ confirmation de total. Les `*_affichage` sont là pour un CLIENT, qui ne  │
 * │ peut pas formater lui-même.                                              │
 * │                                                                          │
 * │ Pourquoi il ne le peut pas : le nombre de décimales dépend de la devise. │
 * │ Le franc CFA n'a pas de sous-unité, l'euro en a deux. Un `montant / 100` │
 * │ écrit dans un navigateur afficherait « 49,90 FCFA » là où le serveur dit │
 * │ « 4 990 FCFA » — une erreur d'un facteur cent, dans un panier.           │
 * │                                                                          │
 * │ Le tiroir de panier est le premier écran à en avoir besoin : il est      │
 * │ rendu par le client, et il montre un total.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface ApercuCommande {
  lignes: {
    livre_id: string;
    titre: string;
    langue: string;
    prix_unitaire: number;
    /** Le prix unitaire formaté par le SERVEUR, seule autorité sur les décimales. */
    prix_affichage: string;
    /**
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ TROIS CHAMPS D'AFFICHAGE, ET AUCUN N'OUVRE DE DROIT.                │
     * │                                                                      │
     * │ Le tiroir de panier du prototype montre une couverture de 62 × 90 et │
     * │ une ligne « 5–10 ans · 20 pages » sous chaque titre. Une ligne de    │
     * │ panier ne les portait pas : le tiroir affichait donc trois titres    │
     * │ nus, que rien ne distinguait d'une liste de courses.                 │
     * │                                                                      │
     * │ Ils sont OPTIONNELS et purement descriptifs. Un titre sans           │
     * │ couverture — en cours d'ingestion — rend `null`, et l'interface pose │
     * │ son substitut. Le prix, lui, reste formaté par le serveur : ces      │
     * │ champs n'autorisent aucun calcul de plus dans le navigateur.         │
     * │                                                                      │
     * │ L'âge et la pagination sortent en NOMBRES, jamais en phrase          │
     * │ composée : « 5–10 ans · 20 pages » se traduit, et cette route ne     │
     * │ connaît pas la langue de l'interface — seulement celle du contenu    │
     * │ commandé, qui n'est pas la même chose. `metaLivre` compose la ligne  │
     * │ à l'affichage, au même endroit que pour les cartes du catalogue.     │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    couverture: string | null;
    age_min: number | null;
    age_max: number | null;
    nb_pages: number | null;
    /** Le slug, pour que la ligne mène à la fiche. */
    slug: string | null;
  }[];
  refusees: LigneRefusee[];
  zone: string;
  devise: string;
  sous_total: number;
  sous_total_affichage: string;
  remise: number;
  remise_affichage: string;
  total: number;
  total_affichage: string;
  refus_promo: RefusPromo | null;
  zone_divergente: boolean;
}

/**
 * Une formule d'abonnement, telle que l'éditeur l'a écrite dans `/admin/offres`.
 *
 * `code` n'est plus `mensuel | annuel` : depuis la migration 0068, les formules
 * sont des lignes de base, créées et tarifées par l'éditeur. La PÉRIODE de
 * facturation reste `mensuel | annuel` — elle donne la durée — mais elle est
 * devenue un attribut de la formule, et non son identité.
 */
export interface Offre {
  /** Code de la formule, ex. `lecture-mensuel`. Stable, c'est lui qu'on souscrit. */
  code: string;
  /** Ce que la formule ouvre. Les deux domaines sont étanches (§3.6). */
  domaine: DomaineAbonnement;
  montant: number;
  devise: string;
  /** Déjà formaté par le serveur. L'interface l'affiche, ne le reformate pas. */
  affichage: string;
  /** Libellé de la périodicité, déjà traduit : « mois » ou « an ». */
  periode: string;
  /** Intitulé commercial, écrit par l'éditeur. */
  libelle: string;
  descriptif: string | null;
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
  /**
   * L'abonnement à l'Association Dave — §3.6.
   *
   * Séparé de `abonnement`, et non ajouté à sa liste : les deux abonnements
   * sont ÉTANCHES, et une interface qui les afficherait dans la même grille
   * laisserait croire qu'on choisit entre eux. On peut souscrire aux deux.
   *
   * `offres` est vide tant que l'éditeur n'a créé aucune formule associative :
   * aucun tarif n'est inventé ici.
   */
  association: {
    offres: Offre[];
    /** Toujours `false` : il n'y a rien à télécharger dans l'espace associatif. */
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
