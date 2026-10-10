import type { ChapterOptions } from "../../../shared/types.ts";
import { ensureHeader, ensureStats } from "../runtime.ts";
import { el, tile, fmt, kvx, ext, SOURCES, MB } from "../view/html.ts";
import { isGvcf } from "../view/file.ts";
import { splitBar } from "../../../../components/diagrams/share-chart.ts";
import { gtCases } from "../view/genetics.ts";
import { genomeLen } from "../reference.ts";
import { ctx } from "../context.ts";

export const countsChapter = {
  title: "Count everything (one full pass)",
  blurb: `a full pass through the file: variants, quality checks, the numbers that describe you`,
  why: `Now the real work: stream the <em>entire</em> file once, tallying as we go.
          No index needed for a full scan — we just decompress block after block.
          Watch the numbers climb; this is the file describing itself. Every number
          below comes from the file alone — one pass, no external data.`,
  async run(out: HTMLElement, { onProgress }: ChapterOptions = {}) {
    await ensureHeader(); // the tiles need to know plain VCF vs gVCF
    const counting = el("div");
    out.append(counting);
    const live = el("div", "tiles");
    counting.append(live);
    if (!ctx.stats) onProgress?.(0);
    const s = await ensureStats((frac, counts) => {
      onProgress?.(frac);
      live.innerHTML =
        tile("Variants (PASS)", fmt(counts.variants)) +
        (isGvcf()
          ? tile("Hom-ref blocks", fmt(counts.homref))
          : tile("Lines read", fmt(counts.records))) +
        tile("SNPs", fmt(counts.snps)) +
        tile("Indels", fmt(counts.indels));
    });

    // ── the full-file summary, with explanations collapsed ────────────
    counting.remove();
    // Guard every ratio: a file with no depth field, no transversions or no
    // homozygous calls must show "—", not NaN or Infinity.
    const tstv = s.tv ? s.ti / s.tv : NaN,
      hethom = s.hom ? s.het / s.hom : NaN,
      depth = s.dpN ? s.dpSum / s.dpN : NaN;
    const rsPct = s.variants ? (100 * s.withId) / s.variants : 0;
    const show2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—"),
      show0 = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : "—");
    const healthy = tstv >= 1.8 && tstv <= 2.2; // whole genomes land in 2.0–2.1; exome-heavy sets a little higher

    const fact = kvx;

    const passing = fact(
      "Variants (PASS)",
      `<code>${fmt(s.variants)}</code>`,
      `<p>Variant rows accepted by the quality check: <code>PASS</code>, or a dot when
         no verdict is recorded. ${
           s.failed
             ? "Rows with a named filter failure are left out of the variant summaries in this chapter."
             : "No rows have a named filter failure."
         } The whole file, line by line:</p>
         ${splitBar([
           { label: "match stretches", n: s.homref, tone: "stone" },
           { label: "PASS variants", n: s.variants, tone: "green" },
           { label: "FAIL variants", n: s.failed, tone: "terracotta" },
         ])}`,
    );

    const edits = fact(
      "SNPs / Indels",
      `<code>${fmt(s.snps)} / ${fmt(s.indels)}</code>`,
      `<p>The kinds of edit from chapter 2. A <b>SNP</b> is a swap — one letter for another.
         An <b>indel</b> adds or removes letters. Swaps are far more common:</p>
         ${splitBar([
           { label: "SNPs (swaps)", n: s.snps, tone: "navy" },
           { label: "indels", n: s.indels, tone: "gold" },
         ])}`,
    );

    const swaps = fact(
      "Ts/Tv",
      `<code>${show2(tstv)}</code>`,
      `<p>Swaps come in two flavours. A↔G and C↔T are <b>transitions</b>: chemically easy, so
         they happen about twice as often as the other four swaps, the <b>transversions</b>.</p>
<pre class="align">transitions     A ↔ G     C ↔ T
transversions   A ↔ C     A ↔ T     G ↔ C     G ↔ T</pre>
         <p>A real human genome lands near <b>2.0</b>; random noise would give 0.5. Yours is
         <b>${show2(tstv)}</b> — ${!Number.isFinite(tstv) ? "not computable for this file" : healthy ? "healthy" : "a little off, which usually means more noise or harder-to-read regions included"}. This is the classic sanity
         check for sequencing quality, and it needs nothing but the file.</p>`,
    );

    const genotypes = fact(
      "Het / Hom",
      `<code>${show2(hethom)}</code>`,
      `<p>Take a spot where the reference has <span class="o0">A</span> and you carry a
         <span class="o1">G</span>. You have two copies, so there are two ways to carry it:
         <b>one</b> copy changed — <span class="o0">A</span> and <span class="o1">G</span>,
         called "heterozygous" — or <b>both</b> copies changed — <span class="o1">G</span> and
         <span class="o1">G</span>, "homozygous":</p>
         ${gtCases("A", "G", null, ["0/1", "1/1"])}
         <p>Across all your variants:</p>
         ${splitBar([
           { label: "A and G — one copy changed", n: s.het, tone: "blue" },
           { label: "G and G — both copies changed", n: s.hom, tone: "plum" },
         ])}
         <p>A ratio around 1.5–2 is typical for a person. Much lower can mean the parents were
         related.</p>`,
    );

    const readDepth = fact(
      "Mean depth",
      `<code>${s.dpN ? show0(depth) + "×" : "—"}</code>`,
      s.dpN
        ? `<p>On average, each variant spot was read <b>${show0(depth)}</b> times. 30× is the
             usual standard for a whole genome; more reads mean more confidence in every call.${
               depth > 120
                 ? " A number this high means the file pools reads from several sequencing runs, not one."
                 : ""
             }</p>`
        : `<p>This file does not record a read depth (<code>DP</code>) for its variants, so
             there is nothing to average. Depth is a lab-side quality measure; leaving it out
             changes nothing about which variants you carry.</p>`,
    );

    const identifiers = fact(
      "Have an rsID",
      `<code>${s.withId ? rsPct.toFixed(0) + "%" : "none"}</code>`,
      (s.withId
        ? `<p>The share of your variants already in ${ext(SOURCES.dbsnp, "dbSNP")}, the public
             catalogue of known spots (the <code>rs…</code> names from chapter 2). The other
             <b>${fmt(s.variants - s.withId)}</b> are rarer, or simply not catalogued yet — being
             uncatalogued says nothing about whether a variant matters.</p>`
        : `<p>No line in this file carries an <code>rs…</code> name: the lab did not look the
             positions up in ${ext(SOURCES.dbsnp, "dbSNP")}, the public catalogue of known spots,
             when writing it. That is a choice about the file, not a fact about the variants —
             most of them are in the catalogue all the same.</p>`) +
        `<p>This catalogue is also what the consumer testing companies rely on. Services like
         23andMe or AncestryDNA do not sequence a genome at all: they use a
         ${ext(SOURCES.arrays, "genotyping chip")} that checks a fixed panel of a few hundred
         thousand known SNPs from dbSNP, and reports your two letters at each. Their files are a
         list of rsIDs and nothing else — no indels, no depth, no quality, and nothing between the
         chosen spots. A whole-genome file like this one contains all of those spots, plus everything
         they leave out.</p>`,
    );

    // "Same as reference" stretches exist only in a gVCF. A plain VCF simply
    // does not write the matching parts down, so it can't say how much was checked.
    let reference;
    if (s.homref) {
      const genome = genomeLen(ctx.header!.meta);
      const share = genome
        ? ` — ${((100 * s.homrefBases) / genome).toFixed(0)}% of the ${(genome / 1e9).toFixed(1)} billion in the reference`
        : "";
      reference = fact(
        "Hom-ref blocks",
        `<code>${fmt(s.homref)}</code>`,
        `<p>The "same as reference" stretches — a gVCF's way of saying "checked, and identical"
           for a whole run of letters at once. These <b>${fmt(s.homref)}</b> stretches cover
           <b>${fmt(s.homrefBases)}</b> letters${share}. That is how much of the genome
           was read and found to match.</p>`,
      );
    } else {
      reference = fact(
        "Hom-ref blocks",
        "<code>none</code>",
        `<p>This is a plain VCF: it lists only the places where you differ from the reference.
           The matching stretches are not written down at all, so the file cannot say how much
           of the genome was checked — only what was found. A gVCF would add "same as
           reference" lines for those stretches.</p>`,
      );
    }

    const scan = fact(
      "Read",
      `<code>${MB(ctx.source!.bytesRead!)}</code>`,
      `<p>The whole file, in <b>${s.seconds.toFixed(0)} seconds</b> — decompressed block by
         block and thrown away as we went, so nothing had to fit in memory at once.</p>`,
    );

    for (const summary of [
      passing,
      edits,
      swaps,
      genotypes,
      readDepth,
      identifiers,
      reference,
      scan,
    ])
      out.append(summary);
  },
};
