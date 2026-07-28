/**
 * Logger du projet.
 *
 * CLAUDE.md interdit `console.log`. Une règle ESLint interdit `console` dans
 * tout le dépôt ; ce module est le seul point d'écriture, et il passe
 * directement par les flux standard.
 *
 * Sortie en JSON par ligne, pour rester exploitable par un collecteur sans
 * dépendance supplémentaire.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogContext {
  [key: string]: unknown;
}

function threshold(): number {
  const configured = (process.env['LOG_LEVEL'] ?? '').toLowerCase();
  if (configured in LEVEL_WEIGHT) {
    return LEVEL_WEIGHT[configured as LogLevel];
  }
  return process.env['NODE_ENV'] === 'test' ? LEVEL_WEIGHT.warn : LEVEL_WEIGHT.info;
}

/**
 * Une erreur est sérialisée en clair ; les détails internes ne sortent que
 * dans les journaux, jamais dans une réponse HTTP.
 */
function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_WEIGHT[level] < threshold()) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
  };
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      entry[key] = serialize(value);
    }
  }

  const line = `${JSON.stringify(entry)}\n`;
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    emit('debug', message, context);
  },
  info: (message: string, context?: LogContext) => {
    emit('info', message, context);
  },
  warn: (message: string, context?: LogContext) => {
    emit('warn', message, context);
  },
  error: (message: string, context?: LogContext) => {
    emit('error', message, context);
  },
};
