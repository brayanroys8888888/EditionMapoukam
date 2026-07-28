import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { Clock } from '@/lib/clock/clock';
import { getClock } from '@/lib/clock';
import { getServerEnv } from '@/lib/config/env';
import type { Mailer, MessageMail, ResultatEnvoi } from './types';

/**
 * Adaptateur d'emails écrivant sur disque.
 *
 * Chaque message devient un fichier `.eml` au format RFC 5322, lisible par
 * n'importe quel client de messagerie. Écrire un JSON maison aurait été plus
 * simple, mais on ne verrait pas ce que le destinataire verra — or le rendu
 * fait partie de ce qu'il faut relire.
 *
 * À ne pas confondre avec l'interface de capture de Supabase (Mailpit, port
 * 54324), qui reçoit les emails d'AUTHENTIFICATION. Celle-ci reçoit les emails
 * TRANSACTIONNELS de l'application.
 */
export class FileMailer implements Mailer {
  readonly nom = 'file';

  readonly #dossier: string;
  readonly #clock: Clock;

  constructor(options: { dossier?: string; clock?: Clock } = {}) {
    // Le commentaire d'exclusion est nécessaire : le traceur de fichiers de
    // Next voit un chemin construit dynamiquement et, faute de pouvoir le
    // résoudre, embarquerait tout le projet dans le bundle. Le dossier est
    // choisi par la configuration, jamais par une entrée utilisateur.
    this.#dossier =
      options.dossier ?? join(/* turbopackIgnore: true */ process.cwd(), getServerEnv().MAIL_OUTPUT_DIR);
    this.#clock = options.clock ?? getClock();
  }

  get dossier(): string {
    return this.#dossier;
  }

  envoyer(message: MessageMail): Promise<ResultatEnvoi> {
    const envoyeLe = this.#clock.now();
    const id = randomUUID();
    const nomFichier = `${horodatageFichier(envoyeLe)}-${assainir(message.modele)}-${id.slice(0, 8)}.eml`;
    const chemin = join(this.#dossier, nomFichier);

    mkdirSync(this.#dossier, { recursive: true });
    writeFileSync(chemin, composer(message, id, envoyeLe), 'utf8');

    return Promise.resolve({ id, chemin, envoyeLe });
  }

  /** Messages présents dans le dossier, du plus récent au plus ancien. */
  lister(): { fichier: string; contenu: string }[] {
    try {
      return readdirSync(this.#dossier)
        .filter((nom) => nom.endsWith('.eml'))
        .sort()
        .reverse()
        .map((fichier) => ({
          fichier,
          contenu: readFileSync(join(this.#dossier, fichier), 'utf8'),
        }));
    } catch {
      // Dossier absent : aucun message n'a encore été écrit.
      return [];
    }
  }
}

function horodatageFichier(instant: Date): string {
  return instant.toISOString().replace(/[:.]/g, '-');
}

function assainir(valeur: string): string {
  return valeur.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'message';
}

/**
 * Encodage d'un en-tête pouvant contenir des accents (RFC 2047).
 *
 * « Votre commande est prête » dans un sujet non encodé s'affiche en
 * caractères illisibles chez le destinataire.
 */
function encoderEntete(valeur: string): string {
  // Test d'appartenance à l'ASCII sans expression régulière : une plage
  // `\x00-\x7F` ferait entrer des caractères de contrôle dans le motif, ce que
  // le lint refuse à juste titre.
  const estAscii = [...valeur].every((caractere) => caractere.charCodeAt(0) < 128);
  return estAscii ? valeur : `=?UTF-8?B?${Buffer.from(valeur, 'utf8').toString('base64')}?=`;
}

function composer(message: MessageMail, id: string, envoyeLe: Date): string {
  const frontiere = `----=_contes_${id}`;
  const entetes = [
    `Message-ID: <${id}@contes.local>`,
    `Date: ${envoyeLe.toUTCString()}`,
    `To: ${message.destinataire}`,
    `From: Contes d'Afrique <ne-pas-repondre@contes.local>`,
    `Subject: ${encoderEntete(message.sujet)}`,
    `Content-Language: ${message.langue}`,
    `X-Modele: ${message.modele}`,
  ];

  for (const [cle, valeur] of Object.entries(message.metadonnees ?? {})) {
    entetes.push(`X-Meta-${assainir(cle)}: ${encoderEntete(valeur)}`);
  }

  entetes.push('MIME-Version: 1.0');

  if (!message.html) {
    entetes.push('Content-Type: text/plain; charset=UTF-8', '', message.texte);
    return entetes.join('\r\n');
  }

  entetes.push(
    `Content-Type: multipart/alternative; boundary="${frontiere}"`,
    '',
    `--${frontiere}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    message.texte,
    '',
    `--${frontiere}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    message.html,
    '',
    `--${frontiere}--`,
  );
  return entetes.join('\r\n');
}
