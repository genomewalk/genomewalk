// Shared in-memory session for the loaded specimen and chapter progress.
// The File object itself lives on ctx.source (learn.ts); both survive client-side
// route changes because modules are singletons.
export { RESULTS_STEP } from "../../../lib/navigation/journey.ts";

export const session = {
  fileName: null as string | null,
  kind: null as "upload" | "sample" | null,
  done: {} as Record<number, boolean>,
  // Keep live DOM nodes so expanded explanations and event listeners survive
  // chapter navigation. These are never serialized or persisted.
  outputs: {} as Record<number, HTMLDivElement>,
  guideChapter: 1,
};

export function resetSession(fileName: string, kind: "upload" | "sample" = "upload") {
  session.fileName = fileName;
  session.kind = kind;
  session.done = {};
  session.outputs = {};
  session.guideChapter = 1;
}
