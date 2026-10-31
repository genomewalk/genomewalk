import type { ChapterOptions } from "../../../shared/types.ts";
import { ctx } from "../context.ts";
import { ensureHeader } from "../runtime.ts";
import { note, el, tile, fmt } from "../view/html.ts";
import { buildGuard, sampleNote } from "../view/file.ts";
import { loadCatalog } from "../catalogue.ts";
import { findMatches } from "../matching.ts";
import { matchList } from "../view/result-list.ts";
import { resultsDisclaimer } from "../../../shared/results-disclaimer.ts";

export const resultsChapter = {
  title: "Your results",
  blurb: `your variants, their claims, and the sources behind them`,
  why: `Your variants, compared with ClinVar's public catalogue. Explore the matches with
          their classification, review stars, population frequency and your genotype.
          Browse disease evidence, drug response, traits and associations separately. You can return to the guide at any time.`,
  async run(out: HTMLElement, { signal, onProgress, onStatus }: ChapterOptions = {}) {
    const source = ctx.source;
    const checkCurrent = () => {
      signal?.throwIfAborted();
      if (ctx.source !== source)
        throw new DOMException("The selected genome changed.", "AbortError");
    };
    await ensureHeader();
    checkCurrent();
    const supported = buildGuard(out);
    out.append(note(resultsDisclaimer));
    if (!supported) return false;
    const sn = sampleNote();
    if (sn) out.append(sn);
    if (!ctx.matches) {
      const cat = await loadCatalog(signal, onStatus);
      checkCurrent();
      onProgress?.(0);
      const matches = await findMatches(
        source!,
        cat,
        (fraction) => {
          checkCurrent();
          onProgress?.(fraction);
        },
        signal,
        onStatus,
      );
      checkCurrent();
      ctx.matches = matches;
    }
    const hits = ctx.matches;
    out.append(
      el(
        "div",
        null,
        `<div class="tiles">
        ${tile("Variants", fmt(hits.length), "distinct positions and alleles with a result")}
        ${tile("Genes", fmt(new Set(hits.map((h) => h.gene).filter(Boolean)).size), "named in the matched records")}
        ${tile("With references", fmt(hits.filter((h) => h.pmids.length).length), "with publications linked by ClinVar")}
      </div>`,
      ),
    );
    if (!hits.length) {
      out.append(note("No catalogue entry matched a confident variant call in this file."));
      return true;
    }
    out.append(el("div", "sub", `Explore ${fmt(hits.length)} results:`));
    out.append(matchList(hits));
    out.append(
      note(`Every row comes from an exact allele lookup in this tab.
        Your genome is not sent to a server. The results cover selected ClinVar classifications;
        benign, likely benign and uncertain-significance labels do not qualify a record on their own.
        Records with an independent supported label, such as drug response, are retained with all their original classifications.
        Failed-quality calls are excluded and incomplete genotypes are flagged; a missing
        row is not a negative health result. One limit to know: an
        insertion or deletion can be written in more than one way, and the lookup needs an exact
        key, so a few real matches of that kind can be missed.`),
    );
    return true;
  },
};
