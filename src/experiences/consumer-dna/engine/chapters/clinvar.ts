import type { ChapterOptions } from "../../../shared/types.ts";
import { loadCatalog } from "../catalogue.ts";
import { SIG_LABEL, SIG_MEANING, STAR_TEXT } from "../../../../lib/results/evidence.ts";
import { ensureHeader } from "../context.ts";
import { buildGuard } from "../view/file.ts";
import { MB, el, fmt, note } from "../view/html.ts";
import { clinvarChapterHtml } from "../../../shared/clinvar-chapter.ts";

export default {
  title: "Has anyone linked it to a condition? — ClinVar",
  blurb: `the catalogue of claims, its classifications and how much to trust each`,
  why: `ClinVar is where labs and researchers file what they have seen: "this exact variant, in
          this gene, and here is what we concluded about it." Each entry is a <em>claim</em> with a
          confidence rating, not a fact. This chapter loads a small public summary into your
          browser and shows examples before we compare it with your file.`,
  async run(out: HTMLElement, { signal, onStatus }: ChapterOptions = {}): Promise<boolean | void> {
    await ensureHeader();
    if (!buildGuard(out)) return false; // picks the catalogue for this file's build
    const cat = await loadCatalog(signal, onStatus);
    out.append(
      el(
        "div",
        "clinvar-chapter",
        clinvarChapterHtml(cat, {
          examples: cat.examples,
          labels: SIG_LABEL,
          meanings: SIG_MEANING,
          reviewLabels: STAR_TEXT,
        }),
      ),
    );
    out.append(
      note(`Loaded in <b>${cat.seconds.toFixed(1)} s</b>: a ${MB(cat.bytes)} summary of
        ${fmt(cat.n)} catalogue entries. Matching stays in your browser. The catalogue is
        read progressively when you open your results. Its evidence combines
        ClinVar's release and gnomAD's counts.`),
    );
  },
};
