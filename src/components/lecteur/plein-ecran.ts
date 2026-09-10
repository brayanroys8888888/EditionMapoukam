'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE PLEIN ÉCRAN — l'écran entier, la page, et deux boutons.                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Demande du propriétaire, 8 septembre 2026 : « un visionnage plein écran,
 * rien autour, juste des boutons pour avancer ou reculer — un peu comme le
 * mode plein écran des PDF de Microsoft Edge ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ C'EST LE VRAI PLEIN ÉCRAN DU NAVIGATEUR, PAS UN `position: fixed`.      │
 * │                                                                          │
 * │ Une surcouche en `position: fixed` couvre la PAGE ; elle laisse la barre │
 * │ d'adresse, les onglets et la barre des tâches. « Rien autour » veut dire │
 * │ rien autour : c'est `requestFullscreen()`, et lui seul, qui les retire.  │
 * │                                                                          │
 * │ Il a un prix, assumé : le navigateur exige un GESTE de l'utilisateur     │
 * │ pour l'accorder. On ne peut donc pas ouvrir le lecteur en plein écran —  │
 * │ il faut un bouton, et c'est très bien : entrer en plein écran sans       │
 * │ l'avoir demandé est le comportement qu'on reproche aux publicités.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA SORTIE N'EST PAS À NOUS, ET C'EST POURQUOI ON ÉCOUTE.                │
 * │                                                                          │
 * │ Échap sort du plein écran sans passer par notre bouton, et le navigateur │
 * │ peut en sortir de lui-même — changement d'onglet, fenêtre réduite. Un    │
 * │ état tenu par notre seul bouton se désynchroniserait : la scène se       │
 * │ croirait en plein écran alors qu'elle est redevenue une page, avec ses   │
 * │ commandes flottantes posées au milieu du site.                           │
 * │                                                                          │
 * │ L'AUTORITÉ est donc `document.fullscreenElement`, relue à chaque         │
 * │ `fullscreenchange`. Notre état n'en est que le reflet.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Les noms préfixés de Safari, qui n'a jamais adopté les noms standard.
 *
 * Déclarés plutôt que forcés par un `any` : le mode strict interdit l'un et
 * l'autre sans justification, et une interface facultative dit exactement ce
 * qu'on suppose du navigateur — rien de plus.
 */
interface ElementPleinEcran extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface DocumentPleinEcran extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}

function elementCourant(doc: DocumentPleinEcran): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export interface PleinEcran {
  /**
   * Le navigateur l'accorde-t-il ?
   *
   * Toujours `false` au premier rendu — donc au rendu SERVEUR — puis relu au
   * montage. Sans cette précaution, le serveur rendrait un bouton que le
   * client retirerait, ce que React signale comme une divergence
   * d'hydratation. Sur iPhone, la réponse reste `false` : Safari n'accorde le
   * plein écran qu'aux vidéos, et un bouton qui ne fait rien est pire que pas
   * de bouton.
   */
  disponible: boolean;
  /** Sommes-nous en plein écran EN CE MOMENT ? Lu du document, jamais deviné. */
  actif: boolean;
  basculer: () => void;
}

export function usePleinEcran(cible: RefObject<HTMLElement | null>): PleinEcran {
  const [disponible, setDisponible] = useState(false);
  const [actif, setActif] = useState(false);

  useEffect(() => {
    const doc = document as DocumentPleinEcran;
    setDisponible(doc.fullscreenEnabled || doc.webkitFullscreenEnabled === true);

    function relire(): void {
      setActif(elementCourant(document) !== null);
    }

    relire();
    document.addEventListener('fullscreenchange', relire);
    document.addEventListener('webkitfullscreenchange', relire);

    return () => {
      document.removeEventListener('fullscreenchange', relire);
      document.removeEventListener('webkitfullscreenchange', relire);
    };
  }, []);

  const basculer = useCallback(() => {
    const doc = document as DocumentPleinEcran;

    if (elementCourant(doc) !== null) {
      // ┌──────────────────────────────────────────────────────────────────┐
      // │ L'ÉCHEC EST AVALÉ, ET C'EST VOULU.                              │
      // │                                                                  │
      // │ Ces deux appels rendent une promesse qui se rejette quand le     │
      // │ navigateur refuse — geste jugé trop ancien, permission retirée.  │
      // │ Rien à annoncer : l'écran n'a pas changé, la lecture continue,   │
      // │ et l'état sera de toute façon relu par `fullscreenchange`.       │
      // └──────────────────────────────────────────────────────────────────┘
      void Promise.resolve(doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()).catch(
        () => null,
      );
      return;
    }

    const element: ElementPleinEcran | null = cible.current;
    if (!element) return;

    void Promise.resolve(
      element.requestFullscreen?.() ?? element.webkitRequestFullscreen?.(),
    ).catch(() => null);
  }, [cible]);

  return { disponible, actif, basculer };
}
