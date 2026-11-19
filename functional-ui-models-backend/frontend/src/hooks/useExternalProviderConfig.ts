import { useCallback, useState } from "react";
import {
  DEFAULT_EXTERNAL_CONFIG,
  ExternalProviderConfig,
  validateExternalConfig,
} from "../services/externalProvider";

const SESSION_KEY = "mml-external-provider-session";
const LOCAL_KEY = "mml-external-provider-local";

function readInitialConfig(): ExternalProviderConfig {
  try {
    // Check sessionStorage first (current active tab session)
    const sessionRaw = sessionStorage.getItem(SESSION_KEY);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      return { ...DEFAULT_EXTERNAL_CONFIG, ...parsed };
    }

    // Check localStorage if the user previously opted to persist
    const localRaw = localStorage.getItem(LOCAL_KEY);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      return { ...DEFAULT_EXTERNAL_CONFIG, ...parsed, rememberKey: true };
    }
  } catch {
    // Storage unavailable or disabled
  }
  return { ...DEFAULT_EXTERNAL_CONFIG };
}

export function useExternalProviderConfig() {
  const [config, setConfig] = useState<ExternalProviderConfig>(readInitialConfig);

  const save = useCallback((newConfig: ExternalProviderConfig) => {
    const validated = validateExternalConfig(newConfig);
    setConfig(validated);

    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(validated));
      if (validated.rememberKey) {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(validated));
      } else {
        localStorage.removeItem(LOCAL_KEY);
      }
    } catch {
      // Storage unavailable
    }
    return validated;
  }, []);

  const clear = useCallback(() => {
    setConfig({ ...DEFAULT_EXTERNAL_CONFIG });
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      // Storage unavailable
    }
  }, []);

  const isConfigured = Boolean(
    config.endpoint &&
      config.endpoint.trim() &&
      (config.authType === "none" || (config.apiKey && config.apiKey.trim().length > 0))
  );

  return {
    config,
    save,
    clear,
    isConfigured,
  };
}
