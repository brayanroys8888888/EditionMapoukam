'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import styles from './v2.module.css';

/**
 * CARROUSEL DE COUVERTURES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST UNE LISTE QUI DÉFILE, PAS UN DIAPORAMA.                           │
 * │                                                                          │
 * │ La distinction n'est pas cosmétique. Un diaporama cache des éléments —   │
 * │ `display: none` sur tout sauf la vue courante — et ce qui est caché      │
 * │ n'est ni lu par un moteur, ni atteignable au clavier, ni trouvable par   │
 * │ la recherche du navigateur.                                             │
 * │                                                                          │
 * │ Ici, TOUS les titres sont dans le document et dans l'ordre de            │
 * │ tabulation. Le défilement natif (`scroll-snap`) fait le reste : il       │
 * │ fonctionne au doigt, à la molette, à la barre de défilement — et sans    │
 * │ JavaScript. Les flèches ne sont qu'un confort ajouté par-dessus.         │
 * │                                                                          │
 * │ Aucune rotation automatique : un carrousel qui bouge tout seul déplace   │
 * │ la cible sous le doigt d'un enfant, et fait rater le titre qu'on visait. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Carrousel({
  langue,
  libelle,
  children,
}: {
  langue: LangueInterface;
  /** Nom du groupe, pour qui écoute la page. */
  libelle: string;
  children: ReactNode;
}): ReactNode {
  const piste = useRef<HTMLUListElement | null>(null);
  const [debut, setDebut] = useState(true);
  const [fin, setFin] = useState(false);

  /**
   * Où en est le défilement.
   *
   * Sert à désactiver les flèches aux extrémités. Une flèche qui reste active
   * alors qu'elle ne fait plus rien est une promesse rompue à chaque clic.
   */
  const mesurer = useCallback(() => {
    const element = piste.current;
    if (!element) return;

    const restant = element.scrollWidth - element.clientWidth - element.scrollLeft;
    setDebut(element.scrollLeft <= 2);
    // Deux pixels de tolérance : les largeurs fractionnaires d'un écran à
    // forte densité ne retombent jamais exactement sur zéro.
    setFin(restant <= 2);
  }, []);

  useEffect(() => {
    mesurer();
    const element = piste.current;
    if (!element) return;

    element.addEventListener('scroll', mesurer, { passive: true });
    window.addEventListener('resize', mesurer);
    return () => {
      element.removeEventListener('scroll', mesurer);
      window.removeEventListener('resize', mesurer);
    };
  }, [mesurer]);

  /**
   * Avance ou recule d'UNE CARTE, jamais d'un écran approximatif.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LE PAS SE MESURE, IL NE SE DEVINE PAS.                               │
   * │                                                                      │
   * │ Une valeur en pourcentage de la piste tombe entre deux cartes dès    │
   * │ que la largeur change — et le magnétisme rattrape alors le           │
   * │ défilement dans un sens ou dans l'autre, ce qui donne l'impression   │
   * │ d'un bouton qui hésite.                                              │
   * │                                                                      │
   * │ La largeur réelle d'une carte plus la gouttière : les deux sont      │
   * │ lues dans le document, donc justes à toutes les tailles.             │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const glisser = useCallback((sens: 1 | -1) => {
    const element = piste.current;
    if (!element) return;

    const premiere = element.firstElementChild;
    const gouttiere = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
    const pas = premiere ? premiere.getBoundingClientRect().width + gouttiere : 260;

    element.scrollBy({ left: pas * sens, behavior: 'smooth' });
  }, []);

  /**
   * Les flèches du CLAVIER, quand le carrousel a le focus.
   *
   * `←` et `→` sont ce qu'un utilisateur au clavier essaie en premier sur une
   * liste horizontale. Sans elles, il devrait tabuler à travers chaque carte
   * pour atteindre la dernière — ce que le défilement natif fait déjà, mais
   * lentement et sans jamais reculer.
   *
   * L'écouteur est posé sur la PISTE, pas sur la fenêtre : sinon les flèches
   * feraient défiler le carrousel depuis n'importe quel endroit de la page,
   * y compris pendant qu'on remplit un champ.
   */
  const surTouche = useCallback(
    (evenement: React.KeyboardEvent<HTMLUListElement>) => {
      if (evenement.key === 'ArrowRight') {
        evenement.preventDefault();
        glisser(1);
      }
      if (evenement.key === 'ArrowLeft') {
        evenement.preventDefault();
        glisser(-1);
      }
    },
    [glisser],
  );

  return (
    <div className={styles.carrousel}>
      <ul
        ref={piste}
        className={styles.carrouselPiste}
        // `list` explicite : `list-style: none` retire le rôle de liste dans
        // Safari, et le nombre d'éléments cesse d'être annoncé.
        role="list"
        aria-label={libelle}
        onKeyDown={surTouche}
      >
        {children}
      </ul>

      {/*
       * Les flèches sont RENDUES PAR LE CLIENT et n'existent pas sans
       * JavaScript — c'est voulu : sans lui elles ne feraient rien, et un
       * bouton mort est pire qu'un bouton absent. Le défilement, lui, reste.
       */}
      <div className={styles.carrouselCommandes}>
        <button
          type="button"
          className={styles.carrouselFleche}
          onClick={() => {
            glisser(-1);
          }}
          disabled={debut}
          aria-label={traduire(langue, 'v2.precedent')}
        >
          <span aria-hidden="true">‹</span>
        </button>

        <button
          type="button"
          className={styles.carrouselFleche}
          onClick={() => {
            glisser(1);
          }}
          disabled={fin}
          aria-label={traduire(langue, 'v2.suivant')}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}
