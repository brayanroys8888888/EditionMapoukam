'use client';

import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';

/**
 * LES DEUX COMPORTEMENTS DE SCÈNE, ÉCRITS UNE FOIS POUR LES DEUX SCÈNES.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EXTRAITS PARCE QU'IL Y A MAINTENANT DEUX SCÈNES, PAS PARCE QUE C'EST     │
 * │ PLUS JOLI.                                                               │
 * │                                                                          │
 * │ La scène de la V2 s'efface au bout de quatre secondes ; celle d'Organic  │
 * │ ne s'efface qu'en PLEIN ÉCRAN, où l'interface est justement ce qu'on est │
 * │ venu faire disparaître. Le balayage, lui, vaut dans les deux.            │
 * │                                                                          │
 * │ Recopiés, ces deux minuteries auraient divergé au premier réglage — et   │
 * │ le réglage en question est le délai au bout duquel les boutons d'un      │
 * │ enfant disparaissent.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Délai avant que l'interface s'efface, en millisecondes.
 *
 * Quatre secondes : assez pour tourner une page sans que les boutons
 * clignotent, assez court pour que la lecture reprenne le plein écran.
 */
export const DELAI_EFFACEMENT = 4000;

/** Déplacement horizontal minimal, en pixels, pour qu'un balayage compte. */
export const SEUIL_BALAYAGE = 45;

/** Ce que la note d'aide fait, et elle ne le fait qu'une fois. */
export type EtatNote = 'jamais' | 'visible' | 'estompee';

/**
 * L'EFFACEMENT DE L'INTERFACE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ IL EST SUSPENDU DÈS QU'UN MESSAGE OCCUPE LA SCÈNE.                      │
 * │                                                                          │
 * │ Fin d'extrait, session perdue, erreur : effacer les boutons d'un écran   │
 * │ qui demande une action laisserait le lecteur devant un message sans      │
 * │ issue — et précisément dans les trois cas où il en a le plus besoin.     │
 * │ C'est l'appelant qui le dit, par `actif`.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La note d'aide n'apparaît qu'AU PREMIER effacement, puis plus jamais : sans
 * elle, une interface qui disparaît au bout de quatre secondes se lit comme
 * une panne — et un parent quitte le lecteur au lieu d'y toucher.
 */
export function useEffacement(actif: boolean): { efface: boolean; note: EtatNote } {
  const [efface, setEfface] = useState(false);
  const [note, setNote] = useState<EtatNote>('jamais');
  const noteVue = useRef(false);

  useEffect(() => {
    if (!actif) {
      setEfface(false);
      return;
    }

    let minuterie = window.setTimeout(() => {
      setEfface(true);
      if (!noteVue.current) {
        noteVue.current = true;
        setNote('visible');
        window.setTimeout(() => {
          setNote('estompee');
        }, 2200);
        window.setTimeout(() => {
          setNote('jamais');
        }, 2800);
      }
    }, DELAI_EFFACEMENT);

    function reveiller(): void {
      setEfface(false);
      window.clearTimeout(minuterie);
      minuterie = window.setTimeout(() => {
        setEfface(true);
      }, DELAI_EFFACEMENT);
    }

    // `passive` : ces écouteurs ne préviennent jamais le défilement, et le dire
    // au navigateur lui évite d'attendre pour savoir.
    const evenements = ['pointermove', 'pointerdown', 'keydown', 'touchstart'] as const;
    for (const nom of evenements) {
      window.addEventListener(nom, reveiller, { passive: true });
    }

    return () => {
      window.clearTimeout(minuterie);
      for (const nom of evenements) {
        window.removeEventListener(nom, reveiller);
      }
    };
  }, [actif]);

  return { efface, note };
}

/**
 * Les deux gestionnaires à poser sur la scène, tels quels.
 *
 * Typés sur `HTMLDivElement` parce que les deux scènes posent leur plateau sur
 * un `<div>` : un type plus large obligerait chaque appelant à élargir le sien,
 * et un `HTMLElement` générique n'est pas assignable aux propriétés d'un `div`.
 */
export interface Balayage {
  onTouchStart: (evenement: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (evenement: TouchEvent<HTMLDivElement>) => void;
}

/**
 * LE BALAYAGE HORIZONTAL — tourner la page au doigt.
 *
 * En deçà du seuil, c'est une pression, pas un balayage : tourner la page sur
 * un doigt qui tremble rendrait le lecteur inutilisable.
 *
 * `sens` vaut -1 vers la page précédente et +1 vers la suivante — l'appelant
 * décide de ce que « suivante » veut dire, parce que lui seul connaît la page
 * courante et le total.
 */
export function useBalayage(surGlissement: (sens: -1 | 1) => void): Balayage {
  /** Point de départ d'un balayage, pour mesurer le déplacement à sa fin. */
  const depart = useRef<number | null>(null);

  const onTouchStart = useCallback((evenement: TouchEvent<HTMLDivElement>) => {
    depart.current = evenement.touches[0]?.clientX ?? null;
  }, []);

  const onTouchEnd = useCallback(
    (evenement: TouchEvent<HTMLDivElement>) => {
      const origine = depart.current;
      depart.current = null;
      if (origine === null) return;

      const arrivee = evenement.changedTouches[0]?.clientX ?? origine;
      const ecart = arrivee - origine;
      if (Math.abs(ecart) < SEUIL_BALAYAGE) return;
      surGlissement(ecart < 0 ? 1 : -1);
    },
    [surGlissement],
  );

  return { onTouchStart, onTouchEnd };
}
