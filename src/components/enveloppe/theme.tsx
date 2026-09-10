'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import { COOKIE_THEME, type ThemeClair } from '@/design/version';

import styles from './v3.module.css';

/**
 * LE COMMUTATEUR CLAIR / SOMBRE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE SERVEUR A DÉJÀ POSÉ LA BONNE COULEUR. CE COMPOSANT NE FAIT QUE LA    │
 * │ CHANGER.                                                                 │
 * │                                                                          │
 * │ `src/app/layout.tsx` lit le cookie `em_theme` et pose `data-theme` sur   │
 * │ `<html>` AVANT d'envoyer le HTML. Il n'y a donc rien à corriger au       │
 * │ montage, et surtout rien à corriger APRÈS la première peinture — ce que  │
 * │ le dossier de passation interdit explicitement : « never with a blocking │
 * │ inline script ».                                                         │
 * │                                                                          │
 * │ Ce composant lit l'état dans le DOM plutôt que de le recevoir en         │
 * │ propriété. C'est volontaire : la propriété viendrait d'un rendu serveur  │
 * │ mis en cache, alors que l'attribut est ce que le visiteur VOIT.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Le canal qui tient les onglets d'accord. */
const CANAL = 'em_theme';

/** Un an. Le choix d'un thème n'est pas une préférence de session. */
const DUREE = 60 * 60 * 24 * 365;

function themeDuDocument(): ThemeClair | null {
  const pose = document.documentElement.dataset.theme;
  return pose === 'dark' || pose === 'light' ? pose : null;
}

/** Le thème RÉELLEMENT peint, choix explicite ou préférence système. */
function themeEffectif(): ThemeClair {
  return (
    themeDuDocument() ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
}

/**
 * Pose le thème SYNCHRONEMENT, avant tout aller-retour.
 *
 * L'écriture du cookie et la diffusion aux autres onglets viennent après :
 * elles ne doivent jamais retarder le repeint, qui est le seul retour que le
 * visiteur perçoit du clic.
 */
function poser(theme: ThemeClair): void {
  document.documentElement.dataset.theme = theme;

  // `color-scheme` gouverne les surfaces du NAVIGATEUR — barre de défilement,
  // champs natifs. Laissé sur « light dark », il les peindrait à contretemps.
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
}

export function CommutateurTheme({ langue }: { langue: LangueInterface }): ReactNode {
  /*
   * `null` au premier rendu, et ce n'est pas un oubli : le serveur ne connaît
   * pas la préférence système, seulement le cookie. Rendre un libellé au
   * hasard le ferait changer sous les yeux du visiteur au montage — et
   * mentirait au lecteur d'écran entre-temps.
   */
  const [theme, setTheme] = useState<ThemeClair | null>(null);
  const [choisi, setChoisi] = useState(false);

  useEffect(() => {
    setTheme(themeEffectif());
    setChoisi(themeDuDocument() !== null);
  }, []);

  /* Les autres onglets — `11-realtime-behaviour.md` l'exige. */
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const canal = new BroadcastChannel(CANAL);

    canal.onmessage = (evenement: MessageEvent<unknown>) => {
      const recu = evenement.data;
      if (recu !== 'dark' && recu !== 'light') return;
      poser(recu);
      setTheme(recu);
      setChoisi(true);
    };

    return () => {
      canal.close();
    };
  }, []);

  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ON SUIT LE SYSTÈME TANT QUE, ET SEULEMENT TANT QUE, RIEN N'A ÉTÉ     │
   * │ CHOISI.                                                              │
   * │                                                                      │
   * │ Un visiteur dont le téléphone bascule en sombre au crépuscule doit   │
   * │ voir le site basculer avec lui. Mais celui qui a cliqué a dit le     │
   * │ contraire du système : le suivre quand même annulerait son choix     │
   * │ sans rien lui dire.                                                  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  useEffect(() => {
    if (choisi) return;
    const requete = window.matchMedia('(prefers-color-scheme: dark)');
    const suivre = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };
    requete.addEventListener('change', suivre);
    return () => {
      requete.removeEventListener('change', suivre);
    };
  }, [choisi]);

  const basculer = useCallback(() => {
    const suivant: ThemeClair = themeEffectif() === 'dark' ? 'light' : 'dark';

    poser(suivant);
    setTheme(suivant);
    setChoisi(true);

    document.cookie = `${COOKIE_THEME}=${suivant}; path=/; max-age=${String(DUREE)}; SameSite=Lax`;

    if (typeof BroadcastChannel !== 'undefined') {
      const canal = new BroadcastChannel(CANAL);
      canal.postMessage(suivant);
      canal.close();
    }
  }, []);

  const versSombre = theme !== 'dark';
  const libelle = traduire(langue, versSombre ? 'theme.versSombre' : 'theme.versClair');
  /*
   * Le libellé VISIBLE nomme la destination, pas l’état courant.
   *
   * Le prototype écrit « Nuit » quand on est en clair : c’est ce que le clic
   * donnera. « Clair », qui décrirait l’état présent, se lirait comme une
   * étiquette et non comme une commande.
   *
   * Le libellé ACCESSIBLE, lui, reste la phrase complète : hors contexte,
   * « Nuit » seul ne dit pas qu’on peut cliquer.
   */
  const court = traduire(langue, versSombre ? 'theme.nuit' : 'theme.jour');

  return (
    <button
      type="button"
      className={styles.commutateurTheme}
      onClick={basculer}
      /*
       * Le libellé n'est PAS un état : « Passer en sombre » dit ce que le clic
       * fera. `aria-pressed` dirait ce que le bouton est, et les deux ensemble
       * se contredisent — un lecteur d'écran annoncerait « Passer en sombre,
       * activé », qui ne veut rien dire.
       */
      aria-label={libelle}
      title={libelle}
      /*
       * Tant que le thème effectif est inconnu — le temps d'un rendu — le
       * bouton reste dans le flux, à sa taille, mais ne prétend rien.
       */
      aria-hidden={theme === null}
      tabIndex={theme === null ? -1 : undefined}
    >
      <span aria-hidden="true" className={styles.commutateurIcone}>
        {versSombre ? Lune() : Soleil()}
      </span>
      <span aria-hidden="true" className={styles.commutateurLibelle}>
        {court}
      </span>
    </button>
  );
}

/*
 * Les deux icônes sont en ligne, et non tirées d'une bibliothèque : ce sont
 * les seules du chrome, elles font 24×24, et le dossier fixe leur trait à
 * 2,75 — c'est-à-dire Lucide, dont on ne prendrait ici que deux chemins.
 */
function Lune(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor">
      <path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Soleil(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="4" strokeWidth="2.75" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
