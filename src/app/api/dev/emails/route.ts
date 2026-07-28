import { garderConsole } from '@/lib/dev/guard';
import { ok } from '@/lib/http/responses';
import { getMailer } from '@/adapters/registry';
import { FileMailer } from '@/adapters/mail/file-mailer';

/**
 * Emails écrits par l'adaptateur local.
 *
 * À ne pas confondre avec l'interface de capture de Supabase (port 54324), qui
 * reçoit les emails d'AUTHENTIFICATION. Celle-ci liste les emails
 * TRANSACTIONNELS de l'application, écrits dans `.mails/`.
 */
function extraireEntete(contenu: string, nom: string): string {
  const ligne = contenu
    .split(/\r?\n/)
    .find((l) => l.toLowerCase().startsWith(`${nom.toLowerCase()}:`));
  if (!ligne) return '';

  const valeur = ligne.slice(nom.length + 1).trim();
  // Les en-têtes accentués sont encodés en base64 (RFC 2047) : les décoder ici
  // évite d'afficher « =?UTF-8?B?… » dans la console.
  const encode = /^=\?UTF-8\?B\?(.+)\?=$/i.exec(valeur);
  return encode?.[1] ? Buffer.from(encode[1], 'base64').toString('utf8') : valeur;
}

export function GET(): Response {
  const refus = garderConsole();
  if (refus) return refus;

  const mailer = getMailer();
  if (!(mailer instanceof FileMailer)) {
    return ok({ dossier: null, emails: [] });
  }

  const emails = mailer.lister().map(({ fichier, contenu }) => ({
    fichier,
    destinataire: extraireEntete(contenu, 'To'),
    sujet: extraireEntete(contenu, 'Subject'),
    date: extraireEntete(contenu, 'Date'),
    modele: extraireEntete(contenu, 'X-Modele'),
    contenu,
  }));

  return ok({ dossier: mailer.dossier, emails });
}
