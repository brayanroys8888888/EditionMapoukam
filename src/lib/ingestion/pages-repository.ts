import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { createServiceClient } from '@/lib/supabase/clients';
import { logger } from '@/lib/logger';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEUL MODULE DU DÉPÔT AUTORISÉ À ÉCRIRE DANS `book_pages`.               │
 * │ IL N'EN LIT JAMAIS LE CONTENU.                                          │
 * │                                                                          │
 * │ Un test d'architecture vérifie les deux moitiés de cette phrase : qu'au  │
 * │ - cun autre fichier n'écrit dans cette table, et que celui-ci n'y fait   │
 * │ aucun `select`.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * POURQUOI UN SECOND MODULE, ALORS QUE `page-service.ts` SE DÉCLARE UNIQUE
 *
 * La règle d'origine — un point de passage unique vers `book_pages` — protège
 * la LECTURE. Elle compense le fait que `service_role` contourne RLS : sur la
 * table qui porte le contenu vendu, la base ne rattrape pas une erreur
 * applicative, et la garantie « aucune page ne sort sans être passée par
 * `access_for` » ne tient que parce qu'aucun autre chemin de lecture n'existe.
 *
 * L'écriture ne met pas cette garantie en jeu : elle fait ENTRER du contenu,
 * elle n'en fait pas sortir. Faire transiter l'ingestion par le service de
 * lecture aurait mêlé, dans un même fichier, la vérification des droits et
 * l'alimentation du catalogue — en affaiblissant précisément ce que ce fichier
 * doit rendre évident.
 *
 * La règle est donc scindée plutôt qu'assouplie :
 *   * `page-service.ts` — seul à LIRE, et toujours après `getAccess` ;
 *   * ce module — seul à ÉCRIRE, et jamais capable de lire.
 *
 * L'interdiction de `select` ici n'est pas décorative : sans elle, ce module
 * deviendrait un second chemin de lecture sans contrôle de droits, et la
 * garantie d'origine tomberait.
 */

export interface PageAEnregistrer {
  numero: number;
  cheminHaute: string;
  cheminAllegee: string;
  largeur: number;
  hauteur: number;
  /** Couche texte de la page. `null` si le PDF source n'en avait pas (§7.4.4). */
  texte: string | null;
}

/**
 * Enregistre les pages d'une version linguistique.
 *
 * `upsert` sur `(translation_id, numero)` : une ingestion reprise après échec
 * réécrit les pages déjà traitées au lieu de buter sur la contrainte d'unicité.
 * C'est ce qui rend la reprise possible sans nettoyage préalable.
 */
export async function enregistrerPages(
  translationId: string,
  pages: readonly PageAEnregistrer[],
  options: { client?: AppSupabaseClient } = {},
): Promise<number> {
  if (pages.length === 0) return 0;

  const client = options.client ?? createServiceClient();

  const lignes = pages.map((page) => ({
    translation_id: translationId,
    numero: page.numero,
    chemin_haute: page.cheminHaute,
    chemin_allegee: page.cheminAllegee,
    largeur: page.largeur,
    hauteur: page.hauteur,
    texte: page.texte,
  }));

  const { error } = await client
    .from('book_pages')
    .upsert(lignes, { onConflict: 'translation_id,numero' });

  if (error) {
    throw new Error(`Enregistrement des pages impossible : ${error.message}`);
  }

  logger.info('Pages enregistrées', { translationId, nbPages: lignes.length });
  return lignes.length;
}

/**
 * Efface les pages d'une version linguistique.
 *
 * Sert au nettoyage d'une ingestion échouée. Ne rend AUCUNE donnée : la
 * suppression ne fait pas sortir de contenu.
 */
export async function effacerPages(
  translationId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<void> {
  const client = options.client ?? createServiceClient();

  const { error } = await client.from('book_pages').delete().eq('translation_id', translationId);

  if (error) {
    logger.warn('Effacement des pages incomplet', { translationId, detail: error.message });
  }
}
