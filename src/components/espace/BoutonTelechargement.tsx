'use client';

import { useFormStatus } from 'react-dom';
import { RotorInline } from '@/components/etats';
import espace from '@/components/espace/espace.module.css';

/**
 * Bouton de téléchargement avec indicateur de chargement.
 *
 * Posé dans un <form> avec une Server Action, il lit `useFormStatus()` pour
 * savoir si la soumission est en cours. Pendant l'attente, il affiche un rotor
 * et se désactive — ce qui évite les doubles soumissions sur connexion lente.
 */
export function BoutonTelechargement({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={espace.achatTelecharger} disabled={pending} aria-busy={pending ? 'true' : undefined}>
      {pending ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <RotorInline />
          <span>{libelle}</span>
        </span>
      ) : (
        libelle
      )}
    </button>
  );
}
