'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

/**
 * ÉCHAP REFERME LE PANNEAU.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA SEULE PIÈCE CLIENTE DU TIROIR, ET ELLE NE REND RIEN.                 │
 * │                                                                          │
 * │ Le voile et la croix sont des liens : le panneau s'ouvre et se ferme     │
 * │ sans JavaScript. Échap, lui, ne s'attache à aucun élément — c'est une    │
 * │ touche écoutée sur le document, et il n'existe pas de manière déclarative│
 * │ de le faire.                                                             │
 * │                                                                          │
 * │ WCAG 2.1 le demande pour toute surface modale (2.1.2, « pas de piège au  │
 * │ clavier ») : sans lui, qui navigue au clavier doit tabuler jusqu'à la    │
 * │ croix. Deux liens la précèdent, plus le contenu du panneau — c'est long, │
 * │ et c'est exactement le genre de détour qu'on ne remarque pas à la souris.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `router.push` plutôt qu'une écriture directe de `location` : la navigation
 * reste celle de l'application, et le panneau se referme sans recharger la
 * liste qu'il recouvre.
 */
export function FermerAuClavier({ fermeture }: { fermeture: string }): ReactNode {
  const routeur = useRouter();

  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key !== 'Escape') return;
      /*
       * `defaultPrevented` : un champ qui traite déjà Échap — une liste
       * déroulante ouverte, une saisie en cours d'annulation — l'a marqué.
       * Refermer le panneau par-dessus ferait disparaître l'écran sous les
       * doigts de qui voulait seulement annuler sa saisie.
       */
      if (evenement.defaultPrevented) return;
      routeur.push(fermeture);
    };

    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('keydown', surTouche);
    };
  }, [fermeture, routeur]);

  return null;
}
