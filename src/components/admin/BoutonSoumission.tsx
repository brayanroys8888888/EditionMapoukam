'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { RotorInline } from '@/components/etats';
import styles from './admin.module.css';

interface BoutonSoumissionProps {
  children: ReactNode;
  libelleChargement?: ReactNode;
  variante?: 'primaire' | 'secondaire' | 'discret' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'submit' | 'button';
}

export function BoutonSoumission({
  children,
  libelleChargement,
  variante = 'primaire',
  disabled = false,
  className,
  type = 'submit',
}: BoutonSoumissionProps) {
  const { pending } = useFormStatus();

  const classeVariante =
    variante === 'primaire'
      ? styles.boutonPrimaire
      : variante === 'secondaire'
        ? styles.boutonSecondaire
        : variante === 'danger'
          ? styles.boutonDanger
          : styles.boutonDiscret;

  return (
    <button
      type={type}
      className={[classeVariante, className].filter(Boolean).join(' ')}
      disabled={disabled || pending}
      aria-busy={pending ? 'true' : undefined}
    >
      {pending ? (
        <span className={styles.contenuBoutonEnCharge}>
          <RotorInline />
          <span>{libelleChargement ?? children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
