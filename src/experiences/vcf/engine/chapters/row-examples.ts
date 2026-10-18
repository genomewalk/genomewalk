import { ensureHeader, rowPreviews } from "../runtime.ts";
import { ctx, currentBuild } from "../context.ts";
import {
  createVcfRowExamples,
  collectVcfRowExample,
  vcfRowDiagram,
  vcfRowExplanations,
} from "../row-diagram.ts";
import { streamVariants } from "../vcf.ts";
import { el } from "../view/html.ts";

export const rowExamplesChapter = {
  title: "A closer look at different types of variants",
  blurb: `reference rows, missing calls, insertions and multiple alternatives`,
  why: `Some rows match the reference, leave an answer blank, or describe a more complex
          change. Compare real examples from your file, with a standard variant alongside
          them. Follow a title for its explanation.`,
  async run(out: HTMLElement) {
    await ensureHeader();
    const source = ctx.source;
    let examples = ctx.stats?.rowExamples || rowPreviews.get(source!);
    const build = currentBuild();
    if (!examples || examples.build !== build) {
      examples = createVcfRowExamples(build);
      const preview = examples;
      const stop = Symbol("enough example rows");
      try {
        await streamVariants(source!, (fields) => {
          if (ctx.source !== source)
            throw new DOMException("The selected genome changed.", "AbortError");
          collectVcfRowExample(preview, fields);
          if (preview.records >= 50000) throw stop;
        });
      } catch (error) {
        if (error !== stop) throw error;
      }
      if (ctx.source !== source)
        throw new DOMException("The selected genome changed.", "AbortError");
      rowPreviews.set(source!, examples);
    }
    out.append(
      el(
        "div",
        "vcf-row-overview",
        vcfRowDiagram(examples, ctx.header!.columns[9], { showSummary: false }),
      ),
    );
    out.append(el("div", "vcf-count-story", vcfRowExplanations(examples)));
  },
};
