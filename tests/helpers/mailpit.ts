/**
 * Lecture des emails capturés par Supabase local (Mailpit, port 54324).
 *
 * CLAUDE.md : les emails d'authentification arrivent dans l'interface de
 * capture de Supabase, distincte de `.mails/` où `FileMailer` écrira les
 * emails transactionnels de l'application (étape 15). Les deux ne doivent pas
 * être confondus.
 *
 * Vérifier qu'un email de vérification part réellement fait partie du contrat
 * de l'étape 2 : sans cela, on testerait une inscription dont personne ne peut
 * confirmer l'adresse.
 */
const BASE = process.env['SUPABASE_MAIL_URL'] ?? 'http://127.0.0.1:54324';

interface MailpitAdresse {
  Address: string;
}

interface MailpitResume {
  ID: string;
  To: MailpitAdresse[];
  Subject: string;
  Created: string;
}

interface MailpitListe {
  messages: MailpitResume[];
}

export interface EmailCapture {
  id: string;
  destinataires: string[];
  sujet: string;
  corps: string;
}

/** Vide la boîte de capture. À appeler avant un scénario qui compte les emails. */
export async function viderBoite(): Promise<void> {
  const reponse = await fetch(`${BASE}/api/v1/messages`, { method: 'DELETE' });
  if (!reponse.ok) {
    throw new Error(`Mailpit injoignable (${String(reponse.status)}). La pile Supabase est-elle démarrée ?`);
  }
}

async function listerResumes(): Promise<MailpitResume[]> {
  const reponse = await fetch(`${BASE}/api/v1/messages?limit=50`);
  if (!reponse.ok) {
    throw new Error(`Mailpit injoignable (${String(reponse.status)}).`);
  }
  const liste = (await reponse.json()) as MailpitListe;
  return liste.messages;
}

async function lireCorps(id: string): Promise<string> {
  const reponse = await fetch(`${BASE}/api/v1/message/${id}`);
  if (!reponse.ok) return '';
  const message = (await reponse.json()) as { Text?: string; HTML?: string };
  return message.Text ?? message.HTML ?? '';
}

/**
 * Attend qu'un email destiné à `email` arrive, puis le renvoie.
 *
 * L'envoi est asynchrone côté Supabase Auth : interroger une seule fois
 * produirait un test instable. On sonde, avec une limite franche.
 */
export async function attendreEmail(
  email: string,
  options: { timeoutMs?: number } = {},
): Promise<EmailCapture> {
  const limite = Date.now() + (options.timeoutMs ?? 10_000);

  for (;;) {
    const resumes = await listerResumes();
    const trouve = resumes.find((m) =>
      m.To.some((d) => d.Address.toLowerCase() === email.toLowerCase()),
    );
    if (trouve) {
      return {
        id: trouve.ID,
        destinataires: trouve.To.map((d) => d.Address),
        sujet: trouve.Subject,
        corps: await lireCorps(trouve.ID),
      };
    }
    if (Date.now() > limite) {
      throw new Error(`Aucun email pour ${email} après ${String(options.timeoutMs ?? 10_000)} ms.`);
    }
    await new Promise((resoudre) => setTimeout(resoudre, 250));
  }
}

/** Nombre d'emails actuellement destinés à cette adresse. */
export async function compterEmails(email: string): Promise<number> {
  const resumes = await listerResumes();
  return resumes.filter((m) => m.To.some((d) => d.Address.toLowerCase() === email.toLowerCase()))
    .length;
}
