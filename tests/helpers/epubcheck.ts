import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Validation d'un EPUB par epubcheck, l'implémentation de référence du W3C.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE VALIDATEUR EST DANS LE DÉPÔT, PAS DANS UNE DÉPENDANCE NPM.           │
 * │                                                                          │
 * │ Le paquet `epubchecker` téléchargeait l'archive Java depuis GitHub à     │
 * │ l'installation. Le problème n'était pas la lenteur du réseau : c'est     │
 * │ qu'un `npm install` RÉUSSISSE alors que le validateur est absent. Une    │
 * │ intégration continue serait alors verte sans avoir rien validé — le pire │
 * │ des deux mondes, puisque le tableau de bord affirmerait le contraire.    │
 * │                                                                          │
 * │ Le jar est donc versionné sous `vendors/epubcheck/`. Licence BSD à trois │
 * │ clauses, permissive, compatible avec un projet propriétaire. Le projet   │
 * │ reste entièrement hors ligne, conformément à CLAUDE.md.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RACINE = process.cwd();
const JAR = join(RACINE, 'vendors', 'epubcheck', 'epubcheck.jar');

export interface MessageEpubcheck {
  /** `FATAL`, `ERROR`, `WARNING`, `INFO`, `USAGE` ou `SUPPRESSED`. */
  severity: string;
  message: string;
  ID?: string;
}

export interface RapportEpubcheck {
  messages: MessageEpubcheck[];
}

/** Le validateur est-il installé ? Sert au message d'erreur, pas à ignorer le test. */
export function epubcheckDisponible(): boolean {
  return existsSync(JAR);
}

/**
 * Valide un EPUB en mémoire.
 *
 * Échoue franchement si le validateur ou Java manquent : c'est exactement le
 * cas qu'on cherche à rendre bruyant. Un test silencieusement ignoré vaudrait
 * moins que pas de test du tout.
 */
export async function validerEpub(contenu: Buffer): Promise<RapportEpubcheck> {
  if (!epubcheckDisponible()) {
    throw new Error(
      `epubcheck introuvable : ${JAR}. Le validateur est versionné sous vendors/epubcheck/ — vérifiez que le dépôt est complet.`,
    );
  }

  const dossier = await mkdtemp(join(tmpdir(), 'epubcheck-'));
  const cheminEpub = join(dossier, 'livre.epub');
  const cheminRapport = join(dossier, 'rapport.json');

  try {
    await writeFile(cheminEpub, contenu);

    await new Promise<void>((resoudre, rejeter) => {
      execFile(
        'java',
        // Le fichier à valider vient EN PREMIER : epubcheck attend son chemin
        // comme premier argument, et refuse celui qui suit une option qu'il ne
        // reconnaît pas. `--failonwarnings` a été retiré — c'est un drapeau
        // sans valeur, et le test décide lui-même de ce qui est grave.
        ['-jar', JAR, cheminEpub, '--json', cheminRapport],
        { timeout: 180_000, maxBuffer: 32 * 1024 * 1024 },
        (erreur, _stdout, stderr) => {
          // epubcheck sort en code non nul dès qu'il trouve une erreur DANS le
          // fichier : ce n'est pas un échec d'exécution, et le rapport est
          // écrit malgré tout. On ne rejette donc que si le rapport manque.
          if (erreur && !existsSync(cheminRapport)) {
            rejeter(new Error(`epubcheck n'a pas pu s'exécuter : ${stderr || erreur.message}`));
            return;
          }
          resoudre();
        },
      );
    });

    const brut = await readFile(cheminRapport, 'utf8');
    const rapport = JSON.parse(brut) as Partial<RapportEpubcheck>;
    return { messages: rapport.messages ?? [] };
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

/** Messages qui font échouer une publication : erreurs et anomalies fatales. */
export function messagesGraves(rapport: RapportEpubcheck): MessageEpubcheck[] {
  return rapport.messages.filter((m) => m.severity === 'ERROR' || m.severity === 'FATAL');
}
