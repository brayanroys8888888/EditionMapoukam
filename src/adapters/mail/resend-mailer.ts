import { Resend } from 'resend';
import { getServerEnv } from '@/lib/config/env';
import type { Mailer, MessageMail, ResultatEnvoi } from './types';

/**
 * L'expéditeur, sur le domaine VÉRIFIÉ chez Resend.
 *
 * Il n'y a plus de repli sur `onboarding@resend.dev` : cette adresse de
 * démonstration ne livre qu'au propriétaire du compte Resend. Un email parti
 * d'elle « réussit » côté serveur et n'arrive jamais chez le client — la
 * panne la plus difficile à voir. Une variable absente échoue donc
 * franchement, et l'erreur est inscrite dans la file d'emails.
 */
function expediteur(): string {
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    throw new Error(
      'RESEND_FROM_EMAIL manque : attendu une adresse du domaine vérifié chez Resend, ' +
        'par exemple « Édition Mapoukam <noreply@edition-mapoukam.royceproject.site> ».',
    );
  }
  return from;
}

export class ResendMailer implements Mailer {
  readonly nom = 'resend';
  private resend: Resend;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.RESEND_API_KEY;
    this.resend = new Resend(key);
  }

  async envoyer(message: MessageMail): Promise<ResultatEnvoi> {
    const from = expediteur();

    // Si un HTML est fourni, on l'utilise. Sinon, on enveloppe le texte dans le design global.
    const contenuHtml = message.html || this.envelopperDansDesign(message.texte);

    const response = await this.resend.emails.send({
      from,
      to: message.destinataire,
      subject: message.sujet,
      text: message.texte,
      html: contenuHtml,
    });

    if (response.error) {
      throw new Error(`Erreur d'envoi Resend: ${response.error.message}`);
    }

    return {
      id: response.data?.id || `resend_${Date.now()}`,
      envoyeLe: new Date(),
    };
  }

  /**
   * Enveloppe un texte brut dans le design email d'Édition Mapoukam.
   */
  private envelopperDansDesign(texteBrut: string): string {
    // L'adresse du site vient du déploiement, jamais d'une constante : l'ancienne,
    // écrite ici en dur, désignait un déploiement mis en pause depuis.
    const site = getServerEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');

    // Convertir les sauts de ligne en balises <br/>, et détecter les liens pour les styliser
    const texteFormate = texteBrut
      .replace(/</g, '&lt;').replace(/>/g, '&gt;') // Éviter l'injection
      .split('\n')
      .map(ligne => {
        // Formater les liens qui commencent par http ou /
        if (ligne.trim().startsWith('http') || ligne.trim().startsWith('/')) {
          const url = ligne.trim().startsWith('/') ? `${site}${ligne.trim()}` : ligne.trim();
          return `<div style="text-align:center;margin:32px 0;"><a href="${url}" style="display:inline-block;background-color:#16371f;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 32px;border-radius:50px;">Accéder à mon espace</a></div>`;
        }
        return ligne ? `<p style="margin:0 0 16px;font-size:16px;color:#1c2b1e;line-height:1.6;">${ligne}</p>` : '';
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4ede0;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4ede0;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(22,55,31,0.10);">
          <tr>
            <td style="background-color:#16371f;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:16px;letter-spacing:3px;text-transform:uppercase;color:#a8c5a0;font-weight:600;">Édition Mapoukam</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${texteFormate}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f4ee;padding:20px 40px;text-align:center;border-top:1px solid #e8ddd0;">
              <p style="margin:0;font-size:12px;color:#a0b0a2;">Des contes africains pour les enfants du monde entier.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}

/**
 * Fonction d'envoi direct de code de vérification via Resend.
 */
export async function envoyerCodeVerificationResend(email: string, code: string) {
  const key = process.env.RESEND_API_KEY;
  const resend = new Resend(key);
  const from = expediteur();
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

