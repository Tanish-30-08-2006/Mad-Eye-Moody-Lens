/**
 * core/logger.ts – Structured logging utility for the extension.
 *
 * Provides namespaced console logging. Debug output (which may include post and media
 * details) is only emitted while the Debug setting is on; see core/debug.ts.
 */

let debugEnabled = false;

/** Turns verbose logging on or off (driven by the Debug setting). */
export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

export function isDebugLogging(): boolean {
  return debugEnabled;
}

export function createLogger(namespace: string) {
  const prefix = `[MoodyLens:${namespace}]`;

  return {
    // Gated: callers may include titles/URLs here because it is silent unless Debug is on.
    debug: (...args: unknown[]) => {
      if (debugEnabled) {
        // eslint-disable-next-line no-console
        console.debug(prefix, ...args);
      }
    },
    info: (...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.info(prefix, ...args);
    },
    warn: (...args: unknown[]) => {
      console.warn(prefix, ...args);
    },
    error: (...args: unknown[]) => {
      console.error(prefix, ...args);
    },
  };
}
