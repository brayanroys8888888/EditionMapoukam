import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '@/lib/logger';

/**
 * Invocation des outils poppler.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ON NE SE FIE PAS AU PATH.                                               │
 * │                                                                          │
 * │ Sur ce poste, Git for Windows livre un `pdftotext.exe` issu de Xpdf 4.00 │
 * │ dans `mingw64\bin`, qui MASQUE celui de poppler. Or Xpdf ne connaît pas  │
 * │ l'option `-bbox`, dont l'extraction dépend (§7.4.5). `pdftoppm` et       │
 * │ `pdfinfo`, eux, résolvent bien vers poppler : la chaîne aurait donc      │
 * │ mélangé deux outillages sans le signaler.                                │
 * │                                                                          │
 * │ Chaque binaire est donc résolu explicitement, puis VÉRIFIÉ en lisant sa  │
 * │ bannière de version. Un outil qui n'est pas poppler fait échouer         │
 * │ l'ingestion, franchement, au lieu de produire un résultat dégradé.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * §7.4.5 rappelle que poppler est sous GPL : l'appel en sous-processus est
 * sans incidence sur la licence du code applicatif. C'est la raison pour
 * laquelle ces outils sont invoqués ainsi, et non liés.
 */
export type OutilPoppler = 'pdftotext' | 'pdftoppm' | 'pdfinfo';

/**
 * Un PDF est un format d'entrée NON FIABLE.
 *
 * Un fichier malformé — ou construit pour nuire — peut faire boucler un
 * décodeur indéfiniment, ou le faire consommer toute la mémoire de la machine.
 * Ces bornes ne sont pas des optimisations, ce sont des garde-fous.
 */
export const LIMITES = {
  /** Au-delà, le processus est tué. Un conte illustré se rend en secondes. */
  timeoutMs: 120_000,
  /** Sortie maximale acceptée d'un sous-processus, en octets. */
  sortieMaxOctets: 64 * 1024 * 1024,
  /** Un album jeunesse dépasse rarement la centaine de pages. */
  pagesMax: 300,
} as const;

const CACHE_CHEMINS = new Map<OutilPoppler, string>();

/**
 * Dossiers d'installation probables de poppler.
 *
 * Le PATH ne suffit pas : il peut contenir une variante Xpdf qui masque
 * poppler. On cherche donc aussi aux emplacements d'installation connus, ce
 * qui évite d'imposer une variable d'environnement sur chaque poste.
 */
function dossiersConnus(): string[] {
  const dossiers: string[] = [];

  const configure = process.env['POPPLER_BIN_DIR'];
  if (configure) dossiers.push(configure);

  if (process.platform === 'win32') {
    const local = process.env['LOCALAPPDATA'];
    if (local) {
      const paquets = join(local, 'Microsoft', 'WinGet', 'Packages');
      try {
        for (const paquet of readdirSync(paquets)) {
          if (!/poppler/i.test(paquet)) continue;
          const racine = join(paquets, paquet);
          for (const version of readdirSync(racine)) {
            if (!/^poppler-/i.test(version)) continue;
            dossiers.push(join(racine, version, 'Library', 'bin'));
          }
        }
      } catch {
        // Dossier WinGet absent : rien à explorer, on s'en remet au PATH.
      }
    }
  } else {
    dossiers.push('/usr/bin', '/usr/local/bin', '/opt/homebrew/bin');
  }

  return dossiers;
}

/** Emplacements à essayer, dossiers connus d'abord, PATH ensuite. */
function candidats(outil: OutilPoppler): string[] {
  const extension = process.platform === 'win32' ? '.exe' : '';
  const nom = `${outil}${extension}`;

  // Les dossiers connus passent AVANT le PATH : c'est précisément le PATH qui
  // peut contenir la variante Xpdf.
  return [...dossiersConnus().map((d) => join(d, nom)), nom];
}

function executer(
  binaire: string,
  args: readonly string[],
  options: { timeoutMs?: number; entree?: Buffer } = {},
): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resoudre, rejeter) => {
    const enfant = execFile(
      binaire,
      [...args],
      {
        timeout: options.timeoutMs ?? LIMITES.timeoutMs,
        maxBuffer: LIMITES.sortieMaxOctets,
        encoding: 'buffer',
        // Jamais de shell : les titres du corpus contiennent des apostrophes et
        // des accents, et un nom de fichier ne doit pas pouvoir devenir une
        // commande.
        shell: false,
        // Tuer le processus, pas seulement le signaler : un décodeur bloqué
        // ignore SIGTERM.
        killSignal: 'SIGKILL',
      },
      (erreur, stdout, stderr) => {
        const sortieErreur = stderr.toString('utf8');
        if (erreur) {
          const aExpire = 'killed' in erreur && erreur.killed === true;
          rejeter(
            new Error(
              aExpire
                ? `${binaire} a dépassé le délai de ${String(options.timeoutMs ?? LIMITES.timeoutMs)} ms et a été arrêté.`
                : `${binaire} a échoué : ${sortieErreur.slice(0, 500) || erreur.message}`,
            ),
          );
          return;
        }
        resoudre({ code: 0, stdout, stderr: sortieErreur });
      },
    );

    if (options.entree) {
      enfant.stdin?.end(options.entree);
    }
  });
}

/**
 * Vérifie qu'un binaire est bien celui de poppler.
 *
 * Xpdf et poppler exposent des outils de même nom, aux options différentes.
 *
 * ATTENTION AU FAUX DISCRIMINANT : les DEUX bannières mentionnent « Glyph &
 * Cog », poppler étant un fork d'Xpdf qui en crédite les auteurs d'origine.
 * Exclure sur ce motif rejetterait les deux outils. Seule la mention explicite
 * de poppler distingue :
 *
 *   poppler : « Copyright 2005-2025 The Poppler Developers - http://poppler… »
 *   Xpdf    : « Copyright 1996-2017 Glyph & Cog, LLC » et rien d'autre.
 */
async function estPoppler(binaire: string): Promise<boolean> {
  try {
    const { stdout, stderr } = await executer(binaire, ['-v'], { timeoutMs: 10_000 });
    const banniere = `${stdout.toString('utf8')}${stderr}`;
    return /poppler/i.test(banniere);
  } catch {
    return false;
  }
}

/**
 * Chemin vérifié d'un outil poppler.
 *
 * Échoue franchement plutôt que de retomber sur un outil approchant : une
 * chaîne d'ingestion qui produit des pages muettes parce que l'extraction a
 * silencieusement échoué est pire qu'une chaîne qui refuse de démarrer.
 */
export async function resoudreOutil(outil: OutilPoppler): Promise<string> {
  const memorise = CACHE_CHEMINS.get(outil);
  if (memorise) return memorise;

  const essais: string[] = [];
  for (const candidat of candidats(outil)) {
    const absolu = candidat.includes('/') || candidat.includes('\\');
    if (absolu && !existsSync(candidat)) continue;

    if (await estPoppler(candidat)) {
      CACHE_CHEMINS.set(outil, candidat);
      logger.info('Outil poppler résolu', { outil, chemin: candidat });
      return candidat;
    }
    essais.push(candidat);
  }

  throw new Error(
    `${outil} : aucun binaire poppler valide trouvé (essais : ${essais.join(', ') || 'aucun'}). ` +
      `Sur ce poste, Git for Windows livre une variante Xpdf qui masque poppler dans le PATH. ` +
      `Renseignez POPPLER_BIN_DIR avec le dossier contenant les binaires poppler.`,
  );
}

/** Réservé aux tests : oublie les chemins mémorisés. */
export function reinitialiserResolution(): void {
  CACHE_CHEMINS.clear();
}

/** Exécute un outil poppler résolu et vérifié. */
export async function lancerPoppler(
  outil: OutilPoppler,
  args: readonly string[],
  options: { timeoutMs?: number } = {},
): Promise<Buffer> {
  const binaire = await resoudreOutil(outil);
  const { stdout } = await executer(binaire, args, options);
  return stdout;
}

/**
 * Vérifie si un outil poppler est disponible sur le système.
 * Permet d'activer un repli applicatif (ex. Vercel) quand poppler n'est pas installé.
 */
export async function popplerEstDisponible(outil: OutilPoppler): Promise<boolean> {
  try {
    await resoudreOutil(outil);
    return true;
  } catch {
    return false;
  }
}

