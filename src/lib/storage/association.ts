import { randomUUID } from 'node:crypto';

import { createServiceClient } from '@/lib/supabase/clients';
import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { signer } from './signed-url';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║ LES FICHIERS DE L'ASSOCIATION — SEUL MODULE AUTORISÉ À LES ÉCRIRE.        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Migration `0109`. Deux bucket, et la ligne entre eux est une décision, pas
 * une commodité :
 *
 *   `association-images`    PUBLIC — la COUVERTURE, et elle seule. Elle
 *                           s'affiche sur les cartes de `/association`, y
 *                           compris celles des contenus réservés, où elle est
 *                           justement ce qui donne envie d'adhérer. C'est le
 *                           même arbitrage que `covers` pour les livres.
 *
 *   `association-fichiers`  PRIVÉ — tout le reste : photos DU CORPS, vidéos,
 *                           sons, fiches PDF. Ils vivent derrière le mur, et
 *                           leur adresse ne suffit pas : il faut une signature.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POURQUOI UN JETON ALÉATOIRE PLUTÔT QUE LE NOM DU FICHIER.               │
 * │                                                                          │
 * │ Deux raisons, et la seconde compte plus que la première. Un nom déposé   │
 * │ par un navigateur peut contenir à peu près n'importe quoi — accents,     │
 * │ espaces, `..`, un point-virgule —, et le nettoyer correctement est un    │
 * │ exercice qu'on rate. Surtout, un nom lisible se DEVINE : deux fiches     │
 * │ appelées `atelier-douala.pdf` et `atelier-yaounde.pdf` se déduisent      │
 * │ l'une de l'autre, et sur le bucket public cela suffirait à trouver ce    │
 * │ qu'on n'a pas encore annoncé.                                            │
 * │                                                                          │
 * │ Le nom d'origine est donc jeté. Ce qui compte de lui — l'extension —     │
 * │ est REDÉDUIT du type MIME, que la route a déjà vérifié contre les        │
 * │ octets de tête du fichier.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export const BUCKET_IMAGES_ASSOCIATION = 'association-images';
export const BUCKET_FICHIERS_ASSOCIATION = 'association-fichiers';

/**
 * LE RÔLE D'UN FICHIER, et non son format.
 *
 * C'est le rôle qui décide du bucket, parce que c'est lui qui dit qui doit
 * voir le fichier. Une image de couverture et une photo de corps sont le même
 * format et n'ont pas le même public : trancher sur le format mettrait la
 * seconde en accès libre.
 */
export const ROLES_FICHIER = ['couverture', 'photo', 'video', 'audio', 'document'] as const;
export type RoleFichier = (typeof ROLES_FICHIER)[number];

/**
 * Les types acceptés par rôle, et l'extension qu'on leur donne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE TABLE EST LE CONTRÔLE, PAS UNE COMMODITÉ.                         │
 * │                                                                          │
 * │ Elle est close : un type absent est refusé, sans liste noire à tenir à   │
 * │ jour. Et elle est indexée PAR RÔLE, ce qui interdit de déposer une       │
 * │ vidéo à la place d'une couverture — un fichier que rien n'afficherait,   │
 * │ et que le plafond de 5 Mo du bucket public refuserait de toute façon,    │
 * │ mais beaucoup plus tard et avec un message qui ne dirait pas pourquoi.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const EXTENSIONS: Record<RoleFichier, Record<string, string>> = {
  couverture: { 'image/webp': 'webp', 'image/avif': 'avif', 'image/png': 'png', 'image/jpeg': 'jpg' },
  photo: { 'image/webp': 'webp', 'image/avif': 'avif', 'image/png': 'png', 'image/jpeg': 'jpg' },
  video: { 'video/mp4': 'mp4', 'video/webm': 'webm' },
  audio: { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav' },
  document: { 'application/pdf': 'pdf' },
};

/** Le bucket d'un rôle. La couverture est la SEULE publique. */
export function bucketDuRole(role: RoleFichier): string {
  return role === 'couverture' ? BUCKET_IMAGES_ASSOCIATION : BUCKET_FICHIERS_ASSOCIATION;
}

/**
 * Les types MIME qu'un rôle accepte — la route s'en sert pour son refus.
 *
 * Elle les lit ici plutôt que d'en tenir sa propre liste : deux listes pour un
 * seul contrôle divergent, et c'est celle de la route qu'on croirait.
 */
export function typesAcceptes(role: RoleFichier): string[] {
  return Object.keys(EXTENSIONS[role]);
}

/**
 * Plafonds par rôle, en octets.
 *
 * Plus bas que ceux des bucket, délibérément : le bucket est le dernier filet,
 * celui qui tient même si cette table se trompait. Une couverture de 5 Mo est
 * déjà énorme pour une image de carte ; une heure de replay, elle, ne tient
 * pas dans moins de deux cents.
 */
export const TAILLES_MAX: Record<RoleFichier, number> = {
  couverture: 5 * 1024 * 1024,
  photo: 10 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  document: 50 * 1024 * 1024,
};

/**
 * Dépose un fichier et rend son chemin complet, `bucket/jeton.ext`.
 *
 * C'est cette chaîne qui part en base, et c'est elle que `mediaAssociatif`
 * retraduit en adresse au moment de servir. Rien d'autre du fichier d'origine
 * n'est conservé — ni son nom, ni sa date.
 */
export async function deposerFichierAssociation(
  contenu: Buffer,
  options: { role: RoleFichier; type: string; client?: AppSupabaseClient },
): Promise<string | null> {
  const extension = EXTENSIONS[options.role][options.type];
  if (extension === undefined) {
    logger.warn('Type refusé au dépôt associatif', { role: options.role, type: options.type });
    return null;
  }

  const bucket = bucketDuRole(options.role);
  const chemin = `${randomUUID().replace(/-/g, '')}.${extension}`;

  const client = options.client ?? createServiceClient();
  const { error } = await client.storage.from(bucket).upload(chemin, contenu, {
    contentType: options.type,
    // Jamais d'écrasement : le jeton est neuf à chaque dépôt, donc une
    // collision signalerait une panne du générateur, pas un remplacement
    // voulu. L'écraser masquerait la panne.
    upsert: false,
  });

  if (error) {
    logger.error('Dépôt associatif impossible', { bucket, detail: error.message });
    return null;
  }

  return `${bucket}/${chemin}`;
}

/**
 * Une valeur stockée est-elle un chemin de NOTRE stockage ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LES DEUX FORMES COHABITENT, ET C'EST VOULU.                             │
 * │                                                                          │
 * │ Les huit contenus déjà en base portent des adresses collées à la main —  │
 * │ `https://…`, ou `/images/association/…` servi par `public/`. Elles       │
 * │ doivent continuer de marcher : migrer les fichiers de quelqu'un d'autre  │
 * │ n'est pas au programme, et couper ces adresses viderait l'écran.         │
 * │                                                                          │
 * │ Le critère est donc simple et sans ambiguïté : un chemin de stockage     │
 * │ commence par le nom d'un de nos deux bucket. Tout le reste est une       │
 * │ adresse, et part telle quelle.                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function estCheminAssociatif(valeur: string): boolean {
  return (
    valeur.startsWith(`${BUCKET_IMAGES_ASSOCIATION}/`) ||
    valeur.startsWith(`${BUCKET_FICHIERS_ASSOCIATION}/`)
  );
}

/**
 * Traduit une valeur stockée en adresse servable.
 *
 * Trois cas, dans cet ordre :
 *
 *   1. une adresse collée à la main → rendue telle quelle ;
 *   2. un chemin du bucket PUBLIC → l'URL publique, cachable par le CDN ;
 *   3. un chemin du bucket PRIVÉ → une URL SIGNÉE, de 300 secondes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `livreGratuit: false` — LE PLAFOND LE PLUS COURT, ET RIEN D'AUTRE.      │
 * │                                                                          │
 * │ `signer` propose une durée allongée pour les titres gratuits, jusqu'à    │
 * │ une heure. Elle ne s'applique pas ici : un contenu associatif « libre »  │
 * │ n'est pas un titre gratuit du catalogue, et surtout son caractère libre  │
 * │ peut être RETIRÉ par l'éditeur d'un clic. Une URL valable une heure      │
 * │ survivrait à ce clic, et le contenu resterait ouvert après avoir été     │
 * │ refermé.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Rend `null` quand la signature échoue — un objet effacé, un bucket absent.
 * L'appelant retire alors le bloc plutôt que de rendre une image cassée.
 */
export async function mediaAssociatif(
  valeur: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<string | null> {
  if (!estCheminAssociatif(valeur)) return valeur;

  if (valeur.startsWith(`${BUCKET_IMAGES_ASSOCIATION}/`)) {
    const chemin = valeur.slice(BUCKET_IMAGES_ASSOCIATION.length + 1);
    return `${getServerEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_IMAGES_ASSOCIATION}/${chemin}`;
  }

  const signee = await signer(valeur, {
    livreGratuit: false,
    ...(options.client ? { client: options.client } : {}),
  });
  return signee?.url ?? null;
}
