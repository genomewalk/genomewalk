import backgroundStyles from "../../components/chapter-background/chapter-background.module.css";
import "./consumer.css";
import { Link } from "@tanstack/react-router";
import { Fragment, useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  FileText,
  LockKeyhole,
  Play,
  RotateCcw,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "../../components/brand.tsx";
import { ChapterBackground } from "../../components/chapter-background/chapter-background.tsx";
import { getChapters, ctx } from "./engine/learn.ts";
import { session, RESULTS_STEP } from "./engine/session.ts";
import { ResultsPanel } from "./results-panel.tsx";
import { FILE_CHAPTERS } from "../../lib/navigation/journey.ts";
import { GeneticsLoader } from "../../components/genetics-loader.tsx";
import { ErrorNotice } from "../../components/error-notice.tsx";
import { useLessonNavigation } from "../../lib/navigation/use-lesson-navigation.ts";
import { useExcerptOverflow } from "../../lib/view/use-excerpt-overflow.ts";
import { reportError, reportingStage, type ErrorStage } from "../../lib/error-reporting.ts";
import { trackEvent } from "../../lib/analytics.ts";
import { getSourceFileDiagnostics } from "../../lib/diagnostics/file-context.ts";
import { runtimeFailureMessage } from "../../lib/diagnostics/runtime-failure.ts";

type StepDef = {
  title: string;
  why: string;
  run: (
    out: HTMLElement,
    options?: {
      signal: AbortSignal;
      onProgress: (fraction: number) => void;
      onStatus: (label: string) => void;
    },
  ) => Promise<void | boolean>;
};

export default function ChapterPage({ n }: { n: string }) {
  return (
    <div
      id="top"
      className={`site-shell chapter-shell consumer-experience ${backgroundStyles["chapter-shell"]}`}
    >
      <ChapterBackground />
      <SiteHeader />
      <ChapterContent key={n} n={n} />
      <SiteFooter />
    </div>
  );
}

function ChapterContent({ n }: { n: string }) {
  const steps = getChapters() as StepDef[];
  const i = Number.parseInt(n, 10) - 1;
  const step = steps[i];
  const isResults = i === RESULTS_STEP;
  const outRef = useRef<HTMLDivElement>(null);
  const active = useRef(true);
  const runController = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    active.current = true;
    if (step && !isResults && ctx.source) session.guideChapter = i + 1;
    const saved = session.outputs[i];
    const out = outRef.current;
    if (saved && out && saved !== out) {
      out.replaceChildren(...saved.childNodes);
      session.outputs[i] = out;
    }
    return () => {
      active.current = false;
      runController.current?.abort();
    };
  }, [i, isResults, step]);

  const handleLessonLink = useLessonNavigation(outRef, running, {
    chapter: i + 1,
    source: session.kind,
  });
  useExcerptOverflow(outRef);

  if (!step || String(i + 1) !== n) {
    return (
      <main className="page-width empty-route">
        <Link to="/" className="backlink">
          <ArrowLeft size={14} /> Start over
        </Link>
        <h1>Chapter not found</h1>
        <p>The walkthrough has {steps.length} chapters. Head back to the beginning to pick one.</p>
        <Link to="/" hash="steps" className="btn">
          The field guide <ArrowRight size={16} />
        </Link>
      </main>
    );
  }
  if (!session.fileName || !ctx.source) {
    return (
      <main className="page-width empty-route">
        <Link to="/" className="backlink">
          <ArrowLeft size={14} /> Start over
        </Link>
        <h1>{isResults ? "Choose a genome to see your results" : "Choose a genome to begin"}</h1>
        <p>
          Open your own file or explore the free public sample. Files and progress stay only for
          this visit, so refreshing starts fresh.
        </p>
        <Link to="/" hash="specimen" search={isResults ? { view: "results" } : {}} className="btn">
          Choose a file or sample <ArrowRight size={16} />
        </Link>
      </main>
    );
  }

  const done = !!session.done[i];
  const next = i + 1 < steps.length ? i + 2 : null;
  const completed = Object.values(session.done).filter(Boolean).length;

  async function run() {
    const out = outRef.current;
    if (!out || !step || running) return;
    out.innerHTML = "";
    setRunning(true);
    setProgress(undefined);
    setStatus("");
    setError("");
    const source = ctx.source;
    const eventProperties = { chapter: i + 1, ...(session.kind ? { source: session.kind } : {}) };
    trackEvent("chapter_run_started", eventProperties);
    const fileDiagnostics = getSourceFileDiagnostics(source);
    let errorStage: ErrorStage = "prepare";
    try {
      runController.current = new AbortController();
      const ready = await step.run(out, {
        signal: runController.current.signal,
        onProgress: (fraction) => {
          errorStage = "read-file";
          if (active.current && ctx.source === source) {
            setStatus("");
            setProgress(fraction);
          }
        },
        onStatus: (label) => {
          errorStage = reportingStage(label);
          if (active.current && ctx.source === source) {
            setProgress(undefined);
            setStatus(label);
          }
        },
      });
      if (ready === false) return;
      if (!active.current || ctx.source !== source) return;
      trackEvent("chapter_run_completed", eventProperties);
      session.outputs[i] = out;
      session.done[i] = true;
      force();
    } catch (err) {
      if (active.current && ctx.source === source) {
        if (!(err instanceof Error && err.name === "AbortError"))
          trackEvent("chapter_run_failed", eventProperties);
        reportError(err, "chapter", errorStage, i + 1, fileDiagnostics);
        setError(runtimeFailureMessage(err) ?? (err as Error)?.message ?? String(err));
      }
    } finally {
      if (active.current) setRunning(false);
    }
  }

  return (
    <main className="page-width reading-layout">
      <aside className="chapter-sidebar">
        <Link to="/" hash="steps" className="backlink">
          <ArrowLeft size={13} /> Back to the field guide
        </Link>
        <div className="sidebar-heading">
          <span>YOUR JOURNEY</span>
          <span>
            {String(completed).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
          </span>
        </div>
        <div
          className="reading-progress"
          role="progressbar"
          aria-label="Chapter progress"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={steps.length}
        >
          <i style={{ width: `${(completed / steps.length) * 100}%` }} />
        </div>
        <nav className="sidebar-chapters" aria-label="Chapters">
          {steps.map((s, j) => (
            <Fragment key={s.title}>
              {(j === 0 || j === FILE_CHAPTERS) && (
                <div className="sidebar-part">
                  {j === 0 ? "I · The file alone" : "II · Public catalogues"}
                </div>
              )}
              <Link
                to="/chapter/$n"
                params={{ n: String(j + 1) }}
                className={`sidebar-chapter${j === i ? " current" : ""}`}
                aria-current={j === i ? "step" : undefined}
                aria-label={`Chapter ${j + 1}: ${s.title} (${session.done[j] ? "completed" : "not yet run"})`}
              >
                <span>{String(j + 1).padStart(2, "0")}</span>
                <span>{s.title}</span>
                {session.done[j] ? (
                  <Check size={12} aria-hidden="true" />
                ) : (
                  <Circle size={10} className="chapter-unrun" aria-hidden="true" />
                )}
              </Link>
            </Fragment>
          ))}
        </nav>
        <div className="sidebar-privacy">
          <LockKeyhole size={13} />
          <span>Your genome stays on this device.</span>
        </div>
      </aside>
      <div className="reading-main">
        <div className="reading-breadcrumb">
          <span>
            THE FIELD GUIDE <span>/</span> {String(i + 1).padStart(2, "0")}
          </span>
          <span className="specimen-chip">
            <FileText size={12} />
            <span>{session.fileName}</span>
          </span>
        </div>
        <section
          className={`step${done ? " done" : ""}`}
          data-chapter={i + 1}
          aria-labelledby="chapter-title"
        >
          <div className="chapter-kicker">
            Part {i < FILE_CHAPTERS ? "one" : "two"}
            <i /> Chapter {i + 1} of {steps.length}
          </div>
          <h1 id="chapter-title" className="chapter-title">
            {step.title}
          </h1>
          <p className="s-why" dangerouslySetInnerHTML={{ __html: step.why }} />
          {isResults ? (
            <ResultsPanel onComplete={force} />
          ) : (
            <>
              {running && (
                <GeneticsLoader
                  label={
                    status ||
                    (progress != null || i < FILE_CHAPTERS
                      ? "Reading your genome…"
                      : "Preparing this chapter…")
                  }
                  progress={progress}
                />
              )}
              <div className="s-out" ref={outRef} aria-busy={running} onClick={handleLessonLink} />
              {error && <ErrorNotice title="We couldn’t finish this chapter">{error}</ErrorNotice>}
              <div className="chapter-actions">
                {!done && !running && (
                  <button className="btn s-run" onClick={run}>
                    {error ? "Retry" : "Run this chapter"}
                    {error ? <RotateCcw size={14} /> : <Play size={13} />}
                  </button>
                )}
                {done && next && (
                  <Link to="/chapter/$n" params={{ n: String(next) }} className="btn btn-next">
                    Next chapter <ArrowRight size={16} />
                  </Link>
                )}
                {done && !next && (
                  <span className="finale">
                    That's the whole file —{" "}
                    <Link to="/" className="inlinelink">
                      load another specimen
                    </Link>
                    .
                  </span>
                )}
                <Link
                  to="/chapter/$n"
                  params={{ n: String(RESULTS_STEP + 1) }}
                  className="results-shortcut"
                >
                  Just show me my results <ArrowRight size={14} />
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
