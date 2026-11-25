import { useEffect, useRef, useState } from "react";
import { analyzeAudio, analyzeImage, AnalysisResult, MediaType, startVideoJob } from "./api/client";
import { Analyser, Phase } from "./components/Analyser";
import { Footer, ForensicNav, GridBackground, Nav } from "./components/Chrome";
import { DuplicateDetector } from "./components/DuplicateDetector/DuplicateDetector";
import { Sha256Page } from "./features/forensic-utilities/sha256/components/Sha256Page";
import { ExifViewerPage } from "./features/forensic-utilities/exif-viewer/components/ExifViewerPage";
import { ExternalProviderModal } from "./components/ExternalProviderModal";
import { ExternalResultCard } from "./components/ExternalResultCard";
import { Hero } from "./components/Hero";
import { History } from "./components/History";
import { Limitations } from "./components/Limitations";
import { ModelStats } from "./components/ModelStats";
import { ResultCard } from "./components/ResultCard";
import { TextReveal } from "./components/TextReveal";
import { Workflow } from "./components/Workflow";
import { useExternalProviderConfig } from "./hooks/useExternalProviderConfig";
import { useHistory } from "./hooks/useHistory";
import { useJobPolling } from "./hooks/useJobPolling";
import { useModels } from "./hooks/useModels";
import { callExternalProvider, ExternalAnalysisResult } from "./services/externalProvider";

export default function App() {
  const { models, state, byKey } = useModels();
  const history = useHistory();
  const externalProvider = useExternalProviderConfig();

  const [phase, setPhase] = useState<Phase>({ stage: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [externalResult, setExternalResult] = useState<ExternalAnalysisResult | null>(null);
  const [externalBusy, setExternalBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [invitationMessage, setInvitationMessage] = useState<string | null>(null);

  const [fileName, setFileName] = useState("");
  // The user's original file stays in this tab only, so heatmaps can be drawn over the real face.
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<"main" | "duplicate" | "sha256" | "exif">(() => {
    if (typeof window !== "undefined") {
      if (
        window.location.pathname === "/duplicate-detection" ||
        window.location.hash === "#duplicate-detection"
      ) {
        return "duplicate";
      }
      if (
        window.location.pathname === "/sha256-generator" ||
        window.location.hash === "#sha256-generator"
      ) {
        return "sha256";
      }
      if (
        window.location.pathname === "/exif-viewer" ||
        window.location.hash === "#exif-viewer"
      ) {
        return "exif";
      }
    }
    return "main";
  });

  useEffect(() => {
    const checkHash = () => {
      if (
        window.location.pathname === "/duplicate-detection" ||
        window.location.hash === "#duplicate-detection"
      ) {
        setView("duplicate");
      } else if (
        window.location.pathname === "/sha256-generator" ||
        window.location.hash === "#sha256-generator"
      ) {
        setView("sha256");
      } else if (
        window.location.pathname === "/exif-viewer" ||
        window.location.hash === "#exif-viewer"
      ) {
        setView("exif");
      } else {
        setView("main");
      }
    };
    window.addEventListener("hashchange", checkHash);
    window.addEventListener("popstate", checkHash);
    return () => {
      window.removeEventListener("hashchange", checkHash);
      window.removeEventListener("popstate", checkHash);
    };
  }, []);

  const job = useJobPolling(jobId);

  const finish = (r: AnalysisResult, name: string) => {
    setExternalResult(null);
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
    setExternalResult(null);
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

  const submitExternal = async (file: File) => {
    setError(null);
    setResult(null);
    setExternalResult(null);
    setFileName(file.name);
    setResultFile(file);
    setExternalBusy(true);

    try {
      const res = await callExternalProvider(file, externalProvider.config);
      setExternalResult(res);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExternalBusy(false);
    }
  };

  const openSettings = (invitation?: string) => {
    setInvitationMessage(invitation || null);
    setModalOpen(true);
  };

  return (
    <>
      <GridBackground />
      <div className="app">
        <Nav state={state} />
        <main>
          {view !== "main" ? (
            <div className="utility-page-wrapper">
              <div className="container">
                <ForensicNav active={view} onNavigate={setView} />
                {view === "duplicate" && <DuplicateDetector />}
                {view === "sha256" && (
                  <Sha256Page
                    onNavigateHome={() => setView("main")}
                    onNavigateDuplicate={() => setView("duplicate")}
                    onNavigateExif={() => setView("exif")}
                  />
                )}
                {view === "exif" && (
                  <ExifViewerPage
                    onNavigateHome={() => setView("main")}
                    onNavigateDuplicate={() => setView("duplicate")}
                    onNavigateSha256={() => setView("sha256")}
                  />
                )}
              </div>
            </div>
          ) : (
            <>
              <Hero state={state} models={models} />
              <ModelStats byKey={byKey} />
              <Analyser
                phase={phase}
                error={error}
                byKey={byKey}
                onSubmit={submit}
                externalConfig={externalProvider.config}
                isExternalConfigured={externalProvider.isConfigured}
                onExternalSubmit={submitExternal}
                onOpenExternalSettings={openSettings}
                isExternalBusy={externalBusy}
              >
                <div ref={resultRef} style={{ scrollMarginTop: 96 }}>
                  {result && <ResultCard result={result} fileName={fileName} file={resultFile} />}
                  {externalResult && (
                    <ExternalResultCard
                      result={externalResult}
                      fileName={fileName}
                      onAnalyseNative={() => resultFile && submit("image", resultFile)}
                    />
                  )}
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
                  setExternalResult(null);
                  setResult(e.result);
                  requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                }}
              />
              <Limitations byKey={byKey} />
            </>
          )}
        </main>
        <Footer />
      </div>

      <ExternalProviderModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        config={externalProvider.config}
        onSave={externalProvider.save}
        onClear={externalProvider.clear}
        invitationMessage={invitationMessage}
      />
    </>
  );
}
