import { createServiceClient, type AppSupabaseClient } from '@/lib/supabase/clients';
import { rendre } from '@/domain/emails/templates';
import { getServerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { FileMailer } from '@/adapters/mail/file-mailer';
import type { Mailer } from '@/adapters/mail/types';

/**
 * Vidage de la file d'emails — §9.2.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CE MODULE S'EXÉCUTE APRÈS LE COMMIT, ET NE PEUT RIEN ANNULER.           │
 * │                                                                          │
 * │ La demande d'email a été écrite dans la transaction métier par           │
 * │ `programmer_email` : elle est atomique avec l'octroi des droits. Ici, on │
 * │ ne fait que LIRE cette file et envoyer. Aucun chemin de ce fichier ne    │
 * │ touche à `orders`, `entitlements` ou `subscriptions`.                    │
 * │                                                                          │
 * │ Conséquence : un serveur de messagerie en panne laisse des lignes en     │
 * │ attente, et rien d'autre. La commande reste payée, les droits restent    │
 * │ octroyés, et l'email partira au prochain vidage.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Réservé aux tests : permet d'injecter un mailer qui échoue. */
export interface OptionsVidage {
  client?: AppSupabaseClient;
  mailer?: Mailer;
  limite?: number;
}

export interface RapportVidage {
  envoyes: number;
  echoues: number;
}

interface LigneFile {
  id: string;
  modele: string;
  destinataire: string;
  langue: string;
  variables: Record<string, string> | null;
  user_id: string | null;
}

/**
 * Envoie les emails en attente.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NE LÈVE JAMAIS. C'EST LA PROPRIÉTÉ CENTRALE DE CETTE FONCTION.          │
 * │                                                                          │
 * │ Elle est appelée depuis le gestionnaire de webhooks, APRÈS que celui-ci  │
 * │ a répondu sur le fond. Si elle levait, elle transformerait un webhook    │
 * │ traité avec succès en échec — et le prestataire rejouerait un événement  │
 * │ déjà appliqué.                                                          │
 * │                                                                          │
 * │ Chaque email est donc isolé : l'échec de l'un n'empêche pas les autres,  │
 * │ et l'échec de tous ne remonte pas à l'appelant.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function viderFile(options: OptionsVidage = {}): Promise<RapportVidage> {
  const client = options.client ?? createServiceClient();
  const mailer = options.mailer ?? new FileMailer();
  const rapport: RapportVidage = { envoyes: 0, echoues: 0 };

  const attente = await client.rpc('emails_a_envoyer', {
    p_limite: options.limite ?? 50,
  } as never);

  if (attente.error) {
    logger.warn('File d’emails illisible', { detail: attente.error.message });
    return rapport;
  }

  const lignes = (attente.data ?? []) as LigneFile[];

  for (const ligne of lignes) {
    try {
      const rendu = rendre(
        ligne.modele,
        ligne.langue,
        ligne.variables ?? {},
        getServerEnv().NEXT_PUBLIC_APP_URL,
      );

      await mailer.envoyer({
        destinataire: ligne.destinataire,
        sujet: rendu.sujet,
        texte: rendu.texte,
        langue: ligne.langue === 'en' ? 'en' : 'fr',
        modele: ligne.modele,
      });

      await client.rpc('marquer_email', {
        p_id: ligne.id,
        p_envoye: true,
        p_erreur: null,
      } as never);
      rapport.envoyes += 1;
    } catch (erreur) {
      // TRACÉ, jamais propagé. La ligne reste consultable avec son erreur, et
      // le fait métier qui l'a produite n'est pas remis en cause.
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      logger.warn('Email non envoyé', { modele: ligne.modele, detail });

      await client.rpc('marquer_email', {
        p_id: ligne.id,
        p_envoye: false,
        p_erreur: detail.slice(0, 500),
      } as never);
      rapport.echoues += 1;
    }
  }

  return rapport;
}

/**
 * Vide la file SANS jamais faire attendre l'appelant ni le faire échouer.
 *
 * Le webhook a déjà répondu sur le fond ; l'envoi est un effet de bord. Cette
 * enveloppe existe pour que l'oubli d'un `catch` chez un appelant futur ne
 * puisse pas transformer un email perdu en webhook rejoué.
 */
export function viderFileEnArrierePlan(options: OptionsVidage = {}): void {
  void viderFile(options).catch((erreur: unknown) => {
    logger.warn('Vidage de la file d’emails interrompu', {
      detail: erreur instanceof Error ? erreur.message : String(erreur),
    });
  });
}
