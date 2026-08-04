import { randomUUID } from 'node:crypto';

import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { createServiceClient } from '@/lib/supabase/clients';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import taillesCouverture from './tailles-couverture.json';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEUL MODULE DU DÉPÔT AUTORISÉ À ÉCRIRE DANS LE BUCKET PUBLIC `covers`.   │
 * │                                                                          │
 * │ Un test d'architecture parcourt `src/**` et échoue si un autre fichier   │
 * │ y écrit. Une seule erreur d'aiguillage dans la chaîne d'ingestion y      │
 * │ déposerait des pages de livre ou un fichier complet — en accès libre et  │
 * │ indexable par les moteurs de recherche.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * TROIS GARANTIES, ET POURQUOI
 *
 * 1. **Ce bucket ne contient que des couvertures.** C'est le seul contenu dont
 *    la diffusion libre est voulue : une couverture est un argument de vente,
 *    elle doit être indexable (§5.4) et servie par le CDN.
 *
 * 2. **Les chemins ne sont pas devinables.** Le nom de fichier repose sur un
 *    identifiant aléatoire, jamais sur le titre ni sur un identifiant
 *    séquentiel. Sans cela, la couverture d'un titre encore en brouillon
 *    deviendrait accessible à qui devine l'URL — et les prochaines parutions du
 *    client fuiteraient avant leur annonce.
 *
 * 3. **Seules les tailles d'affichage y figurent.** L'original haute définition
 *    reste dans le stockage privé, avec les fichiers sources : c'est lui qui
 *    servirait à une réimpression ou à une reprise, et il n'a rien à faire en
 *    accès libre.
 */
export const BUCKET_PUBLIC = 'covers';

/**
 * Tailles d'affichage du catalogue, en pixels de largeur.
 *
 * Bornées volontairement : au-delà, on servirait une image exploitable pour
 * autre chose que l'affichage.
 */
/**
 * Trois tailles, en pixels de largeur :
 *
 *   `vignette`      — grille du catalogue, 320 px ;
 *   `fiche`         — page d'un titre, 800 px ;
 *   `mise-en-avant` — bandeau d'accueil, 1600 px.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES VALEURS VIVENT EN JSON, ET C'EST DÉLIBÉRÉ.                          │
 * │                                                                          │
 * │ Elles sont lues par ce module ET par `scripts/produire-couvertures.mjs`, │
 * │ qui ne peut pas importer de TypeScript. Les recopier dans le script      │
 * │ aurait fait deux sources de vérité sur des dimensions d'image — et la    │
 * │ divergence ne se serait vue que sur des couvertures floues ou inutilement│
 * │ lourdes, c'est-à-dire trop tard.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const TAILLES_COUVERTURE = taillesCouverture;

export type TailleCouverture = keyof typeof TAILLES_COUVERTURE;

/** Largeur maximale acceptée dans le bucket public. */
export const LARGEUR_PUBLIQUE_MAX = 1600;

export interface CouverturePubliee {
  /** Jeton aléatoire commun aux trois tailles d'un même titre. */
  jeton: string;
  /** Chemin complet par taille, prêt à être stocké en base. */
  chemins: Record<TailleCouverture, string>;
}

/**
 * Chemin public d'une couverture.
 *
 * Le jeton précède le nom de la taille : deux titres ne partagent jamais de
 * préfixe, et connaître une taille ne permet pas de deviner celle d'un autre
 * titre.
 */
export function cheminCouverture(jeton: string, taille: TailleCouverture): string {
  return `${BUCKET_PUBLIC}/${jeton}/${taille}.webp`;
}

/** Jeton aléatoire d'un nouveau jeu de couvertures. */
export function nouveauJetonCouverture(): string {
  return randomUUID().replace(/-/g, '');
}

/** Les trois tailles d'un jeu de couvertures, en URL absolues. */
export interface UrlsCouverture {
  vignette: string;
  fiche: string;
  mise_en_avant: string;
}

/**
 * URL publiques des trois tailles.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE EST LE SEUL À CONNAÎTRE LA CONVENTION DE CHEMIN — ET C'EST     │
 * │ POURQUOI C'EST LUI QUI CONSTRUIT LES URL.                               │
 * │                                                                          │
 * │ La base stocke le JETON, pas trois chemins : elle porte l'identité du    │
 * │ jeu de couvertures. Reconstituer « vignette » en remplaçant « fiche »    │
 * │ dans une chaîne, ailleurs, ferait vivre la convention à deux endroits —  │
 * │ dont l'un ne saurait pas qu'il l'applique.                               │
 * │                                                                          │
 * │ Le bucket `covers` est PUBLIC, délibérément : une couverture est un      │
 * │ argument de vente, elle doit être indexable (§5.4) et servie par le CDN. │
 * │ C'est le seul contenu du projet dans ce cas.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Rend `null` pour un titre sans couverture — un livre en cours d'ingestion,
 * par exemple. L'interface affiche alors son propre substitut, plutôt qu'une
 * image cassée.
 */
export function urlsCouverture(jeton: string | null): UrlsCouverture | null {
  if (!jeton) return null;

  const base = `${getServerEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_PUBLIC}/${jeton}`;
  return {
    vignette: `${base}/vignette.webp`,
    fiche: `${base}/fiche.webp`,
    mise_en_avant: `${base}/mise-en-avant.webp`,
  };
}

export interface ImageCouverture {
  taille: TailleCouverture;
  contenu: Buffer;
  largeur: number;
}

/**
 * Dépose les tailles d'affichage d'une couverture dans le bucket public.
 *
 * Refuse toute image plus large que `LARGEUR_PUBLIQUE_MAX` : la borne est
 * vérifiée ici, et non seulement chez l'appelant, parce que c'est ici qu'elle
 * protège quelque chose.
 */
export async function publierCouverture(
  images: readonly ImageCouverture[],
  options: { client?: AppSupabaseClient; jeton?: string } = {},
): Promise<CouverturePubliee> {
  const jeton = options.jeton ?? nouveauJetonCouverture();
  const client = options.client ?? createServiceClient();
  const chemins = {} as Record<TailleCouverture, string>;

  for (const image of images) {
    if (image.largeur > LARGEUR_PUBLIQUE_MAX) {
      throw new Error(
        `Couverture refusée : ${String(image.largeur)} px dépasse la largeur d'affichage maximale (${String(LARGEUR_PUBLIQUE_MAX)} px). L'original haute définition reste dans le stockage privé.`,
      );
    }

    const cheminComplet = cheminCouverture(jeton, image.taille);
    const chemin = cheminComplet.slice(BUCKET_PUBLIC.length + 1);

    const { error } = await client.storage
      .from(BUCKET_PUBLIC)
      .upload(chemin, image.contenu, { contentType: 'image/webp', upsert: true });

    if (error) {
      throw new Error(`Dépôt de couverture impossible (${image.taille}) : ${error.message}`);
    }
    chemins[image.taille] = cheminComplet;
  }

  logger.info('Couvertures publiées', { jeton, tailles: images.map((i) => i.taille) });
  return { jeton, chemins };
}

/**
 * Retire un jeu de couvertures.
 *
 * Sert au nettoyage d'une ingestion interrompue : un titre à moitié ingéré ne
 * doit pas laisser d'images orphelines en accès libre.
 */
export async function retirerCouvertures(
  jeton: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<void> {
  const client = options.client ?? createServiceClient();
  const chemins = Object.keys(TAILLES_COUVERTURE).map(
    (taille) => `${jeton}/${taille}.webp`,
  );

  const { error } = await client.storage.from(BUCKET_PUBLIC).remove(chemins);
  if (error) {
    logger.warn('Retrait de couvertures incomplet', { jeton, detail: error.message });
  }
}
