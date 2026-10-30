import { useEffect, useState } from "react";
import { listModels, ModelInfo } from "../api/client";

export type BackendState = "connecting" | "warming" | "online" | "offline";

/**
 * Reads GET /api/v1/models. While models are still preloading (loaded=false)
 * or the backend is down, re-checks every 5 s so the status badge stays honest.
 */
export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [state, setState] = useState<BackendState>("connecting");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const check = async () => {
      try {
        const m = await listModels();
        if (cancelled) return;
        setModels(m);
        const ready = m.length > 0 && m.every((x) => x.loaded);
        setState(ready ? "online" : "warming");
        if (!ready) timer = window.setTimeout(check, 5000);
      } catch {
        if (cancelled) return;
        setState("offline");
        timer = window.setTimeout(check, 5000);
      }
    };

    check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const byKey = (key: string) => models.find((m) => m.key === key);
  return { models, state, byKey };
}
