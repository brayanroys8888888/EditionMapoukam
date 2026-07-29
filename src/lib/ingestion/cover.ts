import sharp from 'sharp';

import { rendreUnePage } from './render-pages';
import { TAILLES_COUVERTURE, type ImageCouverture, type TailleCouverture } from '@/lib/storage/covers';
import { logger } from '@/lib/logger';

/**
 * Génération de la couverture — §7.4.3, étape 3.
 *
 * La couverture est la première page du PDF, déclinée dans les trois formats
 * du catalogue. Le client ne fournit pas d'image séparée : §7.4.1 pose que
 * « le PDF est le seul livrable de contenu exigé ».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE PRODUIT DES IMAGES, IL N'EN PUBLIE AUCUNE.                     │
 * │                                                                          │
 * │ Le dépôt dans le bucket public passe par `publierCouverture`, seul module │
 * │ autorisé à y écrire — un test d'architecture le vérifie sur tout `src/**`.│
 * │ La séparation n'est pas cosmétique : c'est elle qui garantit qu'aucune    │
 * │ page intérieure ni fichier complet ne peut atterrir en accès libre par    │
 * │ une erreur d'aiguillage de la chaîne.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** La couverture est la première page. Jamais une autre. */
const PAGE_DE_COUVERTURE = 1;

/**
 * Décline une image de couverture dans les trois formats du catalogue.
 *
 * `withoutEnlargement` : une source plus petite que la taille demandée n'est
 * jamais agrandie — un agrandissement ne crée pas de détail, il ne fait
 * qu'alourdir le fichier en affichant du flou. La largeur RÉELLE obtenue est
 * relue sur l'image produite, et non supposée : c'est elle que le module de
 * publication contrôle contre son plafond.
 */
export async function declinerCouverture(source: Buffer): Promise<ImageCouverture[]> {
  const images: ImageCouverture[] = [];

  for (const [taille, largeur] of Object.entries(TAILLES_COUVERTURE) as [
    TailleCouverture,
    number,
  ][]) {
    const contenu = await sharp(source)
      .resize({ width: largeur, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const dimensions = await sharp(contenu).metadata();
    images.push({ taille, contenu, largeur: dimensions.width });
  }

  logger.debug('Couverture déclinée', {
    tailles: images.map((i) => `${i.taille}:${String(i.largeur)}`),
  });

  return images;
}

/** Produit les trois formats de couverture à partir du PDF source. */
export async function produireCouverture(cheminPdf: string): Promise<ImageCouverture[]> {
  return declinerCouverture(await rendreUnePage(cheminPdf, PAGE_DE_COUVERTURE));
}
