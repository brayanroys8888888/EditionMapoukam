import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Fusion de classes utilitaires, attendue par les composants shadcn/ui.
 *
 * `twMerge` résout les conflits — `px-2 px-4` garde `px-4` — ce qu'une simple
 * concaténation ne fait pas : les deux classes coexisteraient et le résultat
 * dépendrait de l'ordre dans la feuille, c'est-à-dire de rien de lisible.
 */
export function cn(...entrees: ClassValue[]): string {
  return twMerge(clsx(entrees));
}
