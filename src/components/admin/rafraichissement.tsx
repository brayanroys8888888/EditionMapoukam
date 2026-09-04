'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { traduire, type LangueInterface } from '@/i18n';
import styles from './admin.module.css';

/**
 * LE TABLEAU DE BORD SE REMET À JOUR TOUT SEUL.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `router.refresh()`, ET NON UN FLUX TEMPS RÉEL.                          │
 * │                                                                          │
 * │ Supabase sait pousser les changements de Postgres jusqu'au navigateur.   │
 * │ Y recourir ici demanderait d'ouvrir en LECTURE, à un rôle authentifié,   │
 * │ les tables `orders`, `entitlements` et `subscriptions` — celles-là mêmes │
 * │ que le modèle de sécurité tient fermées, l'administration passant par    │
 * │ `service_role` précisément pour ne pas avoir à les ouvrir. Un tableau de │
 * │ bord plus vivant ne vaut pas une politique RLS de plus sur les tables    │
 * │ d'argent.                                                                │
 * │                                                                          │
 * │ `router.refresh()` redemande l'arbre serveur : c'est la MÊME fonction    │
 * │ `tableauDeBord()` qui recalcule, avec les mêmes contrôles de rôle. Aucune │
 * │ route nouvelle, aucune donnée qui n'était pas déjà servie, et rien à     │
 * │ maintenir en double.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ONGLET CACHÉ NE COÛTE RIEN.                                           │
 * │                                                                          │
 * │ Un back-office reste ouvert dans un onglet des journées entières. Sans   │
 * │ cette pause, il redemanderait une douzaine d'agrégats SQL toutes les     │
 * │ minutes pendant des heures, pour personne — et sur le forfait mobile du  │
 * │ §5.1, l'éditeur compris.                                                 │
 * │                                                                          │
 * │ Au retour sur l'onglet, on rafraîchit IMMÉDIATEMENT : revenir sur un     │
 * │ écran pour y lire des chiffres d'il y a une heure serait pire que de ne  │
 * │ rien rafraîchir du tout, puisque rien ne dirait qu'ils sont vieux.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Une minute.
 *
 * Ce que cet écran montre — encaissements, abonnements, brouillons — bouge à
 * l'échelle de la journée. Rafraîchir plus vite ne montrerait rien de plus,
 * et chaque passage relance une douzaine d'agrégats.
 */
const INTERVALLE_MS = 60_000;

export function Rafraichissement({ langue }: { langue: LangueInterface }): ReactNode {
  const router = useRouter();
  const [actif, setActif] = useState(true);

  useEffect(() => {
    let minuterie: number | undefined;

    function armer(): void {
      window.clearInterval(minuterie);
      minuterie = window.setInterval(() => {
        router.refresh();
      }, INTERVALLE_MS);
    }

    function surVisibilite(): void {
      const visible = !document.hidden;
      setActif(visible);

      if (visible) {
        router.refresh();
        armer();
      } else {
        window.clearInterval(minuterie);
      }
    }

    armer();
    document.addEventListener('visibilitychange', surVisibilite);

    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, [router]);

  return (
    <p className={styles.direct}>
      {/* Le point est décoratif : la mention à côté porte l'information. */}
      <span className={actif ? styles.directPouls : styles.directArret} aria-hidden="true" />
      {traduire(langue, actif ? 'admin.enDirect' : 'admin.enDirectSuspendu')}
    </p>
  );
}
