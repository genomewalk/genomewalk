import type { ChapterOptions } from "../../../shared/types.ts";
import { ensureHeader } from "../runtime.ts";
import { buildGuard } from "../view/file.ts";
import { loadCatalog } from "../catalogue.ts";
import { el, note, MB, fmt } from "../view/html.ts";
import { clinvarChapterHtml } from "../../../shared/clinvar-chapter.ts";
import { loadClinvarExamples } from "../../../../lib/catalogues/clinvar-examples.ts";
import { SIG_LABEL, SIG_MEANING, STAR_TEXT } from "../../../../lib/results/evidence.ts";

export const clinvarChapter = {
  title: "Has anyone linked it to a condition? — ClinVar",
  blurb: `the catalogue of claims, its classifications and how much to trust each`,
  why: `ClinVar is where labs and researchers file what they have seen: "this exact variant, in
          this gene, and here is what we concluded about it." Each entry is a <em>claim</em> with a
          confidence rating, not a fact. This chapter loads a compact catalogue index into your
          browser and shows what is in it before we look anything up.`,
  async run(out: HTMLElement, { signal, onStatus }: ChapterOptions = {}) {
    await ensureHeader();
    if (!buildGuard(out)) return; // picks the catalogue for this file's build
    const cat = await loadCatalog(signal, onStatus);
    const examples = await loadClinvarExamples(cat, signal, onStatus);
    out.append(
      el(
        "div",
        "clinvar-chapter",
        clinvarChapterHtml(cat, {
          examples,
          labels: SIG_LABEL,
          meanings: SIG_MEANING,
          reviewLabels: STAR_TEXT,
        }),
      ),
    );
    out.append(
      note(`Loaded in <b>${cat.seconds.toFixed(1)} s</b>: a ${MB(cat.bytes)} index covering
        ${fmt(cat.n)} catalogue keys. Matching stays in your browser; only the compressed
        catalogue blocks needed for your matches are downloaded. The index and catalogue are
        built offline from ClinVar's release and gnomAD's counts.`),
    );
  },
};
