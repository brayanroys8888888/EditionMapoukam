import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { createServiceClient } from '@/lib/supabase/clients';

/**
 * Lecture d'une commande, pour son propriétaire et pour lui seul.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FILTRE SUR `user_id` EST DANS LA REQUÊTE, JAMAIS APRÈS.              │
 * │                                                                          │
 * │ La commande d'autrui n'est donc jamais chargée : elle rend `null`,       │
 * │ exactement comme un identifiant inconnu. L'appelant produit un 404, et   │
 * │ non un 403 — un 403 confirmerait que la commande existe, ce qui suffit à │
 * │ savoir qu'une personne a acheté quelque chose.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Extrait ici parce que la PAGE de règlement en a besoin autant que la route :
 * un test d'architecture interdit la clé de service hors de `src/app/api`, et
 * recopier la requête dans l'écran aurait fini par y oublier le filtre.
 */
export interface CommandeLue {
  id: string;
  montant_total: number;
  devise: string;
  statut: string;
}

export async function lireCommandeDe(
  userId: string,
  commandeId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<CommandeLue | null> {
  const client = options.client ?? createServiceClient();

  const { data } = await client
    .from('orders')
    .select('id, montant_total, devise, statut')
    .eq('id', commandeId)
    .eq('user_id', userId)
    .maybeSingle();

  return data ?? null;
}
