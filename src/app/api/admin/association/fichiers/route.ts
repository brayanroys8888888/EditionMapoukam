import { z } from 'zod';

import { gardeAdmin } from '@/lib/admin/route-helpers';
import { errors, fail, created } from '@/lib/http/responses';
import {
  ROLES_FICHIER,
  TAILLES_MAX,
  deposerFichierAssociation,
  mediaAssociatif,
  typesAcceptes,
} from '@/lib/storage/association';

/**
 * DÉPOSER UN FICHIER DE L'ASSOCIATION — la couverture, une photo, une vidéo,
 * un son, une fiche PDF.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE FICHIER ARRIVE PAR LE CORPS. LE CLIENT NE DÉSIGNE JAMAIS DE CHEMIN.  │
 * │                                                                          │
 * │ Même raison qu'au dépôt d'un PDF de livre, et elle vaut d'être répétée : │
 * │ accepter un chemin serveur donnerait à tout compte administrateur une    │
 * │ lecture arbitraire du système de fichiers, puis une URL signée pour la   │
 * │ servir. Le fichier n'existe donc, ici, qu'en mémoire.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TROIS CONTRÔLES, ET LE DERNIER EST LE SEUL QUI PROUVE QUELQUE CHOSE.    │
 * │                                                                          │
 * │ 1. le RÔLE — il décide du bucket, donc de qui verra le fichier ;         │
 * │ 2. la TAILLE — avant de lire les octets, pour ne pas charger 200 Mo      │
 * │    qu'on s'apprête à refuser ;                                           │
 * │ 3. les OCTETS DE TÊTE — parce que `file.type` est déclaré par le         │
 * │    navigateur, et qu'un navigateur se pilote. Un exécutable renommé      │
 * │    `.png` passe les deux premiers sans broncher.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Réservée aux administrateurs : `gardeAdmin` apporte le contrôle du rôle ET
 * le quota de débit — un dépôt de 200 Mo répété n'est pas borné par son
 * plafond unitaire.
 */

/**
 * Les signatures que l'on sait reconnaître, par type MIME déclaré.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN TYPE SANS SIGNATURE CONNUE EST REFUSÉ, PAS ACCEPTÉ PAR DÉFAUT.       │
 * │                                                                          │
 * │ C'est le sens du `?? null` plus bas. Le réflexe inverse — « je ne sais   │
 * │ pas vérifier, donc je laisse passer » — transforme chaque type ajouté à  │
 * │ la liste des formats en trou, sans que personne le remarque : le dépôt   │
 * │ marche, et c'est tout ce qu'on regarde.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les conteneurs MP4/M4A portent leur marque à l'octet 4 (`ftyp`), pas au
 * début : leurs quatre premiers octets sont la taille de la boîte.
 */
const SIGNATURES: Record<string, { debut: number; octets: number[] }[]> = {
  'image/png': [{ debut: 0, octets: [0x89, 0x50, 0x4e, 0x47] }],
  'image/jpeg': [{ debut: 0, octets: [0xff, 0xd8, 0xff] }],
  // WebP et AVIF sont des conteneurs : RIFF….WEBP, et ….ftyp pour AVIF.
  'image/webp': [{ debut: 0, octets: [0x52, 0x49, 0x46, 0x46] }],
  'image/avif': [{ debut: 4, octets: [0x66, 0x74, 0x79, 0x70] }],
  'application/pdf': [{ debut: 0, octets: [0x25, 0x50, 0x44, 0x46, 0x2d] }],
  'video/mp4': [{ debut: 4, octets: [0x66, 0x74, 0x79, 0x70] }],
  'video/webm': [{ debut: 0, octets: [0x1a, 0x45, 0xdf, 0xa3] }],
  'audio/mp4': [{ debut: 4, octets: [0x66, 0x74, 0x79, 0x70] }],
  'audio/ogg': [{ debut: 0, octets: [0x4f, 0x67, 0x67, 0x53] }],
  'audio/wav': [{ debut: 0, octets: [0x52, 0x49, 0x46, 0x46] }],
  /*
   * MP3 a DEUX têtes légitimes : une étiquette ID3, ou directement une trame
   * dont les onze premiers bits sont à 1. N'en accepter qu'une refuserait la
   * moitié des fichiers du monde — et les deux se ressemblent si peu qu'aucun
   * `startsWith` unique ne les couvre.
   */
  'audio/mpeg': [
    { debut: 0, octets: [0x49, 0x44, 0x33] },
    { debut: 0, octets: [0xff, 0xfb] },
    { debut: 0, octets: [0xff, 0xf3] },
    { debut: 0, octets: [0xff, 0xf2] },
    { debut: 0, octets: [0xff, 0xe3] },
  ],
};

function signatureReconnue(contenu: Buffer, type: string): boolean {
  const attendues = SIGNATURES[type] ?? null;
  // Aucune signature connue : on refuse. Voir l'encadré ci-dessus.
  if (attendues === null) return false;

  return attendues.some(({ debut, octets }) =>
    octets.every((octet, rang) => contenu[debut + rang] === octet),
  );
}

/**
 * LE CHAMP `role`, VALIDÉ COMME PARTOUT AILLEURS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ZOD MÊME POUR UN SEUL CHAMP, ET MÊME EN `multipart`.                    │
 * │                                                                          │
 * │ Une garde écrite à la main aurait suffi ici — il n'y a qu'une valeur à   │
 * │ contrôler, et elle appartient à une liste close. Mais la règle du dépôt  │
 * │ est « toute route API valide ses entrées avec Zod avant tout             │
 * │ traitement », et un test d'inventaire recense les routes mutantes pour   │
 * │ vérifier qu'aucune n'y échappe.                                          │
 * │                                                                          │
 * │ L'exception ne se discute pas au cas par cas : une route dispensée       │
 * │ parce que « son entrée est simple » devient le précédent de la suivante, │
 * │ dont l'entrée l'est un peu moins.                                        │
 * │                                                                          │
 * │ La liste vient de `ROLES_FICHIER`, et n'est pas recopiée : c'est elle    │
 * │ qui décide du bucket, donc de qui verra le fichier. Deux listes pour ce  │
 * │ choix-là divergeraient en silence.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const champsSchema = z.object({
  role: z.enum(ROLES_FICHIER),
});

/** Le plafond d'un rôle, en mégaoctets, pour le message de refus. */
function enMo(octets: number): number {
  return Math.round(octets / (1024 * 1024));
}

export async function POST(request: Request): Promise<Response> {
  const garde = await gardeAdmin(request);
  if (!garde.ok) return garde.response;

  let formulaire: FormData;
  try {
    formulaire = await request.formData();
  } catch {
    return fail(400, {
      code: 'corps_illisible',
      message: 'Le fichier doit être envoyé en `multipart/form-data`.',
    });
  }

  const champs = champsSchema.safeParse({ role: formulaire.get('role') });
  if (!champs.success) {
    return errors.validation({ role: ['Rôle de fichier inconnu.'] });
  }
  const { role } = champs.data;

  const fichier = formulaire.get('fichier');
  if (!(fichier instanceof File)) {
    return errors.validation({ fichier: ['Un fichier est requis.'] });
  }
  if (fichier.size === 0) {
    return errors.validation({ fichier: ['Le fichier est vide.'] });
  }
  if (fichier.size > TAILLES_MAX[role]) {
    return fail(413, {
      code: 'fichier_trop_volumineux',
      message: `Le fichier dépasse la taille maximale acceptée (${String(enMo(TAILLES_MAX[role]))} Mo).`,
    });
  }

  if (!typesAcceptes(role).includes(fichier.type)) {
    return errors.validation({ fichier: ['Ce format n’est pas accepté pour cet emplacement.'] });
  }

  const contenu = Buffer.from(await fichier.arrayBuffer());

  /*
   * Le type DÉCLARÉ vient d'être accepté ; les octets, eux, ne mentent pas.
   * Un fichier dont la tête ne correspond pas au type annoncé est refusé sans
   * qu'on cherche à deviner ce qu'il est vraiment : la question n'est pas
   * « qu'est-ce que c'est », mais « est-ce bien ce qui est annoncé ».
   */
  if (!signatureReconnue(contenu, fichier.type)) {
    return errors.validation({
      fichier: ['Le contenu du fichier ne correspond pas à son format annoncé.'],
    });
  }

  const chemin = await deposerFichierAssociation(contenu, { role, type: fichier.type });
  if (chemin === null) {
    return fail(500, {
      code: 'erreur_interne',
      message: 'Le fichier n’a pas pu être déposé.',
    });
  }

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ DEUX VALEURS, ET IL NE FAUT PAS LES CONFONDRE.                          │
   * │                                                                          │
   * │ `chemin` est ce qui part EN BASE. C'est `mediaAssociatif` qui le         │
   * │ retraduit au moment de servir — URL publique pour une couverture, URL    │
   * │ signée de courte durée pour le reste. Écrire une URL signée en base la   │
   * │ rendrait périmée cinq minutes plus tard.                                 │
   * │                                                                          │
   * │ `apercu` est ce que l'ÉCRAN affiche, et rien d'autre. Sans lui, le       │
   * │ fichier qu'on vient de déposer apparaît cassé : le champ porte un        │
   * │ chemin de stockage, qu'un navigateur prend pour une adresse relative et  │
   * │ va chercher là où il n'y a rien. L'éditeur croirait son dépôt raté       │
   * │ alors qu'il a réussi.                                                    │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  return created({ chemin, apercu: await mediaAssociatif(chemin) });
}
