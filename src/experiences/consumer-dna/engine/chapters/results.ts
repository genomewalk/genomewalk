import type { ChapterOptions } from "../../../shared/types.ts";
import { loadCatalog } from "../catalogue.ts";
import { findMatches, resultsWithoutConflicts } from "../matching.ts";
import { ctx, ensureHeader } from "../context.ts";
import { buildGuard } from "../view/file.ts";
import { el, fmt, note, tile } from "../view/html.ts";
import { matchList } from "../view/result-list.ts";
import { matchingIssues } from "../view/matching.ts";
import { resultsDisclaimer } from "../../../shared/results-disclaimer.ts";
import type { LookupIssue } from "../../types.ts";
import { loadLookup } from "../../lookup/index.ts";

export default {
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
    if (source!.format === "consumer")
      out.append(
        note(
          `Your ${source!.label} export provides genotype calls without per-call quality measurements. ClinVar stars describe the classification, not the accuracy of your call. This release compares complete autosomal single-base calls; other chromosomes and I/D codes are not interpreted.`,
        ),
      );
    if (!ctx.matches) {
      const cat = await loadCatalog(signal, onStatus);
      checkCurrent();
      onStatus?.("Checking marker identifiers…");
      const lookup = await loadLookup(cat.build, "catalog", cat.source, signal);
      checkCurrent();
      const issues: LookupIssue[] = [];
      onProgress?.(0);
      const matches = await findMatches(
        source!,
        cat,
        (fraction: number) => {
          checkCurrent();
          onProgress?.(fraction);
        },
        signal,
        lookup,
        (issue) => issues.push(issue),
        onStatus,
      );
      checkCurrent();
      ctx.matches = matches;
      ctx.matchIssues = issues;
    }
    const { hits, skippedSites } = resultsWithoutConflicts(ctx.matches);
    if (skippedSites)
      out.append(
        note(
          `<b>${fmt(skippedSites)} ${skippedSites === 1 ? "site was" : "sites were"} left out because repeated file calls were inconsistent.</b> We do not choose one call over another. The rows remain included in your file counts; see <a href="/chapter/3">Rows and sites in chapter 3</a>.`,
        ),
      );
    out.append(
      el(
        "p",
        "s-why",
        `Matches use your file's reference build, chromosome and position,
        then check the reported DNA letters. Where an rsID is indexed, we also check that
        it points to the same location. Missing or unindexed IDs do not prevent a coordinate match.`,
      ),
    );
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
    if (ctx.matchIssues.length) out.append(matchingIssues(ctx.matchIssues, ctx.header!.columns));
    if (!hits.length) {
      out.append(
        note(
          "No unambiguous supported allele remains to show from this catalogue. This is not a negative health result.",
        ),
      );
      return true;
    }
    out.append(el("div", "sub", `Explore ${fmt(hits.length)} results:`));
    out.append(matchList(hits));
    out.append(
      note(`Every row comes from an exact allele lookup in this tab.
        Your genome is not sent to a server. The results cover selected ClinVar classifications;
        benign, likely benign and uncertain-significance labels do not qualify a record on their own.
        Records with an independent supported label, such as drug response, are retained with all their original classifications.
        Population frequencies, where available, belong to the matched allele.
        Incomplete calls, sites with inconsistent repeated calls and identifier disagreements are excluded from these results;
        a missing result is not a negative health result.`),
    );
    return true;
  },
};
