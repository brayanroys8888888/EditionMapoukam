'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE PANIER OPTIMISTE — un ÉCART, jamais un compte.                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MAGASIN NE TIENT PAS LE PANIER. IL TIENT LE RETARD DU SERVEUR.       │
 * │                                                                          │
 * │ `11-realtime-behaviour.md` demande un ajout instantané : « badge count,  │
 * │ drawer content and toast fire on the same frame as the click — never     │
 * │ wait on a network round-trip ». Il propose pour cela un magasin client   │
 * │ qui DÉTIENT la liste des identifiants, miroitée dans `localStorage`.     │
 * │                                                                          │
 * │ On ne le fait pas, et le dossier se contredit lui-même deux lignes plus  │
 * │ bas : « never trust a client-side price ». Le panier est attaché au      │
 * │ compte, en base, derrière RLS ; `CLAUDE.md` interdit de déduire côté     │
 * │ client un état que le serveur décide. Un magasin qui détient le panier   │
 * │ devient une seconde source de vérité, et c'est toujours elle qui a       │
 * │ l'air d'avoir raison.                                                    │
 * │                                                                          │
 * │ Ce magasin ne porte donc qu'un ENTIER : de combien l'affichage devance   │
 * │ le dernier nombre rendu par le serveur. Il vaut zéro la plupart du       │
 * │ temps, il vaut un pendant les trois cents millisecondes d'un aller-      │
 * │ retour, et il retombe à zéro dès que le serveur a répondu. Il ne peut    │
 * │ donc jamais contredire le serveur plus d'un instant, ni survivre à un    │
 * │ rechargement — ce qui est exactement ce qu'on veut d'un état optimiste.  │
 * │                                                                          │
 * │ Rien n'est écrit dans `localStorage` : il n'y a rien à y garder.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

type Abonne = () => void;

const abonnes = new Set<Abonne>();

function prevenir(): void {
  for (const abonne of abonnes) abonne();
}

function sabonner(abonne: Abonne): () => void {
  abonnes.add(abonne);
  return () => {
    abonnes.delete(abonne);
  };
}

/* ══ L'écart optimiste ════════════════════════════════════════════════════ */

let ecart = 0;

/** Avance (ou recule) l'affichage, avant que le serveur ait répondu. */
export function bougerCompteurPanier(pas: number): void {
  ecart += pas;
  prevenir();
}

/** Le serveur a parlé : l'écart n'a plus lieu d'être. */
export function reinitialiserCompteurPanier(): void {
  if (ecart === 0) return;
  ecart = 0;
  prevenir();
}

/**
 * Le nombre à AFFICHER, à partir de celui que le serveur a rendu.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'INSTANTANÉ SERVEUR VAUT ZÉRO, ET C'EST CE QUI ÉVITE UN CLIGNOTEMENT.  │
 * │                                                                          │
 * │ `getServerSnapshot` doit rendre la MÊME valeur que le premier rendu      │
 * │ client, sans quoi React signale une divergence d'hydratation et repeint  │
 * │ la pastille. À l'instant du premier rendu, l'écart est nécessairement    │
 * │ nul : personne n'a encore cliqué.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'effet remet l'écart à zéro dès qu'un NOUVEAU nombre arrive du serveur —
 * c'est-à-dire après le `router.refresh()` qui suit l'ajout. Si le serveur
 * rend le même nombre (la requête n'a pas encore abouti), l'effet ne se
 * déclenche pas et l'avance tient : l'affichage reste en avance tant que le
 * serveur ne l'a pas rattrapé, jamais après.
 */
export function useNombrePanier(nombreServeur: number): number {
  const avance = useSyncExternalStore(
    sabonner,
    () => ecart,
    () => 0,
  );

  useEffect(() => {
    reinitialiserCompteurPanier();
  }, [nombreServeur]);

  // Un panier ne descend pas sous zéro, même si deux retraits se croisent.
  return Math.max(0, nombreServeur + avance);
}

/* ══ L'ouverture du tiroir, demandée de loin ══════════════════════════════ */

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN COMPTEUR ET NON UN BOOLÉEN.                                 │
 * │                                                                          │
 * │ `06-interactions-state.md` : ajouter un titre DÉJÀ dans le panier ouvre  │
 * │ le tiroir au lieu de le dupliquer. La carte qui reçoit ce refus est à    │
 * │ l'autre bout de la page ; le tiroir, lui, vit dans l'en-tête.            │
 * │                                                                          │
 * │ Un booléen « ouvert » ferait de ce magasin le propriétaire de l'état du  │
 * │ tiroir, alors que le tiroir sait seul s'il est en train de charger, de   │
 * │ se fermer, ou de rendre le focus. Le compteur ne dit rien de l'état : il │
 * │ dit qu'une demande de PLUS a été faite. Deux clics sur deux cartes déjà  │
 * │ au panier produisent deux demandes, et le tiroir rouvre à chaque fois —  │
 * │ ce qu'un booléen déjà à `true` ne saurait pas faire.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
let demandes = 0;
const demandeurs = new Set<Abonne>();

export function demanderOuvertureTiroir(): void {
  demandes += 1;
  for (const abonne of demandeurs) abonne();
}

export function useDemandesOuvertureTiroir(): number {
  return useSyncExternalStore(
    (abonne: Abonne) => {
      demandeurs.add(abonne);
      return () => {
        demandeurs.delete(abonne);
      };
    },
    () => demandes,
    () => 0,
  );
}
