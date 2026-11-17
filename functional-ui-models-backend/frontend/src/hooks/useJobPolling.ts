import { useEffect, useState } from "react";
import { getJob, JobStatus } from "../api/client";

/** Polls GET /api/v1/jobs/{id} until the video job is done or failed. */
export function useJobPolling(jobId: string | null, intervalMs = 1500) {
  const [job, setJob] = useState<JobStatus | null>(null);

  useEffect(() => {
    setJob(null);
    if (!jobId) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const j = await getJob(jobId);
        if (cancelled) return;
        setJob(j);
        if (j.status === "queued" || j.status === "running") {
          timer = window.setTimeout(tick, intervalMs);
        }
      } catch (e) {
        if (!cancelled) {
          setJob({
            job_id: jobId,
            status: "failed",
            progress: 0,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    };

    timer = window.setTimeout(tick, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [jobId, intervalMs]);

  return job;
}
