import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import { getAccess } from '@/lib/access/engine';
import { getClock, type Clock } from '@/lib/clock';
import { signer, type UrlSignee } from '@/lib/storage/signed-url';
import { cheminCopie, identifiantCopie, type DemandeCopie } from '@/domain/downloads/copie';
import { filigranerPdf, type MetadonneesCopie } from '@/domain/downloads/watermark-pdf';
import { filigranerEpub } from '@/domain/downloads/watermark-epub';
import { Semaphore, avecDelai } from '@/lib/http/concurrence';
import { logger } from '@/lib/logger';

/**
 * Service de téléchargement filigrané — §9.4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ÉCHEC FERMÉ. LE FICHIER D'ORIGINE N'EST JAMAIS SERVI EN REPLI.          │
 * │                                                                          │
 * │ Si la génération échoue — PDF corrompu, mémoire insuffisante, délai      │
 * │ dépassé, police illisible — l'appelant reçoit une erreur. Jamais le      │
 * │ fichier nu.                                                              │
 * │                                                                          │
 * │ Un repli serait la panne silencieuse parfaite : tout fonctionne,         │
 * │ l'acheteur reçoit son livre, personne ne remarque rien — et les fichiers │
 * │ partent sans protection pendant des semaines. On ne s'en apercevrait     │
 * │ qu'en trouvant un exemplaire en circulation sans pouvoir dire d'où il    │
 * │ vient, c'est-à-dire au moment précis où la trace devait servir.          │
 * │                                                                          │
 * │ Un test force l'échec de la génération et vérifie qu'aucun octet du      │
 * │ fichier d'origine n'est servi.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Générations simultanées autorisées.
 *
 * Trois, volontairement bas : chaque génération tient un album entier en
 * mémoire. Mieux vaut faire attendre le quatrième acheteur que faire tomber le
 * processus pour tout le monde, lecture en ligne comprise.
 */
const GENERATIONS_SIMULTANEES = 3;

/** Délai maximal d'une génération. Un album se filigrane en secondes. */
const DELAI_GENERATION_MS = 60_000;

const semaphore = new Semaphore(GENERATIONS_SIMULTANEES);

/** Police embarquée dans les filigranes, lue une seule fois. */
const CHEMIN_POLICE = join(process.cwd(), 'vendors', 'fonts', 'NotoSans-Regular.ttf');
let policeEnCache: Buffer | null = null;

async function police(): Promise<Buffer> {
  policeEnCache ??= await readFile(CHEMIN_POLICE);
  return policeEnCache;
}

export type RefusTelechargement =
  | 'droit_absent'
  | 'traduction_introuvable'
  | 'fichier_source_absent'
  | 'generation_impossible';

export type ResultatTelechargement =
  | { ok: true; url: UrlSignee; copieId: string; regeneree: boolean }
  | { ok: false; raison: RefusTelechargement };

export interface ContexteAppelant {
  userId: string;
  email: string;
}

/**
 * Sert une copie filigranée, en la produisant si besoin.
 *
 * L'ordre est celui de §9.4 : droits d'abord, cache ensuite, génération en
 * dernier recours. Vérifier les droits en premier n'est pas une optimisation —
 * c'est ce qui garantit qu'aucun octet de contenu n'est lu avant l'autorisation.
 */
export async function servirTelechargement(
  appelant: ContexteAppelant,
  demande: Omit<DemandeCopie, 'userId'>,
  options: { client?: AppSupabaseClient; clock?: Clock; adresseIp?: string | null } = {},
): Promise<ResultatTelechargement> {
  const client = options.client ?? createServiceClient();
  const clock = options.clock ?? getClock();

  const acces = await getAccess(appelant.userId, demande.bookId, { client });
  if (!acces.canDownload) {
    return { ok: false, raison: 'droit_absent' };
  }

  const traduction = await lireTraduction(client, demande);
  if (!traduction) {
    return { ok: false, raison: 'traduction_introuvable' };
  }

  const copieId = identifiantCopie({ ...demande, userId: appelant.userId });
  const chemin = cheminCopie(copieId, demande.format);

  const existante = await client
    .from('download_copies')
    .select('copie_id')
    .eq('copie_id', copieId)
    .maybeSingle();

  let regeneree = false;

  if (!existante.data) {
    const produite = await produire(client, {
      appelant,
      demande,
      copieId,
      chemin,
      traduction,
      genereLe: clock.now(),
    });
    if (!produite) {
      return { ok: false, raison: 'generation_impossible' };
    }
    regeneree = true;
  }

  // `dernier_acces_le` conditionne la purge : une copie redemandée ne doit pas
  // être effacée pour inactivité.
  await client
    .from('download_copies')
    .update({ dernier_acces_le: clock.now().toISOString() })
    .eq('copie_id', copieId);

  const url = await signer(chemin, {
    // Un fichier téléchargeable n'a JAMAIS la durée longue, même pour un titre
    // gratuit : la gratuité porte sur la lecture, pas sur le téléchargement.
    livreGratuit: false,
    client,
    telechargement: `${traduction.titre}.${demande.format}`,
  });

  if (!url) {
    // Le fichier a disparu du stockage alors que sa ligne existe — purge
    // partielle, ou effacement manuel. La ligne est retirée pour que la
    // prochaine demande régénère au lieu d'échouer indéfiniment.
    await client.from('download_copies').delete().eq('copie_id', copieId);
    logger.error('Copie référencée mais absente du stockage', { copieId, chemin });
    return { ok: false, raison: 'fichier_source_absent' };
  }

  await client.from('download_logs').insert({
    user_id: appelant.userId,
    book_id: demande.bookId,
    langue: demande.langue,
    format: demande.format,
    adresse_ip: options.adresseIp ?? null,
  });

  logger.info('Téléchargement servi', {
    userId: appelant.userId,
    bookId: demande.bookId,
    langue: demande.langue,
    format: demande.format,
    copieId,
    regeneree,
  });

  return { ok: true, url, copieId, regeneree };
}

interface Traduction {
  titre: string;
  auteur: string;
  cheminSource: string;
}

/**
 * Version linguistique publiée, avec son fichier source.
 *
 * Une traduction en BROUILLON n'est jamais téléchargeable, même par un acheteur
 * du livre (docs/PLAN.md D2 point 4).
 */
async function lireTraduction(
  client: AppSupabaseClient,
  demande: Omit<DemandeCopie, 'userId'>,
): Promise<Traduction | null> {
  const { data } = await client
    .from('book_translations')
    .select('titre, fichier_telechargement, books!inner(auteur)')
    .eq('book_id', demande.bookId)
    .eq('langue', demande.langue)
    .eq('statut', 'publie')
    .maybeSingle();

  if (!data?.fichier_telechargement) return null;

  return {
    titre: data.titre,
    auteur: data.books.auteur,
    // L'ingestion dépose les deux formats sous le même radical.
    cheminSource:
      demande.format === 'epub'
        ? data.fichier_telechargement.replace(/\.pdf$/, '.epub')
        : data.fichier_telechargement,
  };
}

interface DemandeProduction {
  appelant: ContexteAppelant;
  demande: Omit<DemandeCopie, 'userId'>;
  copieId: string;
  chemin: string;
  traduction: Traduction;
  genereLe: Date;
}

/**
 * Produit et dépose la copie filigranée.
 *
 * Rend `false` en cas d'échec, et n'écrit alors RIEN : ni fichier, ni ligne.
 * L'appelant refusera la livraison — il ne servira jamais l'original.
 */
async function produire(
  client: AppSupabaseClient,
  travail: DemandeProduction,
): Promise<boolean> {
  const source = await telechargerSource(client, travail.traduction.cheminSource);
  if (!source) {
    logger.error('Fichier source introuvable', {
      chemin: travail.traduction.cheminSource,
      copieId: travail.copieId,
    });
    return false;
  }

  const meta: MetadonneesCopie = {
    copieId: travail.copieId,
    email: travail.appelant.email,
    titre: travail.traduction.titre,
    auteur: travail.traduction.auteur,
    genereLe: travail.genereLe,
  };

  let filigrane: Buffer;
  try {
    filigrane = await semaphore.tenir(async () =>
      avecDelai(
        async () =>
          travail.demande.format === 'pdf'
            ? await filigranerPdf(source, meta, await police())
            : await filigranerEpub(source, meta, { langue: travail.demande.langue }),
        DELAI_GENERATION_MS,
        `Filigrane non produit dans le délai de ${String(DELAI_GENERATION_MS)} ms.`,
      ),
    );
  } catch (erreur) {
    // ┌────────────────────────────────────────────────────────────────────┐
    // │ ON S'ARRÊTE ICI. Aucun repli sur `source`, qui est pourtant en     │
    // │ mémoire et qu'il suffirait de rendre. C'est précisément la         │
    // │ tentation à laquelle il ne faut pas céder.                         │
    // └────────────────────────────────────────────────────────────────────┘
    logger.error('Filigrane impossible : téléchargement refusé', {
      copieId: travail.copieId,
      format: travail.demande.format,
      detail: erreur instanceof Error ? erreur.message : String(erreur),
    });
    return false;
  }

  const { bucket, objet } = decouper(travail.chemin);
  const depot = await client.storage.from(bucket).upload(objet, filigrane, {
    contentType:
      travail.demande.format === 'pdf' ? 'application/pdf' : 'application/epub+zip',
    upsert: true,
  });

  if (depot.error) {
    logger.error('Dépôt de la copie impossible', {
      copieId: travail.copieId,
      detail: depot.error.message,
    });
    return false;
  }

  const ligne = await client.from('download_copies').insert({
    copie_id: travail.copieId,
    user_id: travail.appelant.userId,
    book_id: travail.demande.bookId,
    langue: travail.demande.langue,
    format: travail.demande.format,
    chemin: travail.chemin,
    octets: filigrane.byteLength,
  });

  if (ligne.error) {
    // Course entre deux demandes simultanées : l'autre a déposé la même copie.
    // Le fichier est identique — la clé est déterministe — donc rien à défaire.
    logger.info('Copie déjà enregistrée par une demande concurrente', {
      copieId: travail.copieId,
    });
  }

  return true;
}

async function telechargerSource(
  client: AppSupabaseClient,
  cheminComplet: string,
): Promise<Buffer | null> {
  const { bucket, objet } = decouper(cheminComplet);
  const { data, error } = await client.storage.from(bucket).download(objet);

  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

function decouper(cheminComplet: string): { bucket: string; objet: string } {
  const separateur = cheminComplet.indexOf('/');
  return {
    bucket: cheminComplet.slice(0, separateur),
    objet: cheminComplet.slice(separateur + 1),
  };
}

/**
 * Efface toutes les copies d'un utilisateur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ APPELÉE À L'ANONYMISATION D'UN COMPTE.                                  │
 * │                                                                          │
 * │ Une copie filigranée porte l'adresse email de son acheteur — dans son    │
 * │ pied de page ET dans ses métadonnées. La conserver après anonymisation   │
 * │ garderait précisément la donnée personnelle que l'effacement vise à      │
 * │ retirer, et dans le format le plus difficile à retrouver : à l'intérieur │
 * │ d'un fichier binaire du stockage.                                       │
 * │                                                                          │
 * │ Les pièces comptables, elles, sont conservées : `download_logs` n'est    │
 * │ pas touché. Il ne porte pas d'adresse, seulement un identifiant qui sera │
 * │ lui-même anonymisé.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function effacerCopiesDe(
  userId: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<number> {
  const client = options.client ?? createServiceClient();

  const { data } = await client
    .from('download_copies')
    .select('copie_id, chemin')
    .eq('user_id', userId);

  const copies = data ?? [];
  if (copies.length === 0) return 0;

  // Les fichiers d'abord : une ligne effacée avant son fichier laisserait un
  // objet que plus rien ne désigne — et qui porterait toujours l'adresse.
  const { error } = await client.storage
    .from('book-downloads')
    .remove(copies.map((c) => decouper(c.chemin).objet));

  if (error) {
    // On ne poursuit PAS : effacer les lignes maintenant rendrait les fichiers
    // introuvables, alors qu'ils portent encore l'adresse à effacer.
    throw new Error(`Copies non effacées : ${error.message}`);
  }

  await client.from('download_copies').delete().eq('user_id', userId);

  logger.info('Copies effacées à l’anonymisation', { userId, nombre: copies.length });
  return copies.length;
}

/**
 * Purge les copies non redemandées depuis la durée de rétention.
 *
 * Les FICHIERS d'abord, les lignes ensuite : une ligne effacée avant son
 * fichier laisserait un objet que plus rien ne désigne, et donc impossible à
 * retrouver autrement qu'en parcourant le bucket.
 */
export async function purgerCopies(
  options: { client?: AppSupabaseClient; clock?: Clock } = {},
): Promise<number> {
  const client = options.client ?? createServiceClient();
  const clock = options.clock ?? getClock();

  const { data, error } = await client.rpc('copies_purgeables', {
    p_at: clock.now().toISOString(),
  } as never);

  if (error) {
    throw new Error(`Purge impossible : ${error.message}`);
  }

  const copies = (data ?? []) as { copie_id: string; chemin: string }[];
  if (copies.length === 0) return 0;

  const parBucket = new Map<string, string[]>();
  for (const copie of copies) {
    const { bucket, objet } = decouper(copie.chemin);
    parBucket.set(bucket, [...(parBucket.get(bucket) ?? []), objet]);
  }

  for (const [bucket, objets] of parBucket) {
    const { error: suppression } = await client.storage.from(bucket).remove(objets);
    if (suppression) {
      logger.warn('Purge incomplète', { bucket, detail: suppression.message });
    }
  }

  await client
    .from('download_copies')
    .delete()
    .in(
      'copie_id',
      copies.map((c) => c.copie_id),
    );

  logger.info('Copies purgées', { nombre: copies.length });
  return copies.length;
}
