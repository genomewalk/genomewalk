import type { Chapter, ChapterOptions } from "../../shared/types.ts";
import { meaningIntroduction } from "../../shared/meaning-chapter.ts";
import { runConsumerChapter } from "../chapters.ts";
import frequencies from "./chapters/frequencies.ts";
import clinvar from "./chapters/clinvar.ts";
import results from "./chapters/results.ts";
export { ctx } from "./context.ts";

// Titles follow the site's nine-chapter journey. Everything that runs here,
// including chapters 7–9, belongs to this consumer experience.
const introductions: [string, string, string][] = [
  [
    "The file introduces itself",
    "the provider, reference build and columns in your export",
    "Your raw DNA export begins with <b>header comments</b> starting with <code>#</code>, followed by a line naming the columns. Explore what these lines say about the provider, reference build and reported alleles.",
  ],
  [
    "Lets learn to read a variant line",
    "a marker, its position and your reported alleles",
    "Each row reports one tested site. Here is a real line from your file; select a column name to explore what it means.",
  ],
  [
    "A closer look at different types of variants",
    "no-calls, repeated sites and other kinds of row",
    "Some rows leave an answer blank, repeat a site, or use a different kind of code. Compare real examples from your file, with a standard row alongside them. Follow a title for its explanation.",
  ],
  [
    "Count everything (one full pass)",
    "calls, missing data and repeated positions",
    "One full pass counts the rows, the different sites they describe, and which calls meet the matching rules. Open any count to see what it means.",
  ],
  [
    "What the file just told us",
    "the measured sites and the limits of a compact export",
    "The positions in this file form a snapshot of your DNA. Explore what that snapshot includes.",
  ],
  [meaningIntroduction.title, meaningIntroduction.blurb, meaningIntroduction.why],
];
export const STEPS: Chapter[] = [
  ...introductions.map(([title, blurb, why], index) => ({
    title,
    blurb,
    why,
    run: (out: HTMLElement, options?: ChapterOptions) => runConsumerChapter(index, out, options),
  })),
  frequencies,
  clinvar,
  results,
];
export const getChapters = () => STEPS;
