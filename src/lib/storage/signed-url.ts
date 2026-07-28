import { createServiceClient } from '@/lib/supabase/clients';
import type { AppSupabaseClient } from '@/lib/supabase/clients';
import {
  getServerEnv,
  SIGNED_URL_TTL_FREE_MAX_SECONDS,
  SIGNED_URL_TTL_MAX_SECONDS,
} from '@/lib/config/env';
import { logger } from '@/lib/logger';

/**
 * Émission d'URL signées.
 *
 * CLAUDE.md règle 3, réécrite après arbitrage (docs/PLAN.md D6) :
 *
 *   « Les URL signées ont une durée de validité de 300 secondes maximum pour
 *     tout contenu payant, sans exception. Les titres marqués gratuit = true
 *     peuvent avoir une durée allongée, plafonnée à 3600 secondes, et être mis
 *     en cache CDN. La vérification des droits reste effectuée à chaque requête
 *     dans les deux cas. »
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES PLAFONDS SONT APPLIQUÉS ICI, DANS LE CODE.                          │
 * │ Pas seulement dans la configuration : une variable d'environnement mal   │
 * │ renseignée, un fichier `.env` recopié d'un autre projet, et un lien de   │
 * │ contenu payant deviendrait partageable pendant des heures. Un test le    │
 * │ vérifie en forçant une valeur démesurée.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type BucketProtege = 'book-sources' | 'book-pages' | 'book-downloads';

export interface UrlSignee {
  url: string;
  /** Durée réellement appliquée, après plafonnement. */
  expireDansSecondes: number;
  expireLe: string;
}

/**
 * Durée de validité applicable, plafonds compris.
 *
 * Exportée pour être testable seule : c'est une décision de sécurité, elle
 * mérite mieux qu'une vérification indirecte à travers une route.
 */
export function dureeValidite(livreGratuit: boolean): number {
  const env = getServerEnv();
  return livreGratuit
    ? Math.min(env.SIGNED_URL_TTL_FREE, SIGNED_URL_TTL_FREE_MAX_SECONDS)
    : Math.min(env.SIGNED_URL_TTL, SIGNED_URL_TTL_MAX_SECONDS);
}

/**
 * Signe un chemin de stockage.
 *
 * Le chemin est fourni sous la forme `bucket/chemin/vers/objet`, telle qu'elle
 * est stockée en base. Le découpage est fait ici pour que les appelants n'aient
 * jamais à connaître le nom des bucket.
 */
export async function signer(
  cheminComplet: string,
  options: { livreGratuit: boolean; client?: AppSupabaseClient; telechargement?: string },
): Promise<UrlSignee | null> {
  const separateur = cheminComplet.indexOf('/');
  if (separateur <= 0) {
    logger.error('Chemin de stockage malformé', { chemin: cheminComplet });
    return null;
  }

  const bucket = cheminComplet.slice(0, separateur);
  const chemin = cheminComplet.slice(separateur + 1);
  const duree = dureeValidite(options.livreGratuit);

  const client = options.client ?? createServiceClient();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(chemin, duree, options.telechargement ? { download: options.telechargement } : {});

  if (error || !data) {
    // Un objet absent n'est pas une anomalie de sécurité : il signale une
    // ingestion incomplète. On trace sans divulguer le chemin au client.
    logger.warn('URL signée impossible', { bucket, detail: error?.message });
    return null;
  }

  return {
    url: data.signedUrl,
    expireDansSecondes: duree,
    // Heure RÉELLE, et non l'horloge simulée : la signature émise par le
    // stockage expire selon le temps du monde, que la console de simulation ait
    // déplacé l'horloge métier ou non. Annoncer autre chose serait mentir.
    expireLe: new Date(Date.now() + duree * 1000).toISOString(),
  };
}
