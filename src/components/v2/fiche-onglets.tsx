'use client';

import { useId, useRef, useState, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import styles from './boutique.module.css';

/**
 * LES TROIS ONGLETS DU BAS DE FICHE — Extrait, Détails, Avis des lecteurs.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES TROIS PANNEAUX SONT TOUS RENDUS, ET DEUX SONT MASQUÉS.              │
 * │                                                                          │
 * │ La tentation est de ne monter que le panneau actif. Elle coûte trois     │
 * │ choses, et aucune ne se voit à l'écran de développement :                │
 * │                                                                          │
 * │  · la DESCRIPTION du titre — le texte que l'éditeur écrit pour vendre —  │
 * │    disparaîtrait du HTML rendu par le serveur. Un moteur de recherche    │
 * │    ne verrait plus qu'un onglet vide ;                                   │
 * │  · la recherche du navigateur (Ctrl+F) ne trouverait plus rien de ce     │
 * │    qui n'est pas affiché ;                                               │
 * │  · le premier clic sur un onglet ferait sauter la page, la hauteur du    │
 * │    panneau n'étant connue qu'après son montage.                          │
 * │                                                                          │
 * │ `hidden` retire l'élément de l'arbre d'accessibilité ET du flux : c'est  │
 * │ exactement ce qu'on veut, et c'est réversible sans rien remonter.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le panneau des avis porte des Server Actions. Elles arrivent ici DÉJÀ liées,
 * en `children` : ce composant ne les connaît pas, ne les appelle pas, et
 * n'aurait rien à en dire. C'est ce qui lui permet d'être client sans que la
 * frontière serveur/client remonte jusqu'aux droits.
 */

export interface OngletFiche {
  /** Identifiant stable — sert aux `id` ARIA, jamais affiché. */
  cle: string;
  libelle: string;
  panneau: ReactNode;
}

export function FicheOnglets({
  langue,
  onglets,
}: {
  langue: LangueInterface;
  onglets: OngletFiche[];
}): ReactNode {
  const prefixe = useId();
  const [actif, setActif] = useState(onglets[0]?.cle ?? '');
  const boutons = useRef<Map<string, HTMLButtonElement>>(new Map());

  if (onglets.length === 0) return null;

  /*
   * LES FLÈCHES CIRCULENT, ET LE FOCUS SUIT.
   *
   * Le motif ARIA des onglets veut une seule tabulation pour le groupe : on
   * entre dans la barre au clavier, puis on choisit à la flèche. Sans ça, un
   * lecteur au clavier traverse trois boutons pour atteindre le contenu, sur
   * chaque fiche du catalogue.
   */
  const auClavier = (evenement: React.KeyboardEvent<HTMLButtonElement>, rang: number): void => {
    const pas =
      evenement.key === 'ArrowRight' ? 1 : evenement.key === 'ArrowLeft' ? -1 : 0;
    const bord =
      evenement.key === 'Home' ? 0 : evenement.key === 'End' ? onglets.length - 1 : null;
    if (pas === 0 && bord === null) return;

    evenement.preventDefault();
    const cible =
      bord !== null ? bord : (rang + pas + onglets.length) % onglets.length;
    const suivant = onglets[cible];
    if (!suivant) return;
    setActif(suivant.cle);
    boutons.current.get(suivant.cle)?.focus();
  };

  return (
    <section className={styles.onglets} aria-label={traduire(langue, 'v2.ficheOngletsLibelle')}>
      <div className={styles.ongletsBarre} role="tablist">
        {onglets.map((onglet, rang) => (
          <button
            key={onglet.cle}
            ref={(noeud) => {
              if (noeud) boutons.current.set(onglet.cle, noeud);
              else boutons.current.delete(onglet.cle);
            }}
            type="button"
            role="tab"
            id={`${prefixe}-${onglet.cle}`}
            aria-controls={`${prefixe}-${onglet.cle}-panneau`}
            aria-selected={onglet.cle === actif}
            tabIndex={onglet.cle === actif ? 0 : -1}
            className={styles.onglet}
            data-actif={onglet.cle === actif ? '' : undefined}
            onClick={() => setActif(onglet.cle)}
            onKeyDown={(evenement) => auClavier(evenement, rang)}
          >
            {onglet.libelle}
          </button>
        ))}
      </div>

      {onglets.map((onglet) => (
        <div
          key={onglet.cle}
          role="tabpanel"
          id={`${prefixe}-${onglet.cle}-panneau`}
          aria-labelledby={`${prefixe}-${onglet.cle}`}
          hidden={onglet.cle !== actif}
          /*
           * `tabIndex=0` sur un panneau qui ne contient pas de commande : le
           * motif ARIA le demande pour qu'on puisse y amener le focus après
           * avoir choisi l'onglet. Ceux qui portent des liens ou un
           * formulaire n'en ont pas besoin — le focus y entre par eux.
           */
          tabIndex={-1}
        >
          {onglet.panneau}
        </div>
      ))}
    </section>
  );
}
