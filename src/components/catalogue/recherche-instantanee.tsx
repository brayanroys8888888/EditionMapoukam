'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { RotorInline } from '@/components/etats';
import styles from './catalogue.module.css';

/**
 * LA RECHERCHE QUI RÉPOND PENDANT QU'ON TAPE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FORMULAIRE RESTE UN VRAI FORMULAIRE `GET`.                            │
 * │                                                                          │
 * │ Ce composant n'en remplace pas la mécanique : il l'ANTICIPE. Sans        │
 * │ JavaScript — extension de blocage, script en échec, navigateur ancien —  │
 * │ le `<form method="get">` et son bouton fonctionnent exactement comme     │
 * │ avant, et la page se recharge. C'est la raison pour laquelle le bouton   │
 * │ « Rechercher » n'est pas retiré : il est le chemin de repli, et un       │
 * │ chemin de repli qu'on cache n'en est plus un.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `replace`, ET NON `push` — L'HISTORIQUE N'EST PAS UN JOURNAL DE FRAPPE.  │
 * │                                                                          │
 * │ Chercher « lion » en poussant une entrée d'historique par lettre         │
 * │ demanderait quatre retours en arrière pour revenir d'où l'on vient. La   │
 * │ frappe REMPLACE donc l'entrée courante ; l'URL reste partageable et      │
 * │ rechargeable, ce qui est tout ce qu'on lui demande.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AUCUNE ROUTE NOUVELLE, AUCUNE SECONDE IMPLÉMENTATION.                    │
 * │                                                                          │
 * │ La navigation douce de Next redemande LE MÊME composant serveur que la   │
 * │ soumission du formulaire aurait atteint, avec les mêmes paramètres       │
 * │ validés par le même schéma. Un point d'entrée JSON dédié aurait été une  │
 * │ seconde façon de lire le catalogue — donc une seconde à maintenir juste. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le temps qu'on laisse au doigt avant de partir chercher. */
const ATTENTE_MS = 350;

export function RechercheInstantanee({
  action,
  caches,
  valeurInitiale,
  libelle,
  placeholder,
  libelleAction,
}: {
  /** Le chemin du rayon — `/fr/catalogue`, `/fr/contes`… */
  action: string;
  /** Les autres filtres, reportés tels quels : chercher ne les efface pas. */
  caches: readonly (readonly [string, string])[];
  valeurInitiale: string;
  libelle: string;
  placeholder: string;
  libelleAction: string;
}): ReactNode {
  const router = useRouter();
  const [saisie, setSaisie] = useState(valeurInitiale);
  const [enTransition, demarrerTransition] = useTransition();

  /*
   * La première exécution ne cherche RIEN.
   *
   * Sans cette garde, l'arrivée sur `/catalogue?q=lion` déclencherait
   * immédiatement une navigation vers `/catalogue?q=lion` — la même adresse,
   * pour rien, à chaque ouverture de la page.
   */
  const premiereFois = useRef(true);

  /** Le champ, pour que le raccourci clavier puisse l'atteindre. */
  const champ = useRef<HTMLInputElement | null>(null);

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ⌘K / Ctrl+K AMÈNE AU CHAMP — IL N'OUVRE PAS UNE SECONDE RECHERCHE.  │
   * │                                                                      │
   * │ `10-animation-spec.md` demande le raccourci pour une surcouche de    │
   * │ recherche qui n'existe pas ici : la recherche de ce produit est un   │
   * │ vrai formulaire, dans la page, et elle marche sans JavaScript. Une   │
   * │ surcouche en serait une seconde — deux champs, deux états, et le     │
   * │ risque qu'ils ne disent pas la même chose.                           │
   * │                                                                      │
   * │ Le raccourci fait donc ce qu'il promet : il donne le focus, il       │
   * │ sélectionne ce qui s'y trouve déjà, et il amène le champ à l'écran.  │
   * │ `preventDefault` retient le raccourci du navigateur, comme le        │
   * │ dossier l'exige.                                                     │
   * │                                                                      │
   * │ Il n'est actif QUE là où le champ existe. Un raccourci global qui    │
   * │ ne fait rien sur les trois quarts du site est pire qu'aucun.         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    function surTouche(evenement: KeyboardEvent): void {
      if (evenement.key !== 'k' && evenement.key !== 'K') return;
      if (!evenement.metaKey && !evenement.ctrlKey) return;

      const cible = champ.current;
      if (!cible) return;

      evenement.preventDefault();
      cible.focus();
      cible.select();
      cible.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    window.addEventListener('keydown', surTouche);
    return () => {
      window.removeEventListener('keydown', surTouche);
    };
  }, []);

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA SOUMISSION CESSE DE RECHARGER LA PAGE — SANS CESSER D'EXISTER.   │
   * │                                                                      │
   * │ Le formulaire est un vrai `<form method="get">`, et c'est ce qui le  │
   * │ rend utilisable sans JavaScript. Mais AVEC JavaScript, la frappe a   │
   * │ déjà mis les résultats à jour : cliquer « Rechercher » ou presser    │
   * │ Entrée refaisait alors une navigation COMPLÈTE vers l'adresse où     │
   * │ l'on se trouve déjà — écran blanc, polices réévaluées, défilement    │
   * │ remis à zéro, pour aucun résultat nouveau.                           │
   * │                                                                      │
   * │ On intercepte donc la soumission et on rejoue le même chemin que la  │
   * │ frappe. Le formulaire n'est pas modifié : sans JavaScript, cet effet │
   * │ ne s'exécute jamais et la soumission native reprend son rôle.        │
   * │                                                                      │
   * │ L'écouteur est posé sur `champ.current.form` plutôt que par une      │
   * │ prop `onSubmit` : le `<form>` est rendu par un composant SERVEUR,    │
   * │ partagé par les trois directions, et lui passer un gestionnaire      │
   * │ obligerait à le faire basculer côté client tout entier.              │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    const formulaire = champ.current?.form;
    if (!formulaire) return;

    function surSoumission(evenement: SubmitEvent): void {
      evenement.preventDefault();
      const cible = champ.current;
      if (cible) cible.blur();
      naviguer();
    }

    formulaire.addEventListener('submit', surSoumission);
    return () => {
      formulaire.removeEventListener('submit', surSoumission);
    };
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LES FILTRES ENTRENT DANS L'EFFET COMME UNE CHAÎNE, JAMAIS COMME UN   │
   * │ TABLEAU.                                                             │
   * │                                                                      │
   * │ `caches` est reconstruit à chaque rendu du composant serveur : son   │
   * │ IDENTITÉ change même quand son contenu ne bouge pas. En dépendance   │
   * │ d'effet, il relancerait donc la navigation, laquelle provoque un     │
   * │ rendu, lequel relance la navigation — une boucle qui ne s'arrête pas │
   * │ et qui ne se voit qu'à l'usage, jamais dans un test de rendu.        │
   * │                                                                      │
   * │ Comparée par valeur, la chaîne ne change que si un filtre change.    │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const filtresSerialises = caches.map(([nom, valeur]) => `${nom}=${valeur}`).join('&');

  /**
   * Le chemin unique vers les résultats — frappe ET soumission l'empruntent.
   *
   * Écrit une fois : deux façons d'atteindre la même liste finiraient par
   * diverger sur un détail — un filtre reporté ici et pas là, un `scroll`
   * différent — et la seconde est celle qu'on essaie le moins souvent.
   */
  const naviguer = (): void => {
    const parametres = new URLSearchParams(filtresSerialises);

    const nettoyee = saisie.trim();
    if (nettoyee) parametres.set('q', nettoyee);

    const requete = parametres.toString();
    demarrerTransition(() => {
      // `scroll: false` : on cherche en regardant la grille, et remonter en
      // haut de page à chaque lettre la ferait disparaître sous les yeux.
      router.replace(requete ? `${action}?${requete}` : action, { scroll: false });
    });
  };

  useEffect(() => {
    if (premiereFois.current) {
      premiereFois.current = false;
      return;
    }

    const minuterie = window.setTimeout(() => {
      naviguer();
    }, ATTENTE_MS);

    return () => {
      window.clearTimeout(minuterie);
    };
  }, [saisie, action, filtresSerialises, router]);

  return (
    <>
      <label htmlFor="catalogue-q" className={styles.rechercheLibelle}>
        {libelle}
      </label>
      <input
        ref={champ}
        id="catalogue-q"
        name="q"
        type="search"
        value={saisie}
        onChange={(evenement) => {
          setSaisie(evenement.target.value);
        }}
        placeholder={placeholder}
        className={styles.rechercheSaisie}
        autoComplete="off"
      />
      <button type="submit" className={styles.rechercheBouton}>
        {enTransition ? <RotorInline /> : null}
        {libelleAction}
      </button>
    </>
  );
}
