import { createServiceClient } from '@/lib/supabase/clients';
import { errors } from '@/lib/http/responses';
import { cookiesDeSession } from '@/lib/auth/cookies';
import { ouvrirFamille } from '@/lib/auth/refresh';
import type { ReponseSession } from '@/domain/api/contract';

/**
 * Ouverture d'une session applicative, à partir d'une session Supabase.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DEUX CHEMINS MÈNENT À UNE SESSION, ET ILS NE DOIVENT PAS DIVERGER.      │
 * │                                                                          │
 * │ Le mot de passe (`/api/auth/login`) et le code à usage unique reçu par   │
 * │ email (`/api/auth/otp`) aboutissent au même endroit : un profil relu en  │
 * │ base, un compte dont le statut est vérifié, une lignée de jetons         │
 * │ ouverte, et deux cookies posés.                                          │
 * │                                                                          │
 * │ Écrire cette suite deux fois, c'est accepter qu'un jour l'une des deux   │
 * │ oublie le contrôle de statut — et qu'un compte suspendu reparte avec une │
 * │ session valide en passant par « mot de passe oublié ». C'est exactement  │
 * │ la classe de défaut que docs/PLAN.md §5 quinquies recense trois fois.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export interface SessionFournisseur {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export type Etablissement =
  | { ok: true; charge: Required<ReponseSession>; cookies: string[] }
  | { ok: false; response: Response };

/**
 * @param refusGenerique Réponse rendue quand le compte n'est pas exploitable
 *   sans que la raison puisse être dite. Elle appartient à l'appelant : le
 *   mot de passe répond « identifiants invalides », le code « code invalide »,
 *   et chacun doit rester indistinguable de son propre cas d'échec courant.
 */
export async function etablirSession(
  session: SessionFournisseur,
  userId: string,
  options: { refusGenerique: () => Response },
): Promise<Etablissement> {
  const profil = await createServiceClient()
    .from('users')
    .select('id, email, role, langue_preferee, statut')
    .eq('id', userId)
    .maybeSingle();

  if (profil.error || !profil.data) {
    return { ok: false, response: errors.interne(profil.error?.message ?? 'profil métier absent') };
  }

  if (profil.data.statut !== 'actif') {
    // Session immédiatement révoquée : un compte suspendu ou anonymisé ne doit
    // pas repartir avec un jeton valide en poche.
    await createServiceClient().auth.admin.signOut(session.access_token, 'global');
    return {
      ok: false,
      response:
        profil.data.statut === 'suspendu' ? errors.compteSuspendu() : options.refusGenerique(),
    };
  }

  // Ouvre la lignée de jetons de cette session. Sans elle, le premier
  // rafraîchissement serait refusé — échec fermé, et volontairement : mieux
  // vaut une reconnexion qu'une session que nous ne savons pas suivre.
  await ouvrirFamille(profil.data.id, session.refresh_token);

  return {
    ok: true,
    charge: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      utilisateur: {
        id: profil.data.id,
        email: profil.data.email,
        role: profil.data.role,
        langue_preferee: profil.data.langue_preferee,
      },
    },
    cookies: cookiesDeSession(session),
  };
}
