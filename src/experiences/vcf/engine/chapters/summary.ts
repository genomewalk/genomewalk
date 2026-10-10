import type { ChapterOptions } from "../../../shared/types.ts";
import { ctx } from "../context.ts";
import { kvx, fmt, el, note } from "../view/html.ts";
import { ensureStats } from "../runtime.ts";
import {
  sexChromosomeIntro,
  sexChromosomeDiagram,
} from "../../../../components/diagrams/sex-chromosome-explanation.ts";
import { normChrom } from "../identity.ts";
import { chromosomeGallery } from "../../../../components/diagrams/chromosome-gallery.ts";

export const summaryChapter = {
  title: "What the file just told us",
  blurb: `what the counts imply — genetic sex, and the shape of your variation`,
  why: `Some facts aren't a single line — they emerge from a full scan of your file.
          This chapter prepares those counts if needed, then explores what they show.`,
  async run(out: HTMLElement, { onProgress }: ChapterOptions = {}) {
    if (!ctx.stats) onProgress?.(0);
    const s = await ensureStats((fraction) => {
      onProgress?.(fraction);
    });
    // genetic sex: a male's non-PAR X is hemizygous → almost no heterozygous calls
    const xHetRate = s.xhet / Math.max(s.xnp, 1);
    // Without any X lines there is nothing to judge from (some files stop at chromosome 22).
    // The X pattern decides: a single X shows almost no heterozygous calls. The Y
    // count only supports it — some builds (T2T) carry a Y so close to a given
    // man's that he has almost no variants on it.
    const sex = s.xnp < 200 ? null : xHetRate < 0.1 ? "Male" : "Female";
    const sexPattern = sex === "Male" ? "XY" : "XX";
    ctx.sex = sex;
    // Like every other finding, show the answer and let the reader expand its explanation.
    const sexRow = kvx(
      "Genetic sex",
      `<code>${sex ? `Likely ${sex.toLowerCase()} (${sexPattern})` : "Cannot tell"}</code>`,
      sex
        ? `${sexChromosomeIntro("vcf", sexPattern)}
           ${sexChromosomeDiagram(sexPattern, "vcf")}
           <p>Of the <b>${fmt(s.xnp)} X records</b> checked here,
           <b>${fmt(s.xnp - s.xhet)}</b> report one allele or matching alleles. ${
             s.xhet
               ? `<b>${fmt(s.xhet)}</b> have two different alleles.`
               : "None have two different alleles."
           }</p>
           <p>${s.y ? `<b>${fmt(s.y)} Y variant rows</b> are also listed in this file.` : "No Y variant rows are listed in this file."}
           The X calls suggest a <b>likely ${sex.toLowerCase()} (${sexPattern})</b> pattern.</p>`
        : `<p>This file has ${
            s.xnp
              ? `only <b>${fmt(s.xnp)}</b> lines on the X chromosome, too few to
           read a pattern from`
              : "no lines on the X chromosome, so there is no pattern to read"
          }. Sex is inferred from how the X behaves —
           a single X (male) shows almost no heterozygous calls — and this file
           ${s.xnp ? "barely covers it" : "stops at chromosome 22"}.</p>`,
    );
    out.append(sexRow);
    // per-chromosome distribution
    // Keep every chromosome visible, including those with no passing variants.
    const counts: Record<string, number> = {};
    for (const [c, n] of Object.entries(s.chrom))
      counts[normChrom(c)] = (counts[normChrom(c)] || 0) + n;
    const ALL = [...Array(22)].map((_, i) => String(i + 1)).concat(["X", "Y", "MT"]);
    const chr = ALL.map((c): [string, number] => [c, counts[c] || 0]);
    const missing = chr.filter(([, n]) => !n).map(([c]) => c);
    out.append(el("div", "sub", "Reported variant rows per chromosome:"));
    out.append(
      el("div", null, chromosomeGallery(Object.fromEntries(chr), { unit: "variant rows" })),
    );
    if (missing.length)
      out.append(
        el(
          "p",
          "s-why",
          `${missing.length === 1 ? "One piece has" : `${missing.length} pieces have`} no
        lines at all in this file: <b>${missing.join(", ")}</b>. That is a choice the lab made
        about what to include — not a sign that those chromosomes are missing from you.`,
        ),
      );
    out.append(
      note(`That's the end of <b>part one</b>: a genome file, read only against itself,
        already yields quality, sex, structure, and your genotype anywhere. <b>Part two</b> brings
        two public catalogues <em>to</em> your browser — and still, nothing leaves it.`),
    );
  },
};
