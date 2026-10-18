import { ctx, currentBuild } from "../context.ts";
import { readHeader } from "../vcf.ts";
import { headerPreviews, knownSex } from "../runtime.ts";
import { readHeaderDataExamples } from "../header-data-examples.ts";
import {
  selectHeaderField,
  headerFieldExample,
  headerFilterExamples,
} from "../header-field-example.ts";
import { kvx, el, ext, SOURCES, fmt, escape, tile } from "../view/html.ts";
import { headerDiagram } from "../header-diagram.ts";
import { chrRank, sexFigure, unknownFigure, chromoSvg } from "../view/genetics.ts";
import { scrollCue } from "../../../../lib/view/file-excerpt.ts";

export const headerChapter = {
  title: "The file introduces itself",
  blurb: `the header: which reference build, who made it, the chromosome map`,
  why: `A VCF begins with a <b>header</b>: <code>##</code> lines describing the file,
          followed by a <code>#CHROM</code> line naming its columns. It tells us which
          <b>reference build</b> the positions use and how to read the data that follows.
          We only need the start of the file to explore it.`,
  async run(out: HTMLElement) {
    const source = ctx.source;
    const assertCurrent = () => {
      if (ctx.source !== source)
        throw new DOMException("The selected genome changed.", "AbortError");
    };
    const header = await readHeader(source!);
    assertCurrent();
    ctx.header = header;
    const meta = ctx.header.meta;
    let examples = headerPreviews.get(source!);
    if (!examples) {
      examples = await readHeaderDataExamples(source!, selectHeaderField(meta), { assertCurrent });
      assertCurrent();
      headerPreviews.set(source!, examples);
    }
    // pull a value out of a "##key=value" line, if present
    const val = (key: string) => {
      const l = meta.find((x) => x.startsWith("##" + key + "="));
      return l ? l.slice(key.length + 3) : null;
    };
    const headerDetail = (id: string, title: string, value: string, body: string) => {
      const card = kvx(title, value, body);
      card.id = id;
      return card;
    };
    out.append(el("div", "header-overview", headerDiagram(ctx.header)));
    out.append(el("div", "sub", "Explore the header:"));

    const version = val("fileformat") || "?"; // e.g. VCFv4.2
    const made = val("source"); // who produced it
    const date = val("fileDate"); // when

    // Use reference names and chromosome lengths together; disagreements must
    // remain visible instead of silently picking one piece of evidence.
    const stated = val("reference"); // e.g. GRCh38.p13 (may be missing)
    const build = currentBuild();
    const shown = build !== "unknown" ? build : stated || "(not stated)";
    const BUILD_TEXT = {
      GRCh38: `${ext(SOURCES.build["GRCh38"]!, "<code>GRCh38</code>")} is ${ext(SOURCES.grc, "Genome Reference Consortium")}
                 human build 38 (2013), also called <code>hg38</code>.`,
      GRCh37: `${ext(SOURCES.build["GRCh37"]!, "<code>GRCh37</code>")} is ${ext(SOURCES.grc, "Genome Reference Consortium")}
                 human build 37 (2009), also called <code>hg19</code>. Many labs still use it. Its
                 positions differ from the newer GRCh38, so the build name matters whenever two files
                 are compared.`,
      "T2T-CHM13": `${ext(SOURCES.build["T2T-CHM13"]!, "<code>T2T-CHM13</code>")} is the 2022
                 "telomere-to-telomere" assembly — the first with no gaps. Most catalogues have not
                 moved to it yet.`,
      NCBI36: `NCBI36, also called <code>hg18</code> or build 36, is an older human reference.
                 Genomewalk’s catalogues do not support matching on this build.`,
      conflicting: `The header gives conflicting build information. Catalogue matching is unavailable.`,
      unknown: `We could not identify the build from this file’s reference metadata.
                 Catalogue matching is unavailable.`,
    };
    const howKnown = `We check reference names, assembly labels and declared chromosome lengths in the header.
      If these do not identify a build, we ask you before catalogue matching. We do not guess.
      If you do not know, you can still explore the file without catalogue matching.
      ${ctx.selectedBuild ? `<b>Selected by you:</b> ${escape(ctx.selectedBuild)}. The file’s metadata did not identify its build.` : ""}
      ${stated ? `The <code>##reference</code> line says <code>${escape(stated)}</code>.` : ""}`;
    out.append(
      headerDetail(
        "reference-build",
        "Reference build",
        `<code>${escape(shown)}</code>${ctx.selectedBuild ? " · Selected by you" : ""}`,
        `<div class="reference-detail">
           <p>A VCF does not store your whole genome. It stores only the places where your
           genome differs from a <b>reference build</b> — a publicly maintained map of one human
           genome that scientists use as a shared coordinate system. ${BUILD_TEXT[build]}</p>
           <p>${howKnown}</p>
           <p>Line the two up and only the mismatches matter:</p>
<div class="file-excerpt"><pre class="align" role="region" aria-label="Your DNA aligned with the reference sequence" tabindex="0">position   1 2 3 4 5 6 7 8
reference  A C G <i>T</i> A G T <i>G</i>
you        A C G <i>A</i> A G T <i>T</i></pre>${scrollCue}</div>
           <p>Two spots differ, so the file gets exactly two lines:</p>
<div class="file-excerpt"><pre class="align" role="region" aria-label="Two VCF rows for differences from the reference" tabindex="0">POS 4     REF <i>T</i>   ALT <i>A</i>
POS 8     REF <i>G</i>   ALT <i>T</i></pre>${scrollCue}</div>
           <p>The six matching positions are never written down. That is why a VCF is small
           enough to open in a browser.</p>
         </div>`,
      ),
    );
    out.append(
      headerDetail(
        "header-format",
        "VCF format version",
        `<code>${escape(version)}</code>`,
        `<p><b>VCF</b> stands for Variant Call Format — the agreed way to write a genome file.
         The version number says which edition of the rules this file follows, so any
         program knows how to read it. The rules are public —
         the ${ext(SOURCES.vcfSpec(version), `${escape(version)} specification`)}.</p>
         <p><code>##fileformat</code> declares the version. The other header lines describe
         this file using those rules; their values do not determine the version.</p>`,
      ),
    );
    if (made || date)
      out.append(
        headerDetail(
          "header-origin",
          "File origin",
          escape(made || date),
          `${made ? `<p id="header-made-by"><b>Made by ${escape(made)}.</b> The header’s <code>##source</code> names the lab or software that produced this file.</p>` : ""}
         ${date ? `<p id="header-date-created"><b>Created ${escape(date)}.</b> <code>##fileDate</code> records when the file was generated, not when your DNA was collected.</p>` : ""}`,
        ),
      );

    const fieldExample = headerFieldExample(meta, examples.field, ctx.header.columns);
    if (fieldExample)
      out.append(
        headerDetail(
          "header-fields",
          "Field definitions",
          `<code>${escape(fieldExample.label)}</code>`,
          fieldExample.html,
        ),
      );

    // ── Sample ID: the '#CHROM' line ends with one column per person ──────
    const samples = ctx.header.columns.slice(9);
    out.append(
      headerDetail(
        "header-sample",
        "Columns & sample ID",
        `<code>${escape(samples[0] || "(none)")}</code>`,
        `<p>The <code>#CHROM</code> line ends the header and names the columns used by every
         data row: chromosome, position, alleles, quality, filters and annotations.</p>
         <p>A sample ID is the label the lab gave that sample. It is not a genotype or a finding.
         ${samples.length === 1 ? "This file has one sample column." : `This file has ${samples.length} sample columns.`}</p>`,
      ),
    );

    // ── Quality filters: '##FILTER=<ID=…,Description="…">' lines ─────────
    // PASS is built into the format: a file may declare it, but need not.
    // Show it first either way — it is the verdict every other one is measured against.
    const filters = meta
      .filter((l) => l.startsWith("##FILTER="))
      .map((l) => ({
        id: (l.match(/ID=([^,>]+)/) || [])[1],
        desc: (l.match(/Description="([^"]*)"/) || [])[1] || "",
      }));
    const declaresPass = filters.some((f) => f.id === "PASS");
    const verdicts = [
      ...(declaresPass ? [] : [{ id: "PASS" }]),
      ...filters.filter((f) => f.id === "PASS"),
      ...filters.filter((f) => f.id !== "PASS"),
    ];
    out.append(
      headerDetail(
        "header-filters",
        "Quality filters",
        `<code>${verdicts.map((f) => escape(f.id)).join("</code> <code>")}</code>`,
        `<p>Each data line has its own <code>FILTER</code> result. <code>PASS</code> means it passed
         all applied quality checks; a filter name identifies a check it failed. This describes
         the quality of the call, not your health.</p>
         ${headerFilterExamples(examples, filters, ctx.header.columns)}`,
      ),
    );

    // ── Genome map: '##contig=<ID=…,length=…>' lines, one per reference piece ──
    const contigs = meta
      .filter((l) => l.startsWith("##contig="))
      .map((l) => {
        const m = l.match(/ID=([^,>]+)(?:,length=(\d+))?/);
        return m ? { id: m[1]!, len: +m[2]! || 0, line: l } : null;
      })
      .filter((value) => value != null);
    const isMain = (id: string) => /^([1-9]|1[0-9]|2[0-2]|X|Y|MT|M)$/.test(id.replace(/^chr/, ""));
    const chroms = contigs.filter((c) => isMain(c.id));
    if (!chroms.length) {
      out.append(
        headerDetail(
          "header-genome-map",
          "Genome map",
          "Not listed in the header",
          `<p>This file does not declare primary chromosomes in <code>##contig</code> lines.
          You can still explore its records, but we cannot draw a chromosome map from the header.</p>`,
        ),
      );
    } else {
      const mapExample = chroms.find((c) => c.id.replace(/^chr/, "") === "1") || chroms[0];
      const extras = contigs.length - chroms.length;
      const hasMT = chroms.some((c) => /^(chr)?(MT|M)$/.test(c.id));
      const hasXY = chroms.some((c) => /^(chr)?X$/.test(c.id));
      const total = chroms.reduce((s, c) => s + c.len, 0);
      const longest = chroms.reduce((a, b) => (b.len > a.len ? b : a), chroms[0]!);
      const shortest = chroms
        .filter((c) => !/^(chr)?(MT|M)$/.test(c.id))
        .reduce((a, b) => (b.len < a.len ? b : a), chroms[0]!);
      // Draw the chromosomes to scale: one bar each, height = length / longest.
      // MT is ~0.007% of chr 1, so it gets a 2% floor just to stay visible.
      const sorted = [...chroms].sort((a, b) => chrRank(a.id) - chrRank(b.id));
      const bar = (c: { len: number; id: unknown }) =>
        `<i style="height:${Math.max(2, (c.len / longest.len) * 100).toFixed(1)}%" title="${escape(c.id)}: ${c.len.toLocaleString()} letters"></i>`;
      const label = (c: { id: string }) => `<span>${escape(c.id.replace(/^chr/, ""))}</span>`;
      // X and Y are boxed together as pair 23. The figure inside is you — but only
      // once step 4 has worked it out from the data; the header alone can't say.
      const isXY = (c: { id: string }) => /^(chr)?[XY]$/.test(c.id);
      const before = sorted.filter((c) => chrRank(c.id) < 23),
        xy = sorted.filter(isXY),
        after = sorted.filter((c) => chrRank(c.id) > 24);
      const you = knownSex();
      const pairTag = `<div class="karyo-pair-tag">${you ? sexFigure(you, true) : unknownFigure}<span>23</span></div>`;
      const karyo = `<div class="diagram-scroll" role="region" aria-label="Reference chromosome lengths, drawn to scale" tabindex="0"><div class="karyo">
        <div class="karyo-bars">${before.map(bar).join("")}<div class="karyo-pair">${pairTag}${xy.map(bar).join("")}</div>${after.map(bar).join("")}</div>
        <div class="karyo-labels">${before.map(label).join("")}<div class="karyo-pair-labels">${xy.map(label).join("")}</div>${after.map(label).join("")}</div>
      </div></div><p class="diagram-scroll-hint">↔ Scroll sideways to see every chromosome label.</p>`;
      // Turn "3 billion" into something you can picture.
      const pages = Math.round((total / 3000 / 1e6) * 10) / 10; // 3,000 letters per printed page
      const years = Math.round(total / 31557600); // one letter per second, nonstop
      const scale = `<div class="tiles">
        ${tile("Letters", `${(total / 1e9).toFixed(2)} billion`, "each one A, C, G or T")}
        ${tile("Printed", `≈ ${pages} million pages`, "3,000 letters per page")}
        ${tile("Read aloud", `≈ ${years} years`, "one letter per second, nonstop")}
      </div>`;
      out.append(
        headerDetail(
          "header-genome-map",
          "Genome map",
          `${chroms.length} chromosomes · ${(total / 1e9).toFixed(2)} billion bases`,
          `<p>Each <code>##contig</code> header line declares a reference chromosome or other DNA sequence
         that the data rows can refer to. For example, this line from your header:</p>
         ${
           mapExample
             ? `<div class="header-field-example"><pre><code>${escape(mapExample.line)}</code></pre></div>
         <p><code>ID=${escape(mapExample.id)}</code> gives its name; <code>length=${mapExample.len}</code>
         says it spans <b>${fmt(mapExample.len)} DNA letters</b>. A data row with <code>CHROM=${escape(mapExample.id)}</code>
         gives a position along this same reference sequence. We use these declared lengths to scale the bars below.</p>`
             : ""
         }
         <p>Your DNA is organized into <b>chromosomes</b>. You carry the autosomes <b>twice</b> — one copy from your
         mother, one from your father. Each copy is one very long strand of letters — A, C, G
         and T — millions of them in a row.</p>
         <div class="chromo">
           ${chromoSvg}
           <span class="chromo-arrow">unwound →</span>
           <div class="chromo-strand">
             <div class="diagram-scroll" role="region" aria-label="Aligned maternal and paternal DNA letters" tabindex="0"><div class="strand-rows">
             <div class="strand"><span class="who m">from your mother</span><code>…ACGTAGTGCAT<i class="m">T</i>GACCGTA<i class="m">A</i>GCTTGCA…</code></div>
             <div class="strand"><span class="who f">from your father</span><code>…ACGTAGTGCAT<i class="f">C</i>GACCGTA<i class="f">G</i>GCTTGCA…</code></div>
             </div></div>
             <p class="diagram-scroll-hint">↔ Scroll sideways to compare the aligned DNA letters.</p>
             <span>two copies of the same chromosome — nearly identical, differing at a few spots</span>
           </div>
         </div>
         <p>Here are the main reference sequences listed in the header, drawn to scale:</p>
         ${karyo}
         <p>Chromosome <b>${escape(longest.id)}</b> is the longest (${(longest.len / 1e6).toFixed(0)} million letters);
         <b>${escape(shortest.id)}</b> is the shortest (${(shortest.len / 1e6).toFixed(0)} million).${
           hasMT
             ? ` <b>MT</b>, the mitochondrial sequence inherited from your mother, is so small it is barely a line.`
             : ""
         }</p>
         ${
           hasXY
             ? `<p>Two of the bars, <b>X</b> and <b>Y</b>, are the sex chromosomes. Everyone gets an X
              from their mother; the one from the father decides:</p>`
             : `<p>This file lists no sex chromosomes — it stops at chromosome 22 — so the box for
              pair 23 is empty. <b>X</b> and <b>Y</b> are the ones that decide sex. Everyone gets
              an X from their mother; the one from the father decides:</p>`
         }
         <div class="sexes${you ? " known" : ""}">
           <div class="sex${you === "Female" ? " you" : ""}">${sexFigure("Female", you === "Female")}<b>X X</b><span>female${you === "Female" ? " · you" : ""}</span></div>
           <div class="sex${you === "Male" ? " you" : ""}">${sexFigure("Male", you === "Male")}<b>X Y</b><span>male${you === "Male" ? " · you" : ""}</span></div>
           <p class="sex-note">${
             you
               ? `The chart shows the reference genome, which carries both X and Y so it can serve
                everyone. Step 4 read <em>your</em> data and found: <b>${you.toLowerCase()}</b>.`
               : `The chart shows the reference genome, which carries both X and Y so it can serve
                everyone. Whether <em>you</em> have a Y is not in the header — step 4 reads your
                actual data to find out, and the 👤 above will become you.`
           }</p>
         </div>
         <p>Together they add up to <b>${total.toLocaleString()}</b> letters. How much is that?</p>
         ${scale}
         ${
           extras
             ? `<p>The file also lists <b>${extras.toLocaleString()}</b> tiny leftover scraps of DNA
         that do not belong to any chromosome. We ignore them.</p>`
             : ""
         }`,
        ),
      );
    }

    // ── File type: is this a plain VCF or a gVCF? Clues in the header ────
    const clues = meta.filter(
      (l) =>
        l.startsWith("##FORMAT=<ID=MIN_DP") || l.startsWith("##INFO=<ID=END,") || /gvcf/i.test(l),
    );
    const isGvcf = clues.length > 0;
    out.append(
      headerDetail(
        "header-file-type",
        "File type",
        isGvcf ? "gVCF" : "VCF",
        isGvcf
          ? `<p>There are two kinds of these files. A plain <b>VCF</b> only lists the places where
             you differ from the reference. A <b>gVCF</b> — this file — also notes the stretches
             where you <em>match</em> it. So it can tell apart "we checked, and you are the same"
             from "we never checked". Anything the file does not mention at all was not read.</p>
             <p><b>But hold on — didn't we say the file stores only the differences?</b> It still
             mostly does. The trick is that a matching stretch is written as one line — a start
             and an end — not letter by letter. Take the same example as before:</p>
<div class="file-excerpt"><pre class="align" role="region" aria-label="Reference and sample sequences for the gVCF example" tabindex="0">position   1 2 3 4 5 6 7 8
reference  A C G <i>T</i> A G T <i>G</i>
you        A C G <i>A</i> A G T <i>T</i></pre>${scrollCue}</div>
             <p>A plain VCF writes two lines, one per difference. A gVCF writes four:</p>
<div class="file-excerpt"><pre class="align" role="region" aria-label="gVCF rows for matching stretches and differences" tabindex="0">POS 1–3   same as reference
POS 4     REF <i>T</i>   ALT <i>A</i>
POS 5–7   same as reference
POS 8     REF <i>G</i>   ALT <i>T</i></pre>${scrollCue}</div>
             <p>Six matching letters cost two lines, not six. In a real genome the matching
             stretches run for hundreds of letters at a time, so billions of matching letters
             fit into a few million lines — about as many lines as the differences themselves.
             Bigger than a plain VCF, but nowhere near "everything".</p>
             <p class="mini">The format comes from the ${ext(SOURCES.gvcf, "GATK")} toolkit.</p>`
          : `There are two kinds of these files. This is a plain <b>VCF</b>: it only lists the
             places where you differ from the reference. If a place is missing, you cannot
             tell whether you match the reference there or it was simply never read.`,
      ),
    );

    out.append(
      el(
        "p",
        "s-why",
        "This chapter uses the header and a short preview of data rows to show how the definitions are used.",
      ),
    );
  },
};
