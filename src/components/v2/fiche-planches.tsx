'use client';

import { useState, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import type { Planche } from '@/lib/content/planches';
import styles from './boutique.module.css';

/**
 * LA BANDE D'APERÇU D'UN LIVRET — une planche en grand, ses vignettes dessous.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `contain`, ET SURTOUT PAS `cover`.                                       │
 * │                                                                          │
 * │ Une couverture de conte est un visuel composé pour être recadré : `cover`│
 * │ y perd des marges, jamais du sens. Une planche de livret est une FICHE   │
 * │ D'ACTIVITÉ — un cadre, une consigne écrite en haut, un tracé à suivre.   │
 * │ La recadrer coupe la consigne, c'est-à-dire ce qui dit à quoi sert la    │
 * │ page qu'on hésite à acheter.                                             │
 * │                                                                          │
 * │ D'où le fond de carte et le filet : en `contain`, la planche ne remplit  │
 * │ pas sa boîte, et il faut que ce qui reste ait l'air d'un support, pas    │
 * │ d'un trou.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les URL sont signées et arrivent DÉJÀ vérifiées : `lirePlanches` a demandé
 * chaque page à `servirPage`, qui a consulté le moteur de droits. Ce composant
 * ne décide de rien — il affiche ce qu'on lui donne, et n'a aucun moyen d'en
 * obtenir davantage.
 */
export function FichePlanches({
  langue,
  planches,
  titre,
}: {
  langue: LangueInterface;
  planches: Planche[];
  /** Le titre du livret — sert à nommer les vignettes pour un lecteur d'écran. */
  titre: string;
}): ReactNode {
  const [rang, setRang] = useState(0);

  if (planches.length === 0) return null;

  const active = planches[Math.min(rang, planches.length - 1)];
  if (!active) return null;

  return (
    <div>
      <img
        className={styles.planche}
        src={active.url}
        {...(active.largeur !== null ? { width: active.largeur } : {})}
        {...(active.hauteur !== null ? { height: active.hauteur } : {})}
        style={
          active.largeur !== null && active.hauteur !== null
            ? { aspectRatio: `${active.largeur} / ${active.hauteur}` }
            : undefined
        }
        loading="eager"
        decoding="async"
        alt={titre}
      />

      {planches.length > 1 ? (
        <div className={styles.vignettes}>
          {planches.map((planche, index) => (
            <button
              key={planche.numero}
              type="button"
              className={styles.vignette}
              data-actif={index === rang ? '' : undefined}
              aria-pressed={index === rang}
              onClick={() => setRang(index)}
            >
              <img
                src={planche.vignette}
                width={112}
                height={76}
                loading="lazy"
                decoding="async"
                alt=""
              />
              <span className={styles.vignetteLibelle}>
                {traduire(langue, 'v2.livretVignette').replace('{n}', String(planche.numero))}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <p className={styles.plancheLegende}>
        {traduire(langue, 'v2.livretApercu')
          .replace('{n}', String(Math.min(rang, planches.length - 1) + 1))
          .replace('{total}', String(planches.length))}
        {planches.length > 1 ? (
          <>
            {' — '}
            {traduire(langue, 'v2.livretApercuAide')}
          </>
        ) : null}
      </p>

    </div>
  );
}
