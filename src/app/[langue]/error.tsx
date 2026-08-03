'use client';

import { useEffect } from 'react';

import { Erreur } from '@/components/etats';
import { langueValide } from '@/i18n';

/**
 * Gestion globale des erreurs d'une langue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SANS CE FICHIER, UNE EXCEPTION DANS N'IMPORTE QUEL COMPOSANT PRODUIT    │
 * │ UNE PAGE BLANCHE.                                                        │
 * │                                                                          │
 * │ Pas un message, pas un cadre : rien. L'utilisateur ne sait pas si la     │
 * │ page charge, s'il a perdu sa connexion, ou si le site est mort — et il   │
 * │ n'a aucune action à prendre. C'est le pire état qu'une interface puisse  │
 * │ atteindre, et c'est l'état par défaut.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'enveloppe — en-tête et pied de page — reste en place : elle vit dans la
 * disposition, que cette limite ne remplace pas. L'utilisateur garde donc sa
 * navigation, et peut repartir ailleurs plutôt que d'être coincé.
 */
export default function ErreurLangue({
  error,
  reset,
  params,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  params?: { langue?: string };
}) {
  useEffect(() => {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ LE DÉTAIL PART AU JOURNAL, JAMAIS À L'ÉCRAN.                       │
    // │                                                                    │
    // │ Un message d'exception nomme des modules, des chemins et parfois    │
    // │ des identifiants. C'est la même règle que pour les réponses d'API   │
    // │ (`errors.interne`), et elle vaut aussi de ce côté du réseau.        │
    // │                                                                    │
    // │ `digest` est l'identifiant que Next attribue à l'erreur côté        │
    // │ serveur : c'est lui qui permet de retrouver la trace complète.      │
    // └────────────────────────────────────────────────────────────────────┘
    // eslint-disable-next-line no-console -- limite client : le logger du projet est serveur.
    console.error('[interface]', error.digest ?? 'sans identifiant');
  }, [error]);

  return (
    <Erreur
      langue={langueValide(params?.langue)}
      // Aucun code d'API ici : cette limite attrape des exceptions de rendu,
      // pas des réponses HTTP. Le message générique est le bon.
      code="erreur_interne"
      onReessayer={reset}
    />
  );
}
