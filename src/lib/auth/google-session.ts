import { createAnonClient, createServiceClient } from '@/lib/supabase/clients';
import type { LangueInterface } from '@/i18n';
import { logger } from '@/lib/logger';

import type { SessionFournisseur } from './etablir-session';

/**
 * OUVRIR UNE SESSION SUPABASE À PARTIR D'UNE IDENTITÉ VÉRIFIÉE PAR UN TIERS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CETTE FONCTION EST LA PLUS DANGEREUSE DU DOSSIER. ELLE EST NOMMÉE POUR  │
 * │ QUE PERSONNE NE S'Y TROMPE.                                             │
 * │                                                                          │
 * │ Elle ouvre une session SANS MOT DE PASSE, sur la seule foi d'une adresse │
 * │ email. Appelée avec une adresse venue d'un formulaire, d'un paramètre    │
 * │ d'URL ou d'un corps de requête, elle laisserait n'importe qui se         │
 * │ connecter en tant que n'importe qui.                                     │
 * │                                                                          │
 * │ D'où le refus qui ouvre le corps : `emailVerifie` doit valoir exactement │
 * │ `true`, et il n'a le droit de venir que d'un fournisseur d'identité qui  │
 * │ vient lui-même de confirmer l'adresse dans l'échange en cours. Le refus  │
 * │ est FERMÉ et bruyant — un journal en `error`, pas un `warn` — parce      │
 * │ qu'un appel avec une adresse non vérifiée n'est pas un cas d'usage       │
 * │ dégradé : c'est un défaut de conception, ou une attaque.                 │
 * │                                                                          │
 * │ ELLE N'EST APPELÉE QUE PAR LE CHEMIN BETTER AUTH. Le chemin Supabase     │
 * │ n'en a pas besoin : Supabase Auth rend lui-même une session, et la       │
 * │ meilleure façon de ne pas frapper une session à tort est de ne pas la    │
 * │ frapper du tout.                                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════════════════════════
// CHEMIN SUPABASE — le code d'autorisation s'échange contre une vraie session
// ═══════════════════════════════════════════════════════════════════════════

interface JetonsSupabase {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string };
}

function ressembleAUneSession(valeur: unknown): valeur is JetonsSupabase {
  if (typeof valeur !== 'object' || valeur === null) return false;
  const corps = valeur as Record<string, unknown>;
  const utilisateur = corps['user'];
  return (
    typeof corps['access_token'] === 'string' &&
    typeof corps['refresh_token'] === 'string' &&
    typeof corps['expires_in'] === 'number' &&
    typeof utilisateur === 'object' &&
    utilisateur !== null &&
    typeof (utilisateur as Record<string, unknown>)['id'] === 'string'
  );
}

/**
 * Échange PKCE, par `fetch` et non par le client Supabase.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ MÊME RAISON QUE POUR L'ALLER : LE VÉRIFIEUR N'EST PAS DANS SON MAGASIN. │
 * │                                                                          │
 * │ `exchangeCodeForSession` relit le vérifieur là où `signInWithOAuth`      │
 * │ l'avait rangé — c'est-à-dire, sur le serveur, dans une instance qui      │
 * │ n'existe plus. On appelle donc le point d'échange directement, en lui    │
 * │ fournissant le vérifieur tiré de NOTRE cookie.                          │
 * │                                                                          │
 * │ C'est la même approche que l'adaptateur Notch Pay : parler à l'API avec  │
 * │ `fetch` plutôt que d'ajouter un paquet, et savoir exactement ce qui est  │
 * │ envoyé.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Aucun détail du refus n'est rendu à l'appelant : un code expiré, un code
 * déjà consommé et un vérifieur qui ne correspond pas doivent rester
 * indistinguables pour qui pousse à la porte.
 */
export async function echangerCodePkce(options: {
  supabaseUrl: string;
  anonKey: string;
  code: string;
  verifieur: string;
}): Promise<{ session: SessionFournisseur; userId: string } | null> {
  const point = new URL('/auth/v1/token', options.supabaseUrl);
  point.searchParams.set('grant_type', 'pkce');

  const reponse = await fetch(point, {
    method: 'POST',
    headers: {
      apikey: options.anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ auth_code: options.code, code_verifier: options.verifieur }),
    cache: 'no-store',
  }).catch((erreur: unknown) => {
    logger.error('Échange PKCE injoignable', {
      detail: erreur instanceof Error ? erreur.message : String(erreur),
    });
    return null;
  });

  if (!reponse) return null;

  const corps: unknown = await reponse.json().catch(() => null);

  if (!reponse.ok || !ressembleAUneSession(corps)) {
    logger.warn('Échange PKCE refusé', { statut: reponse.status });
    return null;
  }

  return {
    session: {
      access_token: corps.access_token,
      refresh_token: corps.refresh_token,
      expires_in: corps.expires_in,
    },
    userId: corps.user.id,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHEMIN BETTER AUTH — une identité vérifiée, et une session à frapper
// ═══════════════════════════════════════════════════════════════════════════

export interface IdentiteVerifiee {
  email: string;
  /** Doit valoir `true`. Voir l'encadré : ce n'est pas une option. */
  emailVerifie: boolean;
  nomComplet?: string | undefined;
  langue: LangueInterface;
}

export interface SessionFrappee {
  session: SessionFournisseur;
  userId: string;
  /** Le compte n'existait pas : il vient d'être créé par ce parcours. */
  compteCree: boolean;
}

/** Levée quand l'appelant n'a pas de quoi affirmer l'identité. */
export class IdentiteNonVerifiee extends Error {
  constructor() {
    super('Identité non vérifiée : aucune session ne peut être ouverte.');
    this.name = 'IdentiteNonVerifiee';
  }
}

export async function sessionPourIdentiteVerifiee(
  identite: IdentiteVerifiee,
): Promise<SessionFrappee | null> {
  if (identite.emailVerifie !== true) {
    logger.error('Session refusée : identité non vérifiée par le fournisseur');
    throw new IdentiteNonVerifiee();
  }

  const email = identite.email.trim().toLowerCase();
  if (!email) throw new IdentiteNonVerifiee();

  const service = createServiceClient();

  // `public.users` porte l'adresse, tenue synchronisée par un déclencheur
  // (migration 0004). La lire ici évite de parcourir page à page la liste des
  // comptes d'authentification, qui n'offre pas de recherche par adresse.
  const existant = await service.from('users').select('id').eq('email', email).maybeSingle();
  if (existant.error) {
    logger.error('Lecture du profil impossible', { detail: existant.error.message });
    return null;
  }

  let compteCree = false;

  if (!existant.data) {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ `email_confirm: true` PARCE QUE GOOGLE VIENT DE LE FAIRE.            │
    // │                                                                      │
    // │ Redemander une confirmation par email à quelqu'un qui arrive d'un    │
    // │ fournisseur ayant vérifié l'adresse n'ajoute aucune garantie : elle  │
    // │ est déjà prouvée. Cela n'ajouterait qu'un cul-de-sac, puisque cet    │
    // │ utilisateur n'a pas de mot de passe pour revenir.                    │
    // │                                                                      │
    // │ Le rôle n'est PAS posé ici, et ne le sera jamais : il vaut `user`    │
    // │ par défaut en base. Le déduire d'une métadonnée de fournisseur       │
    // │ serait un vecteur d'élévation de privilège.                          │
    // └──────────────────────────────────────────────────────────────────────┘
    const cree = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        ...(identite.nomComplet ? { nom_complet: identite.nomComplet } : {}),
        langue_preferee: identite.langue,
      },
    });

    if (cree.error || !cree.data.user) {
      logger.error('Création du compte depuis le fournisseur impossible', {
        detail: cree.error?.message,
      });
      return null;
    }
    compteCree = true;
  }

  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ LE CODE EST ENGENDRÉ, PAS ENVOYÉ.                                      │
   * │                                                                        │
   * │ `generateLink` RÉPOND le code à usage unique au lieu de l'expédier :   │
   * │ aucun email ne part, et l'utilisateur n'a rien à faire. C'est le seul  │
   * │ moyen offert par Supabase d'obtenir une session sans mot de passe, et  │
   * │ il a le mérite de passer par le chemin RÉEL de vérification — même     │
   * │ rotation de jetons, même durée, même révocation.                       │
   * │                                                                        │
   * │ Le code ne transite jamais hors de ce processus. S'il fuitait, il      │
   * │ vaudrait une session : c'est pourquoi il n'est ni journalisé, ni rendu │
   * │ à l'appelant.                                                          │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  const lien = await service.auth.admin.generateLink({ type: 'magiclink', email });
  const code = lien.data.properties?.email_otp;

  if (lien.error || !code) {
    logger.error('Code de session non engendré', { detail: lien.error?.message });
    return null;
  }

  const echange = await createAnonClient().auth.verifyOtp({
    email,
    token: code,
    type: 'magiclink',
  });

  if (echange.error || !echange.data.session || !echange.data.user) {
    logger.error('Échange du code de session refusé', { detail: echange.error?.message });
    return null;
  }

  return {
    session: {
      access_token: echange.data.session.access_token,
      refresh_token: echange.data.session.refresh_token,
      expires_in: echange.data.session.expires_in,
    },
    userId: echange.data.user.id,
    compteCree,
  };
}
