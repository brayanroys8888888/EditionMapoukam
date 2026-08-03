import { createHash } from 'node:crypto';

import { createAnonClient, createServiceClient } from '@/lib/supabase/clients';
import type { AppSupabaseClient } from '@/lib/supabase/clients';
import { logger } from '@/lib/logger';

/**
 * Rotation des jetons de rafraîchissement, et détection de leur réutilisation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE EXISTE PARCE QUE LE BACKEND LIVRÉ NE POUVAIT PAS TENIR UNE    │
 * │ SESSION AU-DELÀ D'UNE HEURE.                                            │
 * │                                                                          │
 * │ La connexion rendait un jeton de rafraîchissement et posait un cookie    │
 * │ valable trente jours, que RIEN n'échangeait. Le jeton d'accès expirant   │
 * │ en une heure, toute session plus longue retombait en 401 — en pleine     │
 * │ lecture, ou entre le panier et le paiement.                             │
 * │                                                                          │
 * │ Mille tests l'ont manqué pour une raison précise, consignée en           │
 * │ docs/PLAN.md §5 duodecies : la validité d'un jeton est appliquée par     │
 * │ GoTrue en HEURE RÉELLE, et l'horloge métier injectable ne la déplace     │
 * │ donc pas. Avancer le temps de trente jours n'expirait aucun jeton, et    │
 * │ aucun test ne POUVAIT simuler une session longue.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Tolérance de course, en secondes.
 *
 * Alignée sur `refresh_token_reuse_interval` de `supabase/config.toml` : en
 * deçà, GoTrue rend le MÊME successeur aux deux appels concurrents. Choisir une
 * valeur plus courte que la sienne ferait tuer des familles saines sur une
 * course que le fournisseur, lui, absorbe sans broncher.
 */
export const TOLERANCE_COURSE_SECONDES = 10;

export interface SessionRafraichie {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}

export type RefusRafraichissement =
  /** Jamais émis par nous, ou purgé depuis. */
  | 'inconnu'
  /** Famille close normalement : déconnexion volontaire, ou compte fermé. */
  | 'revoque'
  /**
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA FAMILLE A ÉTÉ TUÉE PAR UN VOL — ET L'APPELANT EST LA VICTIME.    │
   * │                                                                      │
   * │ À distinguer de `reutilisation`, qui désigne celui qui a DÉCLENCHÉ   │
   * │ la détection : dans le seul scénario qui compte, c'est le voleur.    │
   * │ Le titulaire légitime arrive APRÈS, sur une lignée déjà morte.       │
   * │                                                                      │
   * │ Sans ce motif distinct, il recevait « session expirée » et se        │
   * │ reconnectait sans jamais savoir qu'il avait été compromis. La        │
   * │ détection était juste, et pratiquement inutile.                      │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  | 'revoque_pour_vol'
  /** Deux onglets se sont rafraîchis en même temps. Refus sans sanction. */
  | 'course'
  /** Jeton rejoué hors tolérance : la famille vient d'être tuée à l'instant. */
  | 'reutilisation'
  /** GoTrue a refusé — jeton réellement expiré de son côté. */
  | 'refus_fournisseur';

export type ResultatRafraichissement =
  | { ok: true; session: SessionRafraichie }
  | { ok: false; raison: RefusRafraichissement };

/**
 * Empreinte d'un jeton.
 *
 * SHA-256 sans sel : le jeton est déjà une valeur aléatoire de haute entropie,
 * il n'y a rien à deviner. Un sel par ligne interdirait la recherche par
 * empreinte, qui est toute la fonction de la table.
 */
export function empreinte(jeton: string): string {
  return createHash('sha256').update(jeton, 'utf8').digest('hex');
}

/** Ouvre une lignée de jetons. Appelée à la connexion, et là seulement. */
export async function ouvrirFamille(
  userId: string,
  refreshToken: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<void> {
  const client = options.client ?? createServiceClient();
  const { error } = await client.rpc('ouvrir_famille_jetons', {
    p_user_id: userId,
    p_hash: empreinte(refreshToken),
  });

  if (error) {
    // Ne jamais faire échouer une connexion par ailleurs valide : l'utilisateur
    // repartirait sans session alors que son mot de passe était bon. La lignée
    // manquante se traduira par un refus au premier rafraîchissement, ce qui
    // est le bon échec — fermé, et explicable.
    logger.error('Ouverture de famille de jetons impossible', { userId, detail: error.message });
  }
}

/** Révoque les lignées d'un compte. Appelée à la déconnexion. */
export async function revoquerFamilles(
  userId: string,
  motif: 'deconnexion' | 'compte' | 'reutilisation',
  options: { client?: AppSupabaseClient } = {},
): Promise<void> {
  const client = options.client ?? createServiceClient();
  const { error } = await client.rpc('revoquer_familles_jetons', {
    p_user_id: userId,
    p_motif: motif,
  });

  if (error) {
    logger.error('Révocation de famille impossible', { userId, motif, detail: error.message });
  }
}

interface Diagnostic {
  etat: string;
  user_id: string | null;
  famille: string | null;
  /** `reutilisation`, `deconnexion` ou `compte` — renseigné si révoquée. */
  motif: string | null;
}

/**
 * Échange un jeton de rafraîchissement contre une session neuve.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ L'ORDRE DES QUATRE ÉTAPES EST LA SÉCURITÉ DE CETTE FONCTION.            │
 * │                                                                          │
 * │ 1. DIAGNOSTIQUER d'abord — et c'est là, et seulement là, qu'une          │
 * │    réutilisation tue la famille. Avant tout appel au fournisseur : un    │
 * │    jeton volé ne doit pas même déclencher un aller-retour réseau.        │
 * │ 2. ÉCHANGER chez GoTrue, qui reste l'autorité sur la validité réelle.    │
 * │ 3. PIVOTER en base seulement APRÈS un échange réussi. Marquer le jeton   │
 * │    consommé avant de savoir si le fournisseur l'accepte transformerait   │
 * │    une panne réseau passagère en déconnexions en série.                  │
 * │ 4. VÉRIFIER que le successeur est bien enregistré. Un jeton que nous ne  │
 * │    connaissons pas serait refusé au tour suivant, et l'utilisateur       │
 * │    déconnecté sans raison lisible.                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function rafraichir(
  refreshToken: string,
  options: { client?: AppSupabaseClient } = {},
): Promise<ResultatRafraichissement> {
  const client = options.client ?? createServiceClient();
  const hash = empreinte(refreshToken);

  // ── 1. Diagnostic ────────────────────────────────────────────────────────
  const diagnostic = await client.rpc('diagnostiquer_jeton_rafraichissement', {
    p_hash: hash,
    p_tolerance_secondes: TOLERANCE_COURSE_SECONDES,
  });

  if (diagnostic.error) {
    logger.error('Diagnostic de jeton impossible', { detail: diagnostic.error.message });
    return { ok: false, raison: 'inconnu' };
  }

  const ligne = (diagnostic.data as unknown as Diagnostic[])[0];
  if (!ligne) return { ok: false, raison: 'inconnu' };

  if (ligne.etat === 'reutilisation') {
    // La fonction SQL a déjà tué la lignée. Il reste à couper les sessions
    // chez le fournisseur : sans cela, le jeton d'ACCÈS déjà émis resterait
    // valable jusqu'à sa propre expiration, et le voleur garderait une heure.
    if (ligne.user_id) {
      await createServiceClient().auth.admin.signOut(ligne.user_id, 'global').catch(() => undefined);
      logger.warn('Jeton de rafraîchissement rejoué — famille révoquée', {
        userId: ligne.user_id,
        famille: ligne.famille,
      });
    }
    return { ok: false, raison: 'reutilisation' };
  }

  if (ligne.etat === 'revoque') {
    // C'est ICI que la victime d'un vol est reconnue : sa lignée a été tuée
    // par la réutilisation de quelqu'un d'autre, et elle arrive après coup.
    return {
      ok: false,
      raison: ligne.motif === 'reutilisation' ? 'revoque_pour_vol' : 'revoque',
    };
  }

  if (ligne.etat !== 'valide') {
    return { ok: false, raison: ligne.etat as RefusRafraichissement };
  }

  // ── 2. Échange chez le fournisseur ───────────────────────────────────────
  const { data, error } = await createAnonClient().auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session || !data.user) {
    logger.info('Rafraîchissement refusé par le fournisseur', { detail: error?.message });
    return { ok: false, raison: 'refus_fournisseur' };
  }

  const session = data.session;
  const nouveauHash = empreinte(session.refresh_token);

  // ── 3. Rotation en base ──────────────────────────────────────────────────
  const pivot = await client.rpc('pivoter_jeton_rafraichissement', {
    p_hash: hash,
    p_nouveau_hash: nouveauHash,
  });

  if (pivot.error) {
    logger.error('Rotation de jeton impossible', { detail: pivot.error.message });
    return { ok: false, raison: 'inconnu' };
  }

  // ── 4. Le successeur est-il connu ? ──────────────────────────────────────
  if (pivot.data !== true) {
    // Un autre appel a gagné la course. Si GoTrue nous a rendu LE MÊME
    // successeur — ce qu'il fait à l'intérieur de sa fenêtre de tolérance —
    // le gagnant l'a déjà enregistré et notre session est parfaitement valide.
    const connu = await client
      .from('refresh_token_families')
      .select('id')
      .eq('jeton_hash', nouveauHash)
      .is('revoque_le', null)
      .maybeSingle();

    if (!connu.data) {
      // Successeur inconnu : nous détenons un jeton que nous refuserions au
      // tour suivant. Mieux vaut refuser maintenant, avec un message clair.
      logger.warn('Successeur de jeton non enregistré — rafraîchissement abandonné');
      return { ok: false, raison: 'course' };
    }
  }

  return {
    ok: true,
    session: {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      userId: data.user.id,
    },
  };
}
