'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import styles from './v2.module.css';

/**
 * APPARITION AU DÉFILEMENT.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE COMPOSANT NE DOIT JAMAIS POUVOIR CACHER DU CONTENU.                  │
 * │                                                                          │
 * │ C'est le risque de tout effet d'apparition : si l'observateur ne se      │
 * │ déclenche pas — JavaScript en échec, navigateur ancien, extension qui    │
 * │ bloque — le contenu resté à `opacity: 0` disparaît DÉFINITIVEMENT.       │
 * │ Une vitrine invisible ne se signale pas : la page s'affiche, vide.       │
 * │                                                                          │
 * │ Trois gardes, et il en faut trois :                                      │
 * │                                                                          │
 * │   1. l'état initial est VISIBLE ; c'est l'effet qui s'ajoute, jamais    │
 * │      lui qui se retire. Sans JavaScript, tout se voit ;                  │
 * │   2. `IntersectionObserver` absent ⇒ on ne masque rien ;                │
 * │   3. `prefers-reduced-motion` ⇒ on ne masque rien non plus.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Revele({
  children,
  /** Décalage en cascade, en millisecondes — l'index dans une grille. */
  rang = 0,
  className,
}: {
  children: ReactNode;
  rang?: number;
  className?: string;
}): ReactNode {
  const cible = useRef<HTMLDivElement | null>(null);

  /*
   * `arme` dit si l'effet a pu être installé. Il commence à FAUX, donc rien
   * n'est masqué au premier rendu — c'est aussi ce que voit un navigateur
   * sans JavaScript, et c'est le comportement voulu.
   */
  const [arme, setArme] = useState(false);
  const [vu, setVu] = useState(false);

  useEffect(() => {
    const element = cible.current;
    if (!element) return;

    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduit || typeof IntersectionObserver === 'undefined') return;

    // Déjà à l'écran au chargement — le hero, la première rangée : on ne
    // l'anime pas, sinon la page s'ouvre sur un fondu qu'on n'a pas demandé.
    const rectangle = element.getBoundingClientRect();
    if (rectangle.top < window.innerHeight * 0.92) {
      setVu(true);
      setArme(true);
      return;
    }

    setArme(true);

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (!entree.isIntersecting) continue;
          setVu(true);
          // Une seule fois : réanimer au retour donnerait un site qui
          // clignote à chaque défilement vers le haut.
          observateur.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    observateur.observe(element);
    return () => {
      observateur.disconnect();
    };
  }, []);

  const classes = [styles.revele, arme && !vu ? styles.releveEnAttente : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={cible}
      className={classes}
      style={{ '--rang': rang % 4 } as CSSProperties}
    >
      {children}
    </div>
  );
}
