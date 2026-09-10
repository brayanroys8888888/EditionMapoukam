'use client';

import { useId, useState, type ReactNode } from 'react';

import { traduire, type LangueInterface } from '@/i18n';
import { Champ } from '@/components/base';
import styles from './auth.module.css';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LE CHAMP DE MOT DE PASSE, AVEC SON ŒIL.                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE BOUTON N'EXISTE QUE SI JAVASCRIPT S'EXÉCUTE, ET C'EST VOULU.         │
 * │                                                                          │
 * │ Basculer `type="password"` en `type="text"` est un geste de navigateur : │
 * │ sans script, le bouton ne pourrait rien faire. Un bouton qui ne fait     │
 * │ rien est pire que son absence — on croit avoir mal cliqué, et on         │
 * │ recommence en tapant son mot de passe une seconde fois.                  │
 * │                                                                          │
 * │ Il est donc rendu APRÈS montage. Le champ, lui, est complet dès le rendu │
 * │ serveur : la connexion fonctionne sans JavaScript, comme le reste de     │
 * │ l'authentification (arbitrage Q3, et §5.1 pour la raison).               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ÉTAT EST DANS LE NOM DU BOUTON, PAS DANS UN `aria-pressed`.           │
 * │                                                                          │
 * │ « Afficher le mot de passe » / « Masquer le mot de passe » : le libellé  │
 * │ dit ce que le clic VA faire, et il change avec l'état. C'est ce qu'un    │
 * │ lecteur d'écran annonce sans avoir à interpréter un état pressé, dont    │
 * │ la lecture varie d'une technologie à l'autre.                            │
 * │                                                                          │
 * │ Le champ n'est jamais rendu en clair par défaut, et le bouton ne         │
 * │ mémorise rien : changer d'écran remet le masque.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ChampMotDePasse({
  langue,
  id,
  name = 'password',
  libelle,
  autoComplete,
  placeholder,
  required = false,
  onChange,
}: {
  langue: LangueInterface;
  id: string;
  name?: string;
  libelle: string;
  autoComplete: string;
  placeholder?: string;
  required?: boolean;
  onChange?: (valeur: string) => void;
}): ReactNode {
  const [visible, setVisible] = useState(false);
  // `useId` n'est pas utilisé pour l'identifiant du champ — il est passé, et
  // il doit rester stable pour les tests et pour `htmlFor`. Il sert au seul
  // besoin d'unicité interne, si ce composant venait à en avoir un.
  useId();

  return (
    <div className={styles.champMotDePasse}>
      <Champ
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        libelle={libelle}
        autoComplete={autoComplete}
        required={required}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(onChange === undefined
          ? {}
          : {
              onChange: (evenement: React.ChangeEvent<HTMLInputElement>) => {
                onChange(evenement.target.value);
              },
            })}
      />

      <button
        type="button"
        className={styles.oeil}
        onClick={() => {
          setVisible((avant) => !avant);
        }}
        aria-label={traduire(
          langue,
          visible ? 'auth.masquerMotDePasse' : 'auth.afficherMotDePasse',
        )}
        aria-controls={id}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12S18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.8" />
          {/* La barre oblique n'apparaît QUE lorsque le mot de passe est en
              clair : c'est l'état visible qui est l'exception, et c'est lui
              qu'on signale. */}
          {visible ? <path d="M4 20 20 4" /> : null}
        </svg>
      </button>
    </div>
  );
}
