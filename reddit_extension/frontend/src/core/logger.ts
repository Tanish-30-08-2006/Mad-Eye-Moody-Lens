/**
 * core/logger.ts – Structured logging utility for the extension.
 *
 * Provides namespaced console logging with configurable levels.
 * All extension modules should use this instead of raw console.*.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// TODO: Read from settings/storage in Phase 7
const CURRENT_LEVEL: LogLevel = 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LEVEL];
}

export function createLogger(namespace: string) {
  const prefix = `[MoodyLens:${namespace}]`;

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) {
        // eslint-disable-next-line no-console
        console.debug(prefix, ...args);
      }
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) {
        // eslint-disable-next-line no-console
        console.info(prefix, ...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn(prefix, ...args);
      }
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) {
        console.error(prefix, ...args);
      }
    },
  };
}
