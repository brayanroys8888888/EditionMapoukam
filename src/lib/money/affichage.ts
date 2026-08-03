import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { createServiceClient } from '@/lib/supabase/clients';
import { formatAmount } from '@/domain/money';
import type { Currency } from '@/domain/money';

/**
 * Montants formatés pour l'affichage, depuis une devise.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI CETTE FONCTION EXISTE, ALORS QUE LE CATALOGUE REND DÉJÀ        │
 * │ `prix.affichage`.                                                       │
 * │                                                                          │
 * │ `PUT /api/orders` rend des montants BRUTS — `sous_total`, `remise`,      │
 * │ `total` — et la devise à part. Il n'y a rien de déjà formaté à afficher, │
 * │ et l'écran du panier doit pourtant montrer un total.                     │
 * │                                                                          │
 * │ Formater dans le composant aurait été le piège : le franc CFA n'a pas de │
 * │ sous-unité, si bien qu'une division par cent écrite dans un écran        │
 * │ multiplierait par cent l'erreur sur une zone entière. Un test            │
 * │ d'architecture échoue d'ailleurs sur `Intl.NumberFormat` et sur          │
 * │ `montant / 100` dans `src/components` et `src/app`.                      │
 * │                                                                          │
 * │ La décision reste donc où elle a toujours été : `formatAmount`, dans     │
 * │ `src/domain/money`. Cette fonction ne fait que lui apporter la devise.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function lireDevise(
  code: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<Currency> {
  const client = options.client ?? createServiceClient();

  const { data, error } = await client
    .from('currencies')
    .select('code, decimals, symbole')
    .eq('code', code)
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? `devise inconnue : ${code}`);

  return { code: data.code, decimals: data.decimals, symbole: data.symbole };
}

/**
 * Formateur lié à une devise, pour ne pas la relire à chaque montant.
 *
 * Rendu par la page et transmis aux composants : ceux-ci reçoivent donc une
 * FONCTION, et n'ont jamais à connaître ni les décimales ni le symbole.
 */
export function formateur(devise: Currency): (montant: number) => string {
  return (montant) => formatAmount(montant, devise);
}
