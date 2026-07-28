import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signature des webhooks.
 *
 * CLAUDE.md règle 5 : les webhooks sont la seule source de vérité sur l'état
 * d'un paiement, signature vérifiée systématiquement. Cette règle s'applique
 * AUSSI au faux prestataire — c'est tout l'intérêt du montage : seul l'émetteur
 * est simulé, le récepteur est réel, et la vérification de signature est donc
 * développée et éprouvée pour de bon.
 *
 * Le schéma est délibérément calqué sur les conventions du marché, pour qu'un
 * prestataire réel se substitue sans toucher au gestionnaire :
 *
 *     x-webhook-signature: t=<horodatage>,v1=<hmac hexadécimal>
 *     hmac = HMAC-SHA256(secret, "<horodatage>.<corps brut>")
 *
 * Deux points souvent manqués, et tous deux testés ici :
 *  - le corps est signé BRUT, avant tout parsing : re-sérialiser un JSON change
 *    les octets et invalide la signature ;
 *  - l'horodatage est vérifié, sinon une signature valide interceptée resterait
 *    rejouable indéfiniment.
 */
export const SIGNATURE_HEADER = 'x-webhook-signature';

/** Tolérance sur l'horodatage, en secondes. */
export const TOLERANCE_SECONDES = 300;

export type EchecSignature =
  | 'entete_absent'
  | 'entete_malforme'
  | 'horodatage_invalide'
  | 'horodatage_hors_tolerance'
  | 'signature_invalide';

export type ResultatVerification =
  | { valide: true }
  | { valide: false; raison: EchecSignature };

function calculer(secret: string, horodatage: number, corpsBrut: string): string {
  return createHmac('sha256', secret).update(`${String(horodatage)}.${corpsBrut}`).digest('hex');
}

/** Construit l'en-tête de signature d'un corps. */
export function signerCharge(
  corpsBrut: string,
  secret: string,
  instant: Date,
): string {
  const horodatage = Math.floor(instant.getTime() / 1000);
  return `t=${String(horodatage)},v1=${calculer(secret, horodatage, corpsBrut)}`;
}

/**
 * Vérifie l'en-tête de signature d'un corps brut.
 *
 * Renvoie un motif d'échec plutôt qu'un booléen : le motif part dans le
 * journal, jamais dans la réponse — un attaquant qui apprendrait que sa
 * signature est bonne mais son horodatage périmé saurait quoi corriger.
 */
export function verifierSignature(
  corpsBrut: string,
  entete: string | null,
  secret: string,
  instant: Date,
  toleranceSecondes: number = TOLERANCE_SECONDES,
): ResultatVerification {
  if (!entete) return { valide: false, raison: 'entete_absent' };

  let horodatageBrut: string | undefined;
  let signatureFournie: string | undefined;

  for (const morceau of entete.split(',')) {
    const separateur = morceau.indexOf('=');
    if (separateur === -1) continue;
    const cle = morceau.slice(0, separateur).trim();
    const valeur = morceau.slice(separateur + 1).trim();
    if (cle === 't') horodatageBrut = valeur;
    if (cle === 'v1') signatureFournie = valeur;
  }

  if (!horodatageBrut || !signatureFournie) {
    return { valide: false, raison: 'entete_malforme' };
  }

  const horodatage = Number(horodatageBrut);
  if (!Number.isInteger(horodatage) || horodatage <= 0) {
    return { valide: false, raison: 'horodatage_invalide' };
  }

  const ecart = Math.abs(Math.floor(instant.getTime() / 1000) - horodatage);
  if (ecart > toleranceSecondes) {
    return { valide: false, raison: 'horodatage_hors_tolerance' };
  }

  const attendue = calculer(secret, horodatage, corpsBrut);

  // Comparaison à temps constant. Une comparaison de chaînes ordinaire s'arrête
  // au premier octet différent : le temps de réponse révélerait alors, octet par
  // octet, la signature attendue.
  const a = Buffer.from(attendue, 'hex');
  const b = Buffer.from(signatureFournie, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valide: false, raison: 'signature_invalide' };
  }

  return { valide: true };
}
