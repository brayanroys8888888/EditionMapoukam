import { Resend } from 'resend';
import type { Mailer, MessageMail, ResultatEnvoi } from './types';

export class ResendMailer implements Mailer {
  readonly nom = 'resend';
  private resend: Resend;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.RESEND_API_KEY;
    this.resend = new Resend(key);
  }

  async envoyer(message: MessageMail): Promise<ResultatEnvoi> {
    const from = process.env.RESEND_FROM_EMAIL || 'Édition Mapoukam <onboarding@resend.dev>';
    const response = await this.resend.emails.send({
      from,
      to: message.destinataire,
      subject: message.sujet,
      text: message.texte,
      html: message.html || `<p>${message.texte}</p>`,
    });

    if (response.error) {
      throw new Error(`Erreur d'envoi Resend: ${response.error.message}`);
    }

    return {
      id: response.data?.id || `resend_${Date.now()}`,
      envoyeLe: new Date(),
    };
  }
}

/**
 * Fonction d'envoi direct de code de vérification via Resend.
 */
export async function envoyerCodeVerificationResend(email: string, code: string) {
  const key = process.env.RESEND_API_KEY;
  const resend = new Resend(key);
  const from = process.env.RESEND_FROM_EMAIL || 'Édition Mapoukam <onboarding@resend.dev>';
  return resend.emails.send({
    from,
    to: email,
    subject: 'Votre code de vérification - Édition Mapoukam',
    html: `
      <div style="font-family: sans-serif; padding: 24px; background-color: #fbf7ef; border-radius: 12px; max-width: 500px; margin: 0 auto; color: #1c2b1e;">
        <h2 style="color: #16371f; margin-top: 0;">Édition Mapoukam</h2>
        <p style="font-size: 16px; line-height: 1.5;">Voici votre code de vérification par email :</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #16371f; background: #ffffff; padding: 16px; border-radius: 8px; text-align: center; border: 2px solid #e2dcd2; margin: 24px 0;">
          ${code}
        </div>
        <p style="font-size: 14px; color: #555;">Entrez ce code sur le site pour valider votre inscription ou réinitialiser votre mot de passe.</p>
      </div>
    `,
  });
}

