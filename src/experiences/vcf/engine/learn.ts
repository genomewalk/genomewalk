// Public VCF lesson API. Processing and rendering live in focused modules.
import { headerChapter } from "./chapters/header.ts";
import { variantLineChapter } from "./chapters/variant-line.ts";
import { rowExamplesChapter } from "./chapters/row-examples.ts";
import { countsChapter } from "./chapters/counts.ts";
import { summaryChapter } from "./chapters/summary.ts";
import { meaningChapter } from "./chapters/meaning.ts";
import { frequenciesChapter } from "./chapters/frequencies.ts";
import { clinvarChapter } from "./chapters/clinvar.ts";
import { resultsChapter } from "./chapters/results.ts";

export { ctx } from "./context.ts";
export { FileSource } from "./bgzf.ts";
export { detectBuild } from "./reference.ts";

export const STEPS = [
  headerChapter,
  variantLineChapter,
  rowExamplesChapter,
  countsChapter,
  summaryChapter,
  meaningChapter,
  frequenciesChapter,
  clinvarChapter,
  resultsChapter,
];
