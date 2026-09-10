'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { traduire, type CleTraduction, type LangueInterface } from '@/i18n';
import { annoncerChangementPanier } from '@/components/panier/synchronisation';
import styles from './toast.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE TOAST — une seule place, jamais une pile.                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CODE VIENT DE L'URL, LE TEXTE N'EN VIENT JAMAIS.                      │
 * │                                                                          │
 * │ `10-animation-spec.md` propose de faire passer le message par un cookie  │
 * │ ou un `?toast=` que le composant consomme. On retient le paramètre — un  │
 * │ cookie survivrait à la navigation et rejouerait le message ailleurs.     │
 * │                                                                          │
 * │ Mais le paramètre ne porte PAS le texte : il porte un CODE, validé       │
 * │ contre une liste fermée. Sans cette validation, n'importe qui pourrait   │
 * │ envoyer un lien qui fait dire au site ce qu'il veut — « Votre paiement   │
 * │ a échoué, appelez ce numéro » s'afficherait dans le bandeau officiel du  │
 * │ produit, avec sa police et sa couleur. Un code inconnu n'affiche rien.   │
 * │                                                                          │
 * │ C'est la même règle que partout ailleurs dans ce dépôt : les messages    │
 * │ destinés à l'utilisateur viennent du dictionnaire, jamais de la requête. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE SEULE PLACE, ET LE PARAMÈTRE EST RETIRÉ DE L'ADRESSE.               │
 * │                                                                          │
 * │ Sans le retrait, recharger la page rejouerait « Connexion réussie » sur  │
 * │ quelqu'un qui vient de se déconnecter, et l'adresse partagée porterait   │
 * │ un message qui ne concerne pas celui qui la reçoit.                      │
 * │                                                                          │
 * │ Le retrait passe par `replace` et non `push` : sinon le bouton « retour »│
 * │ ramènerait à la même page, toast compris, en boucle.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le nom du paramètre. Court, parce qu'il traverse des redirections. */
export const PARAM_TOAST = 'toast';

/**
 * LA LISTE FERMÉE.
 *
 * Chaque code est une clé du dictionnaire. Ajouter un message se fait ici et
 * dans les deux dictionnaires — pas dans la Server Action qui le déclenche.
 */
const MESSAGES = {
  connexion: 'toast.connexion',
  inscription: 'toast.inscription',
  deconnexion: 'toast.deconnexion',
  motDePasse: 'toast.motDePasse',
  profil: 'toast.profil',
  panierAjout: 'toast.panierAjout',
  panierRetrait: 'toast.panierRetrait',
  avisDepose: 'toast.avisDepose',
  avisRetire: 'toast.avisRetire',
  reprise: 'toast.reprise',
  panierAjoutTitre: 'toast.panierAjoutTitre',
  panierRefus: 'toast.panierRefus',
} as const satisfies Record<string, CleTraduction>;

export type CodeToast = keyof typeof MESSAGES;

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX LISTES, ET LA SECONDE EST PLUS COURTE QUE LA PREMIÈRE.             │
 * │                                                                          │
 * │ `MESSAGES` dit ce que le produit sait afficher. `DEPUIS_URL` dit ce      │
 * │ qu'on accepte de l'ADRESSE, et c'est un sous-ensemble.                    │
 * │                                                                          │
 * │ Les messages à substitution en sont exclus : `reprise` attend un numéro  │
 * │ de page, `panierAjoutTitre` attend un titre de conte. Posés depuis       │
 * │ l'adresse, ils s'afficheraient avec leur gabarit en clair — « « {titre} »│
 * │ ajouté au panier » — c'est-à-dire un bandeau officiel manifestement      │
 * │ cassé, offert à quiconque partage un lien.                               │
 * │                                                                          │
 * │ Leur valeur ne vient donc QUE du code client qui les pose, jamais d'une  │
 * │ chaîne reçue. C'est la même règle que la liste fermée elle-même, poussée │
 * │ d'un cran : ce n'est pas seulement le message qui doit être connu, c'est │
 * │ aussi le chemin par lequel il arrive.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const DEPUIS_URL = new Set<CodeToast>([
  'connexion',
  'inscription',
  'deconnexion',
  'motDePasse',
  'profil',
  'panierAjout',
  'panierRetrait',
  'avisDepose',
  'avisRetire',
]);

export function codeToastValide(brut: string | null | undefined): CodeToast | null {
  if (!brut) return null;
  return DEPUIS_URL.has(brut as CodeToast) ? (brut as CodeToast) : null;
}

/** La durée d'affichage, reprise du dossier. */
const DUREE_MS = 2600;

// ═══════════════════════════════════════════════════════════════════════════
// LE MAGASIN — minuscule, et volontairement sans dépendance
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `useSyncExternalStore` PLUTÔT QU'UN CONTEXTE.                           │
 * │                                                                          │
 * │ Un contexte obligerait à envelopper l'arbre entier dans un composant     │
 * │ client — c'est-à-dire à faire basculer côté client des écrans qui sont   │
 * │ rendus par le serveur, et qui doivent le rester (§5.1 : la connexion     │
 * │ lente est la condition réelle d'une partie du public).                   │
 * │                                                                          │
 * │ Un magasin externe se lit depuis n'importe quel composant client isolé,  │
 * │ sans rien envelopper.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
type Abonne = () => void;

/** Ce qu'un message peut porter en plus de son code. */
export interface SubstitutionToast {
  /** `{n}` — le numéro de page d'une reprise de lecture. */
  nombre?: number;
  /** `{titre}` — le titre d'un conte qu'on vient d'ajouter. */
  titre?: string;
}

let courant: ({ code: CodeToast; rang: number } & SubstitutionToast) | null = null;
let rangSuivant = 0;
const abonnes = new Set<Abonne>();

function prevenir(): void {
  for (const abonne of abonnes) abonne();
}

/**
 * Pose un toast. Le précédent est REMPLACÉ, jamais empilé.
 *
 * Une pile de bandeaux au bas de l'écran finit par recouvrir la commande qui
 * les a déclenchés — et sur un téléphone, elle recouvre la barre d'onglets.
 */
export function poserToast(code: CodeToast, substitution?: SubstitutionToast): void {
  rangSuivant += 1;
  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE NOMBRE NE VIENT JAMAIS DE L'ADRESSE, ET C'EST VOLONTAIRE.          │
   * │                                                                        │
   * │ `?toast=` porte un code, et rien d'autre. Ce paramètre-ci n'est        │
   * │ accessible qu'au code client qui appelle cette fonction — le lecteur,  │
   * │ pour dire à quelle page il reprend. Le faire voyager par l'URL         │
   * │ rouvrirait la porte que la liste fermée referme : « Reprise à la page  │
   * │ <ce que vous voulez> » redeviendrait du texte arbitraire dans le       │
   * │ bandeau officiel du site.                                              │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  courant = { code, rang: rangSuivant, ...substitution };
  prevenir();
}

function retirerToast(rang: number): void {
  // Le rang évite d'effacer un toast PLUS RÉCENT que celui dont la minuterie
  // vient d'expirer : sans lui, un second message posé à 2,5 s disparaîtrait
  // 100 ms plus tard, avec la minuterie du premier.
  if (courant?.rang !== rang) return;
  courant = null;
  prevenir();
}

function sabonner(abonne: Abonne): () => void {
  abonnes.add(abonne);
  return () => {
    abonnes.delete(abonne);
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE COMPOSANT
// ═══════════════════════════════════════════════════════════════════════════

export function Toaster({ langue }: { langue: LangueInterface }): ReactNode {
  const router = useRouter();
  const chemin = usePathname();
  const requete = useSearchParams();

  const [etat, setEtat] = useState<
    ({ code: CodeToast; rang: number } & SubstitutionToast) | null
  >(null);

  useEffect(() => sabonner(() => {
    setEtat(courant);
  }), []);

  /* ── Le toast venu d'une Server Action, par l'adresse ────────────────── */

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ DEUX CHAÎNES EN DÉPENDANCE, ET JAMAIS L'OBJET.                       │
   * │                                                                      │
   * │ `useSearchParams()` rend un `URLSearchParams` NEUF à chaque rendu :   │
   * │ son identité change même quand l'adresse ne bouge pas. Mis en         │
   * │ dépendance, il relance l'effet, lequel pose un toast, lequel provoque │
   * │ un rendu, lequel relance l'effet — une boucle qui ne s'arrête pas.    │
   * │                                                                      │
   * │ Elle ne se voit pas en développement : dans une application Next,     │
   * │ l'objet se trouve être stable, et tout paraît fonctionner. Elle s'est │
   * │ vue au banc d'essai, où le worker mourait au bout de trois minutes    │
   * │ sans avoir exécuté un seul test — et sans nommer la cause.            │
   * │                                                                      │
   * │ C'est le même piège que `filtresSerialises` dans la recherche         │
   * │ instantanée, et il se corrige de la même façon : comparer des         │
   * │ chaînes, dont l'égalité est une égalité de contenu.                   │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const demande = requete.get(PARAM_TOAST);
  const requeteSerialisee = requete.toString();

  useEffect(() => {
    const code = codeToastValide(demande);
    if (!code) return;

    poserToast(code);

    /*
     * Les deux codes de panier sont les seuls qui INTÉRESSENT un autre
     * onglet : ils signalent que le serveur vient d'écrire. Le signal ne
     * porte rien — l'autre onglet redemande la page et lit le compte que le
     * serveur aura calculé. Voir l'encadré de `synchronisation.tsx`.
     */
    if (code === 'panierAjout' || code === 'panierRetrait') annoncerChangementPanier();

    // Le paramètre est retiré AUSSITÔT : voir l'encadré du haut.
    const restants = new URLSearchParams(requeteSerialisee);
    restants.delete(PARAM_TOAST);
    const chaine = restants.toString();
    router.replace(chaine.length > 0 ? `${chemin}?${chaine}` : chemin, { scroll: false });
  }, [demande, requeteSerialisee, router, chemin]);

  /* ── L'effacement automatique ────────────────────────────────────────── */
  const rang = etat?.rang;

  useEffect(() => {
    if (rang === undefined) return;
    const minuterie = window.setTimeout(() => {
      retirerToast(rang);
    }, DUREE_MS);
    return () => {
      window.clearTimeout(minuterie);
    };
  }, [rang]);

  const fermer = useCallback(() => {
    if (etat) retirerToast(etat.rang);
  }, [etat]);

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LA RÉGION VIT EN PERMANENCE, MÊME VIDE.                                │
   * │                                                                        │
   * │ Une région `aria-live` insérée EN MÊME TEMPS que son contenu n'est pas  │
   * │ annoncée : le lecteur d'écran surveille des régions déjà présentes, et  │
   * │ il n'a rien à surveiller si elle apparaît avec son texte.               │
   * │                                                                        │
   * │ C'est le défaut le plus commun des notifications accessibles, et il ne  │
   * │ se voit jamais — l'écran, lui, montre bien le message.                  │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  return (
    <div className={styles.zone} role="status" aria-live="polite" aria-atomic="true">
      {etat ? (
        <button
          type="button"
          className={styles.toast}
          onClick={fermer}
          /*
           * Cliquable pour écarter, mais pas dans l'ordre de tabulation : le
           * message est déjà annoncé, et un arrêt de tabulation qui disparaît
           * au bout de 2,6 s déplacerait le focus sans prévenir.
           */
          tabIndex={-1}
        >
          {traduire(langue, MESSAGES[etat.code])
            .replace('{n}', etat.nombre === undefined ? '' : String(etat.nombre))
            .replace('{titre}', etat.titre ?? '')}
        </button>
      ) : null}
    </div>
  );
}
