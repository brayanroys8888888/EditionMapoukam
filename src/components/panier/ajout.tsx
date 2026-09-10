'use client';

import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { traduire, type LangueInterface } from '@/i18n';
import { poserToast } from '@/components/toast';
import {
  bougerCompteurPanier,
  demanderOuvertureTiroir,
} from '@/components/panier/magasin';
import { annoncerChangementPanier } from '@/components/panier/synchronisation';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ AJOUTER AU PANIER SANS RECHARGER — et sans perdre le cas sans JavaScript. ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FORMULAIRE RESTE UN FORMULAIRE, ET SA SERVER ACTION RESTE BRANCHÉE.  │
 * │                                                                          │
 * │ Jusqu'ici, ajouter un titre soumettait une Server Action qui redirigeait │
 * │ avec `?toast=panierAjout` : la page entière était redemandée, la grille  │
 * │ repeinte, le défilement conservé de justesse. Sur la connexion lente du  │
 * │ §5.1, ce sont deux secondes pendant lesquelles rien ne dit que le clic a │
 * │ été pris.                                                                │
 * │                                                                          │
 * │ Ce composant ne remplace pas ce chemin : il le DOUBLE. L'élément reste   │
 * │ un `<form action={…}>` avec la même Server Action ; sans JavaScript, le  │
 * │ navigateur la soumet comme avant, et tout fonctionne. Avec JavaScript,   │
 * │ `onSubmit` prend la main, empêche la navigation, et appelle la même      │
 * │ route que la Server Action appelait.                                     │
 * │                                                                          │
 * │ C'est la seule forme d'amélioration progressive qui ne crée pas deux     │
 * │ implémentations : les deux chemins finissent sur `POST /api/cart`, qui   │
 * │ reste seul à décider si l'ajout est permis.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE QUI EST OPTIMISTE, ET CE QUI NE L'EST PAS.                           │
 * │                                                                          │
 * │ Optimiste : la pastille de comptage et le toast, posés sur la même image │
 * │ que le clic — c'est ce que `11-realtime-behaviour.md` demande.           │
 * │                                                                          │
 * │ Pas optimiste : le CONTENU du tiroir, le total, et le droit d'acheter.   │
 * │ Ils viennent du serveur, qui seul connaît la grille tarifaire, la zone   │
 * │ et ce que l'utilisateur possède déjà. Un ajout refusé — titre déjà       │
 * │ possédé, titre non vendu à l'unité — annule l'avance et le dit.          │
 * │                                                                          │
 * │ L'avance est un ENTIER, pas une liste : voir `magasin.ts`. Elle ne       │
 * │ survit ni à la réponse du serveur ni à un rechargement.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Les issues que la route peut rendre, et qui changent ce qu'on affiche. */
type Issue = 'ajoute' | 'deja' | 'connexion' | 'refus';

async function poster(livreId: string, langueContenu: string): Promise<Issue> {
  const reponse = await fetch('/api/cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ book_id: livreId, langue: langueContenu }),
    cache: 'no-store',
  }).catch(() => null);

  if (!reponse) return 'refus';
  // Le visiteur n'a pas de panier : la route rend 401, et l'écran de
  // connexion sait, lui, où le ramener.
  if (reponse.status === 401) return 'connexion';

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ « DÉJÀ AU PANIER » EST UN SUCCÈS, PAS UN REFUS.                       │
   * │                                                                        │
   * │ La route répond 200 dans les deux cas : la ligne EST au panier. Ce qui │
   * │ change est `deja`, que le domaine rapporte depuis la lecture faite     │
   * │ avant l'écriture. C'est la seule façon de tenir la règle de `06` sans  │
   * │ tenir le panier côté client.                                           │
   * │                                                                        │
   * │ Le 409, lui, est un vrai refus : titre déjà possédé, ou non vendu à    │
   * │ l'unité. Les deux méritent d'être dits, jamais avalés.                 │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  if (reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as { deja?: boolean } | null;
    return corps?.deja === true ? 'deja' : 'ajoute';
  }

  return 'refus';
}

export function FormulaireAjout({
  langue,
  livreId,
  titre,
  action,
  className,
  children,
}: {
  langue: LangueInterface;
  livreId: string;
  /**
   * Le titre, pour le toast — « « L'oiseau de feu » ajouté au panier ».
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ IL NE PASSE PAS PAR L'ADRESSE, ET C'EST TOUT L'INTÉRÊT.                │
   * │                                                                        │
   * │ Le chemin sans JavaScript ne peut poser qu'un CODE dans l'URL, et le   │
   * │ toaster refuse d'y lire du texte — sans quoi n'importe quel lien       │
   * │ ferait dire au site ce qu'il veut, dans son bandeau officiel. Le       │
   * │ message générique « Ajouté au panier. » est le prix de ce refus.       │
   * │                                                                        │
   * │ Ici, le titre vient du rendu SERVEUR de la carte qu'on vient de        │
   * │ cliquer : il n'a jamais traversé la barre d'adresse. Le message peut   │
   * │ donc le nommer, ce qui est ce que le prototype montre.                 │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  titre: string;
  /** La Server Action — le chemin sans JavaScript. Jamais retirée. */
  action: (donnees: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  const surSoumission = useCallback(
    (evenement: FormEvent<HTMLFormElement>) => {
      /*
       * `preventDefault` n'est atteint que si JavaScript s'exécute. Sans lui —
       * script non chargé, erreur d'hydratation, extension qui bloque — le
       * navigateur soumet le formulaire et la Server Action reprend la main.
       */
      evenement.preventDefault();
      if (enCours) return;

      setEnCours(true);

      // L'avance et le message partent AVANT la requête : c'est la définition
      // d'un ajout optimiste, et c'est la seule partie qui doit être instantanée.
      bougerCompteurPanier(1);
      poserToast('panierAjoutTitre', { titre });

      void poster(livreId, langue).then((issue) => {
        setEnCours(false);

        if (issue === 'ajoute') {
          /*
           * On rend l'avance au serveur : `router.refresh()` redemande l'arbre
           * SERVEUR de la page — la pastille, le tiroir et la barre d'onglets
           * lisent alors tous le nombre que le serveur a calculé, et ne
           * peuvent pas se contredire. La page n'est pas rechargée : ni le
           * défilement, ni le focus, ni les champs remplis ne bougent.
           */
          router.refresh();
          annoncerChangementPanier();
          return;
        }

        // Tout le reste annule l'avance : le titre n'est pas entré au panier.
        bougerCompteurPanier(-1);

        if (issue === 'connexion') {
          window.location.href = `/${langue}/connexion`;
          return;
        }

        if (issue === 'deja') {
          // `06` : un titre déjà au panier n'est pas dupliqué — on OUVRE le
          // panier, pour que le clic ait tout de même une conséquence visible.
          demanderOuvertureTiroir();
          return;
        }

        poserToast('panierRefus');
      });
    },
    [enCours, langue, livreId, titre, router],
  );

  return (
    <form className={className} action={action} onSubmit={surSoumission}>
      {children}
      {/*
       * Le titre n'est PAS envoyé au serveur : la Server Action le relit en
       * base. Ce champ caché ne sert qu'au chemin sans JavaScript, où il n'y a
       * rien à porter — il n'existe donc pas. L'identifiant non plus : il est
       * déjà lié à l'action par `bind`.
       */}
      <span className="sr-only" aria-live="polite">
        {enCours ? traduire(langue, 'panier.ajoutEnCours') : ''}
      </span>
    </form>
  );
}
