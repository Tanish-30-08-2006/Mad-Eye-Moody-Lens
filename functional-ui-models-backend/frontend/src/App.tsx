import { useEffect, useRef, useState } from "react";
import { analyzeAudio, analyzeImage, AnalysisResult, MediaType, startVideoJob } from "./api/client";
import { Analyser, Phase } from "./components/Analyser";
import { Footer, GridBackground, Nav } from "./components/Chrome";
import { Hero } from "./components/Hero";
import { History } from "./components/History";
import { Limitations } from "./components/Limitations";
import { ModelStats } from "./components/ModelStats";
import { ResultCard } from "./components/ResultCard";
import { TextReveal } from "./components/TextReveal";
import { Workflow } from "./components/Workflow";
import { useHistory } from "./hooks/useHistory";
import { useJobPolling } from "./hooks/useJobPolling";
import { useModels } from "./hooks/useModels";

export default function App() {
  const { models, state, byKey } = useModels();
  const history = useHistory();

  const [phase, setPhase] = useState<Phase>({ stage: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [fileName, setFileName] = useState("");
  // The user's original file stays in this tab only, so heatmaps can be drawn over the real face.
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const job = useJobPolling(jobId);

  const finish = (r: AnalysisResult, name: string) => {
    setResult(r);
    history.add(r, name);
    setPhase({ stage: "idle" });
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Video: mirror job status into the phase, finish on done/failed.
  useEffect(() => {
    if (!jobId) return;
    setPhase({ stage: "job", job });
    if (!job) return;
    if (job.status === "done" && job.result) {
      setJobId(null);
      finish(job.result, fileName);
    } else if (job.status === "failed") {
      setJobId(null);
      setError(job.error ?? "Analysis failed.");
      setPhase({ stage: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, jobId]);

  const submit = async (type: MediaType, file: File) => {
    setError(null);
    setResult(null);
    setFileName(file.name);
    setResultFile(file);
    setPhase({ stage: "uploading", fraction: 0 });

    const onUpload = (fraction: number) => {
      // When the bytes are sent, image/audio switch to "analysing"; video waits for the 202.
      if (fraction >= 1 && type !== "video") setPhase({ stage: "analysing" });
      else setPhase({ stage: "uploading", fraction });
    };

    try {
      if (type === "video") {
        const j = await startVideoJob(file, onUpload);
        setPhase({ stage: "job", job: j });
        setJobId(j.job_id); // polling takes over
        return;
      }
      const r = type === "image" ? await analyzeImage(file, onUpload) : await analyzeAudio(file, onUpload);
      finish(r, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase({ stage: "idle" });
    }
  };

  return (
    <>
      <GridBackground />
      <div className="app">
        <Nav state={state} />
        <main>
          <Hero state={state} models={models} />
          <ModelStats byKey={byKey} />
          <Analyser phase={phase} error={error} byKey={byKey} onSubmit={submit}>
            <div ref={resultRef} style={{ scrollMarginTop: 96 }}>
              {result && <ResultCard result={result} fileName={fileName} file={resultFile} />}
            </div>
          </Analyser>
          <TextReveal />
          <Workflow />
          <History
            entries={history.entries}
            onClear={history.clear}
            onOpen={(e) => {
              setError(null);
              setFileName(e.fileName);
              setResultFile(null); // History keeps results only, never media
              setResult(e.result);
              requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }}
          />
          <Limitations byKey={byKey} />
        </main>
        <Footer />
      </div>
    </>
  );
}
