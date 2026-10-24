import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { RESULTS_STEP } from "../lib/navigation/journey.ts";
import { GeneticsLoader } from "./genetics-loader.tsx";
import { useExcerptOverflow } from "../lib/view/use-excerpt-overflow.ts";
import { reportError, reportingStage, type ErrorStage } from "../lib/error-reporting.ts";

export type ResultsRunner = (
  out: HTMLDivElement,
  options: {
    signal: AbortSignal;
    onStatus: (label: string) => void;
    onProgress: (fraction: number) => void;
  },
) => Promise<unknown>;

type ResultsPanelProps = {
  onComplete: () => void;
  context: { source: unknown };
  session: {
    outputs: Record<number, HTMLDivElement>;
    done: Record<number, boolean>;
    guideChapter: number;
  };
  runResults: ResultsRunner;
};

// Both experiences keep their own data/session; this component owns only UI lifecycle.
export function ResultsPanel({ onComplete, context, session, runResults }: ResultsPanelProps) {
  const outRef = useRef<HTMLDivElement>(null);
  useExcerptOverflow(outRef);
  const [attempt, setAttempt] = useState(0);
  const [running, setRunning] = useState(() => !session.outputs[RESULTS_STEP]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number>();
  const [status, setStatus] = useState("");

  useEffect(() => {
    const out = outRef.current;
    if (!out) return;
    const saved = session.outputs[RESULTS_STEP];
    if (saved) {
      if (saved !== out) out.replaceChildren(...saved.childNodes);
      session.outputs[RESULTS_STEP] = out;
      setRunning(false);
      return;
    }
    const controller = new AbortController();
    const source = context.source;
    out.replaceChildren();
    setRunning(true);
    setProgress(undefined);
    setStatus("");
    setError("");

    // Opening results starts their own preparation; it never runs or completes
    // the teaching chapters. Reopening reuses this visit's computed matches.
    async function prepare(out: HTMLDivElement) {
      let stage: ErrorStage = "prepare";
      try {
        const ready = await runResults(out, {
          signal: controller.signal,
          onStatus: (label: string) => {
            stage = reportingStage(label);
            if (!controller.signal.aborted && context.source === source) {
              setProgress(undefined);
              setStatus(label);
            }
          },
          onProgress: (fraction: number) => {
            stage = "read-file";
            if (!controller.signal.aborted && context.source === source) {
              setStatus("");
              setProgress(fraction);
            }
          },
        });
        if (controller.signal.aborted || context.source !== source) return;
        if (ready !== false) {
          session.outputs[RESULTS_STEP] = out;
          session.done[RESULTS_STEP] = true;
          onComplete();
        }
      } catch (err) {
        if (!controller.signal.aborted && context.source === source) {
          reportError(err, "results", stage);
          setError((err as Error)?.message ?? String(err));
        }
      } finally {
        if (!controller.signal.aborted) setRunning(false);
      }
    }
    void prepare(out);
    return () => controller.abort();
  }, [attempt, onComplete, context, session, runResults]);

  return (
    <>
      <div className="results-return">
        <Link to="/chapter/$n" params={{ n: String(session.guideChapter) }} className="backlink">
          <ArrowLeft size={14} /> Back to chapter {session.guideChapter}
        </Link>
      </div>
      {running && (
        <GeneticsLoader
          label={status || (progress == null ? "Preparing your results…" : "Reading your genome…")}
          progress={progress}
        />
      )}
      <div className="s-out results-output" ref={outRef} aria-busy={running} />
      {error && (
        <div className="results-error">
          <p className="err" role="alert">
            We couldn’t prepare your results. {error}
          </p>
          <button className="btn rerun" onClick={() => setAttempt((value) => value + 1)}>
            Retry <RotateCcw size={14} />
          </button>
        </div>
      )}
    </>
  );
}
