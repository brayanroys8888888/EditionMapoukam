'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE PANIER, VU DE DEUX ONGLETS.                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON DIFFUSE UN SIGNAL, JAMAIS UN CONTENU.                                │
 * │                                                                          │
 * │ `11-realtime-behaviour.md` propose de tenir le panier dans un magasin    │
 * │ client, miroité dans `localStorage`, et de synchroniser les DEUX         │
 * │ contenus entre onglets. Ce n'est pas ce qu'on fait, et le dossier le     │
 * │ concède lui-même une ligne plus bas : « never trust a client-side        │
 * │ price ». Ici le panier est attaché à l'utilisateur en base, et           │
 * │ `CLAUDE.md` interdit de déduire un état de droits côté client.           │
 * │                                                                          │
 * │ Le canal ne porte donc AUCUNE donnée : il dit « le panier a bougé ».     │
 * │ L'onglet qui reçoit redemande la page au serveur, et le compte qu'il     │
 * │ affiche reste celui que le serveur a calculé. Deux onglets ne peuvent    │
 * │ pas diverger, puisqu'aucun des deux ne compte quoi que ce soit.          │
 * │                                                                          │
 * │ C'est aussi ce qui rend le message inoffensif : un `BroadcastChannel`    │
 * │ est lisible par tout script de la même origine, et un panier diffusé     │
 * │ en clair y serait lisible aussi.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const CANAL = 'em_panier';

/** Le signal, sans charge utile. Sa présence est tout le message. */
const SIGNAL = 'change';

/**
 * Prévient les autres onglets qu'une commande a modifié le panier.
 *
 * Appelée par le `Toaster` au moment où il consomme un code de panier : c'est
 * le seul endroit du produit qui sait qu'une mutation vient d'aboutir, parce
 * que c'est le serveur qui l'a mise dans l'adresse après l'avoir écrite.
 */
export function annoncerChangementPanier(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const canal = new BroadcastChannel(CANAL);
  canal.postMessage(SIGNAL);
  canal.close();
}

/**
 * L'écoute — montée une fois dans l'enveloppe, comme le commutateur de thème.
 *
 * Elle ne rend rien : `router.refresh()` redemande les composants SERVEUR de
 * la page courante sans la recharger ni perdre l'état des champs. La pastille
 * du panier, le tiroir et la barre d'onglets lisent tous le même nombre rendu
 * par le serveur — ils ne peuvent donc pas se contredire.
 */
export function SynchronisationPanier(): ReactNode {
  const router = useRouter();

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const canal = new BroadcastChannel(CANAL);
    canal.onmessage = (evenement: MessageEvent<unknown>) => {
      if (evenement.data !== SIGNAL) return;
      router.refresh();
    };

    return () => {
      canal.close();
    };
  }, [router]);

  return null;
}
