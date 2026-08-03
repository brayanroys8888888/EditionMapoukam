import type { ReactNode } from 'react';

import { messageErreur, traduire, type LangueInterface } from '@/i18n';
import styles from './etats.module.css';

/**
 * ÉTATS PARTAGÉS — chargement, erreur, vide, hors ligne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TREIZE ÉCRANS QUI RÉINVENTENT CHACUN LEUR AFFICHAGE DE CHARGEMENT       │
 * │ PRODUISENT TREIZE COMPORTEMENTS DIFFÉRENTS SUR CONNEXION LENTE.         │
 * │                                                                          │
 * │ Et la connexion lente n'est pas un cas limite ici : §5.1 la décrit comme │
 * │ la condition réelle d'une partie du public. C'est donc l'état qu'on voit │
 * │ le plus, et celui qu'on soigne le moins — parce qu'il ne se voit pas sur │
 * │ la machine de qui l'écrit.                                              │
 * │                                                                          │
 * │ Ces composants sont donc PARTAGÉS, jamais recopiés localement. Un test   │
 * │ d'architecture échoue si un écran fabrique son propre indicateur.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

interface ProprietesBase {
  langue: LangueInterface;
}

/**
 * Chargement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AU-DELÀ DE QUELQUES SECONDES, LE MESSAGE CHANGE.                        │
 * │                                                                          │
 * │ Un indicateur qui tourne indéfiniment se lit comme une panne. Passé le   │
 * │ seuil, l'interface DIT que la connexion semble lente et qu'elle          │
 * │ continue — ce qui est vrai, et ce qui distingue « c'est long » de « ça   │
 * │ ne marche pas ». C'est la différence entre attendre et abandonner.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `role="status"` et `aria-live="polite"` : un lecteur d'écran annonce le
 * changement sans interrompre ce qui est en cours de lecture.
 */
export function Chargement({
  langue,
  lent = false,
  libelle,
}: ProprietesBase & { lent?: boolean; libelle?: string }): ReactNode {
  return (
    <div className={styles.etat} role="status" aria-live="polite">
      <span className={styles.rotor} aria-hidden="true" />
      <p className={styles.message}>{libelle ?? traduire(langue, 'etats.chargement')}</p>
      {lent ? (
        <p className={styles.detail}>{traduire(langue, 'etats.chargementLong')}</p>
      ) : null}
    </div>
  );
}

/**
 * Squelette de contenu.
 *
 * Préféré au rotor quand la FORME du résultat est connue d'avance — une grille
 * de catalogue, une liste de commandes. Le squelette réserve la place, ce qui
 * évite le décalage brutal à l'arrivée des données : sur connexion lente, ce
 * décalage fait cliquer à côté.
 */
export function Squelette({
  lignes = 3,
  libelle,
}: {
  lignes?: number;
  libelle?: string;
}): ReactNode {
  return (
    <div className={styles.squelette} role="status" aria-live="polite" aria-busy="true">
      {libelle ? <span className={styles.invisible}>{libelle}</span> : null}
      {Array.from({ length: lignes }, (_, index) => (
        <span key={index} className={styles.squeletteLigne} aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * Erreur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE MESSAGE VIENT DU `code`, JAMAIS DU `message` DE L'API.               │
 * │                                                                          │
 * │ L'API rédige ses messages en français uniquement ; les afficher tels     │
 * │ quels rendrait l'anglais impossible. Et aucun détail technique n'atteint │
 * │ jamais l'écran : les erreurs de l'API n'en portent pas, et ce composant  │
 * │ n'en fabrique pas.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Erreur({
  langue,
  code,
  onReessayer,
}: ProprietesBase & { code?: string; onReessayer?: () => void }): ReactNode {
  return (
    <div className={styles.etat} role="alert">
      <p className={styles.titre}>{traduire(langue, 'etats.erreurTitre')}</p>
      <p className={styles.message}>{messageErreur(langue, code)}</p>
      {onReessayer ? (
        <button type="button" className={styles.action} onClick={onReessayer}>
          {traduire(langue, 'etats.erreurAction')}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Hors ligne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DISTINCT D'UNE ERREUR, PARCE QUE L'ACTION L'EST.                        │
 * │                                                                          │
 * │ « Réessayer » n'a aucun sens sans réseau : le bouton échouerait, et      │
 * │ l'utilisateur conclurait que le site est cassé. L'interface dit ce qui   │
 * │ se passe et ce qui va arriver — la page revient quand la connexion       │
 * │ revient — sans rien demander.                                           │
 * │                                                                          │
 * │ Sur le public visé, la coupure est ordinaire. La traiter comme une       │
 * │ panne serait traiter la moitié des sessions comme des incidents.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function HorsLigne({ langue }: ProprietesBase): ReactNode {
  return (
    <div className={styles.etat} role="status" aria-live="polite">
      <p className={styles.titre}>{traduire(langue, 'etats.horsLigneTitre')}</p>
      <p className={styles.message}>{traduire(langue, 'etats.horsLigneCorps')}</p>
    </div>
  );
}

/**
 * Vide.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN ÉTAT VIDE SANS ISSUE EST UN CUL-DE-SAC.                              │
 * │                                                                          │
 * │ « Aucun résultat » laisse l'utilisateur devant un écran mort. Une action │
 * │ — retirer les filtres, parcourir le catalogue — le remet en mouvement.   │
 * │ C'est pourquoi `action` est proposée par défaut plutôt qu'optionnelle    │
 * │ dans l'esprit : un écran vide sans issue doit être un choix conscient.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Vide({
  langue,
  titre,
  detail,
  action,
}: ProprietesBase & { titre?: string; detail?: string; action?: ReactNode }): ReactNode {
  return (
    <div className={styles.etat}>
      <p className={styles.titre}>{titre ?? traduire(langue, 'etats.videTitre')}</p>
      {detail ? <p className={styles.message}>{detail}</p> : null}
      {action}
    </div>
  );
}
