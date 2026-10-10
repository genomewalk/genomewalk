import {
  ResultsPanel as SharedResultsPanel,
  type ResultsRunner,
} from "../../components/results-panel.tsx";
import { STEPS, ctx } from "./engine/learn.ts";
import { RESULTS_STEP, session } from "./engine/session.ts";

const runResults: ResultsRunner = (out, options) => STEPS[RESULTS_STEP]!.run(out, options);

export function ResultsPanel({ onComplete }: { onComplete: () => void }) {
  return (
    <SharedResultsPanel
      context={ctx}
      session={session}
      runResults={runResults}
      onComplete={onComplete}
    />
  );
}
