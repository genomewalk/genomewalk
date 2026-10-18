import { ensureHeader } from "../runtime.ts";
import { escape, kvx, el, note, ext, SOURCES } from "../view/html.ts";
import { copiesSvg, gtCases, chromoRow } from "../view/genetics.ts";
import { ctx } from "../context.ts";
import { firstLines, firstVariant } from "../sampling.ts";
import { teachingTable } from "../../../../lib/view/teaching-table.ts";
import { fileExcerpt, fileFields } from "../../../../lib/view/file-excerpt.ts";

export const variantLineChapter = {
  title: "Lets learn to read a variant line",
  blurb: `one line dissected, column by column, and how to read any genotype`,
  why: `Each data line is one place your DNA was examined — ten tab-separated columns.
          We start with one made-up line, learn the trick for reading any line, apply it
          to two examples, and then look at the first real rows from your file.`,
  async run(out: HTMLElement) {
    // Make sure the header is available even if the user reached this chapter
    // directly (e.g. after a refresh) without re-running chapter 1 first.
    await ensureHeader();

    // ── 1. a line, cold ───────────────────────────────────────────────────
    // Two made-up but realistic lines with every column filled in: a plain
    // swap, and a real dbSNP insertion. Shown first with no explanation on
    // purpose — the point is that the letters *you* have are not written down.
    const COLS = ["CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO", "FORMAT", "YOU"];
    const columnTarget = (key: string) =>
      `vcf-column-${["INFO", "FORMAT", "YOU", "INFO · FORMAT · YOU"].includes(key) ? "info-format-you" : key.toLowerCase()}`;
    const columnLink = (key: string, label = key, cls = "") =>
      `<a class="vcf-column-link ${cls}" href="#${columnTarget(key)}">${escape(label)}</a>`;
    const columnDetail = (key: string, value: string, detail: string, raw?: string[]) => {
      const container = kvx(key, value, detail, raw);
      container.id = columnTarget(key);
      container.className += " vcf-column-detail";
      return container;
    };
    const card = (vals: string[]) =>
      el(
        "div",
        "rawline sample-row file-row",
        fileFields(
          COLS.map((k, i) => ({ labelHtml: columnLink(k, k, "cell-k"), value: vals[i]! })),
          "VCF example line, all ten columns",
        ),
      );
    const swap = [
      "11",
      "66560624",
      "rs1815739",
      "C",
      "T",
      "221.7",
      "PASS",
      "DP=38;MQ=60;AC=1;AN=2",
      "GT:DP:GQ:AD:PL",
      "0/1:38:99:19,19:255,0,255",
    ];
    const ins: [string, string, string, string, string, string, string, string, string, string] = [
      "1",
      "10177",
      "rs367896724",
      "A",
      "AC",
      "152.3",
      "PASS",
      "DP=45;MQ=60;AC=1;AN=2",
      "GT:DP:GQ:AD:PL",
      "0/1:45:99:22,23:180,0,210",
    ];

    out.append(el("div", "sub", "A line from a genome file:"));
    out.append(card(swap));
    out.append(
      el(
        "p",
        "s-why",
        `Ten columns — and nowhere does it say which letters <em>you</em>
        have. So how do you read it?`,
      ),
    );

    // ── 2. how to read any line: an edit against the reference, applied to your two copies ──
    out.append(el("div", "sub", "How to read any line:"));
    out.append(
      el(
        "div",
        "primer",
        `
        <p>Every line is a small <b>edit instruction</b> against the reference. There are only
        three kinds of edit:</p>
        ${teachingTable(
          "Three kinds of variant edit",
          [
            { label: "Edit", className: "fk" },
            { label: "What REF and ALT look like", className: "fd" },
            { label: "Example", className: "fv" },
          ],
          [
            ["Swap", "one letter for another — same length", "REF=A &nbsp; ALT=C"],
            ["Insertion", "extra letters — ALT is longer than REF", "REF=A &nbsp; ALT=AC"],
            ["Deletion", "letters removed — REF is longer than ALT", "REF=AT &nbsp; ALT=A"],
          ],
        )}
        <div class="aside">
          <p>REF and ALT list the <b>options</b>; <code>GT</code> tells us which allele each copy
          carries. At a typical site on chromosomes <b>1–22</b>, you inherit one copy from each
          parent. <b>Note:</b> GT order alone does not tell us which came from your mother or father.</p>
          <figure class="aside-fig gt-copies-figure">${copiesSvg}</figure>
        </div>
        <figure class="gt-reading-diagram" aria-label="Reading GT with REF A and ALT C">
          <figcaption class="gt-reading-key">
            <div class="gt-reading-options">
              <span class="o0">REF <b>A</b></span>
              <span class="o1">ALT <b>C</b></span>
            </div>
            <span class="gt-reading-order">GT = copy 1 / copy 2</span>
          </figcaption>
          ${gtCases("A", "C")}
        </figure>`,
      ),
    );
    out.append(
      note(`That is the whole trick: REF is option 0, ALT is option 1, and GT is the pair
        of picks. It works the same for insertions and deletions — an option is simply more or
        fewer letters.`),
    );

    // ── 3. now apply it to the line we started with ──────────────────────
    out.append(el("div", "sub", "Now let’s read that line:"));
    out.append(card(swap));
    out.append(
      note(`On chromosome <b>11</b> at position <b>66,560,624</b>, the reference has <b>C</b>
        and the alternative is <b>T</b> — a swap. GT is <code>0/1</code>, so one of your copies has
        <b>C</b> and the other has <b>T</b>. The caller is confident (QUAL <b>221.7</b>, <b>PASS</b>).
        It read the spot <b>38</b> times: <b>19</b> reads showed C and <b>19</b> showed T — exactly
        what one copy of each looks like.`),
    );

    // ── 4. one more, with a longer option ────────────────────────────────
    out.append(el("div", "sub", "One more — this time an insertion:"));
    out.append(card(ins));
    out.append(
      note(`On chromosome <b>1</b> at position <b>10,177</b>, the reference has <b>A</b> and
        the alternative is <b>AC</b> — an extra C. GT is <code>0/1</code>, so one of your copies has
        <b>A</b> and the other has <b>AC</b>. The caller is confident (QUAL <b>152.3</b>, <b>PASS</b>).
        It saw the spot <b>45</b> times: <b>22</b> reads matched the reference and <b>23</b> had the
        insertion — one copy of each.`),
    );

    // ── 5. column by column, using the insertion line ────────────────────
    // One expandable row per column (like chapter 1). Each opens into a
    // fuller explanation with a small diagram built from the sample line.
    // Where a column's meaning is declared in the header (FILTER, INFO,
    // FORMAT), the real declarations are pulled from the file and shown.
    const [sCHR, sPOS, sID, sREF, sALT, sQUAL, sFILT, sINFO, sFMT, sYOU] = ins;
    const meta = ctx.header!.meta;
    const hlines = (key: string) => meta.filter((l) => l.startsWith("##" + key + "="));
    const hdr = (kind: string, id: string | undefined) =>
      meta.find((l) => l.startsWith(`##${kind}=<ID=${id},`));
    const hdrDesc = (kind: string, id: string | undefined) =>
      (hdr(kind, id)?.match(/Description="([^"]*)"/) || [])[1] || "";
    const sampleId = ctx.header!.columns[9] || "SAMPLE";
    out.append(el("div", "sub", "Column by column, using the insertion line:"));

    // CHROM — which of the 25 pieces. A row of little chromosomes, drawn to
    // scale from the header's lengths, with this one lit and the rest dimmed.
    const { names: chrNames, html: chromosHtml } = chromoRow(sCHR);
    out.append(
      columnDetail(
        "CHROM",
        `<code>${escape(sCHR)}</code>`,
        `<p>Which chromosome this line is about. This file covers ${chrNames.length} pieces, and this one is
         <b>chromosome ${escape(sCHR)}</b>${sCHR.replace(/^chr/, "") === "1" ? " — the biggest" : ""}:</p>
         ${chromosHtml}`,
      ),
    );

    // POS — how far along that chromosome
    const chrLen =
      +(meta.find((l) => l.startsWith(`##contig=<ID=${sCHR},`))?.match(/length=(\d+)/) || [])[1]! ||
      0;
    const pct = chrLen ? (+sPOS / chrLen) * 100 : 0;
    // The chromosome is one long strand of letters; POS is simply "which letter".
    // The letters around it are made up; the arrow lands on the REF letter.
    const left = "…ACGTAGTGCATTG",
      right = "CCGTAAGCTTGCA…";
    out.append(
      columnDetail(
        "POS",
        `<code>${escape(sPOS)}</code>`,
        `<p>Which letter along that chromosome, counting from its start (the first letter is
         position 1). Position <b>${(+sPOS).toLocaleString()}</b> is this one:</p>
<div class="file-excerpt"><pre class="align posline" role="region" aria-label="Position ${escape(sPOS)} in the reference sequence" tabindex="0">${left}<i class="o0">${escape(sREF)}</i>${right}
${" ".repeat(left.length)}↑
${" ".repeat(left.length - 2)}${escape(sPOS)}</pre></div>
         ${
           chrLen
             ? `<p>Chromosome ${escape(sCHR)} is <b>${chrLen.toLocaleString()}</b> letters long, so
         this is only <b>${pct.toFixed(3)}%</b> of the way along — right at the tip.</p>`
             : ""
         }`,
      ),
    );

    // ID — a catalogue number, added afterwards
    out.append(
      columnDetail(
        "ID",
        `<code>${escape(sID)}</code>`,
        `<p>${ext(`https://www.ncbi.nlm.nih.gov/snp/${escape(sID)}`, `<code>${escape(sID)}</code>`)}
         is a catalogue number from ${ext(SOURCES.dbsnp, "<b>dbSNP</b>")}, a public list of
         spots where people are known to differ. <code>rs</code> stands for
         "reference SNP"; the digits are just the entry number. The sequencer did not produce this
         name — it was added afterwards by looking each position up in the catalogue. A spot that
         is not in the catalogue gets a <code>.</code> here instead.</p>
         <p>Services like 23andMe or AncestryDNA give you exactly this and nothing more: a list of
         rsIDs with your two letters at each one, a few hundred thousand spots in all. A
         whole-genome file like yours has those same rsIDs — plus every letter in between.</p>`,
      ),
    );

    // REF — option 0
    out.append(
      columnDetail(
        "REF",
        `<code>${escape(sREF)}</code>`,
        `<p>The letter the <b>reference genome</b> has at this position —
         <span class="o0"><b>option 0</b></span>. See "How to read any line" above.</p>
         <p>One thing the word hides: the reference is not "normal". It is one particular sequence,
         stitched together from a few anonymous donors, and at any spot it carries whatever letter
         they happened to have — sometimes the letter most people have, sometimes the rarer one.
         So "differs from the reference" never means "unusual" by itself. Chapter 7 shows a spot
         where two thirds of humanity has the "alternative".</p>`,
      ),
    );

    // ALT — option 1
    out.append(
      columnDetail(
        "ALT",
        `<code>${escape(sALT)}</code>`,
        `<p>The letter(s) you have <em>instead</em> — <span class="o1"><b>option 1</b></span>. Here it
         is <b>${escape(sALT)}</b>, two letters where the reference has one: an insertion. See
         "How to read any line" above.</p>`,
      ),
    );

    // QUAL — how sure a variant exists here
    out.append(
      columnDetail(
        "QUAL",
        `<code>${escape(sQUAL)}</code>`,
        `<p>How sure the caller is that a variant exists here at all. It is on the
         ${ext(SOURCES.phred, "<b>Phred scale</b>")}: every 10 points adds another "9" of certainty.</p>
         <table class="fmt"><thead><tr><th>QUAL</th><th>Chance the variant is real</th></tr></thead><tbody>
           <tr><td class="fv">10</td><td class="fd">90%</td></tr>
           <tr><td class="fv">20</td><td class="fd">99%</td></tr>
           <tr><td class="fv">30</td><td class="fd">99.9%</td></tr>
           <tr><td class="fv">${escape(sQUAL)}</td><td class="fd">as good as certain — <b>this line</b></td></tr>
         </tbody></table>
         <p>Low scores (roughly under 20) are usually marked FAIL in the next column. A
         <code>.</code> means no score was given.</p>`,
      ),
    );

    // FILTER — the verdict, using the file's own definitions
    const declared = hlines("FILTER").map((l) => ({
      id: (l.match(/ID=([^,>]+)/) || [])[1],
      desc: (l.match(/Description="([^"]*)"/) || [])[1] || "",
    }));
    // PASS is built into the format; list it first whether or not the file declares it
    const filts = [
      ...(declared.some((f) => f.id === "PASS")
        ? []
        : [{ id: "PASS", desc: "All filters passed (built into the format)" }]),
      ...declared.filter((f) => f.id === "PASS"),
      ...declared.filter((f) => f.id !== "PASS"),
    ];
    out.append(
      columnDetail(
        "FILTER",
        `<code>${escape(sFILT)}</code>`,
        `<p>The verdict on this line. <code>PASS</code> means it cleared every quality check;
         anything else names the check it failed. The verdicts this file can give:</p>
         <div class="chips">${filts.map((f) => `<span class="chip ${f.id === "PASS" ? "ok" : "bad"}"><b>${escape(f.id)}</b>${escape(f.desc)}</span>`).join("")}</div>
         <p>A verdict is about confidence in the call — nothing about you.</p>`,
        hlines("FILTER"),
      ),
    );

    // INFO + FORMAT + YOU — one row. The lesson: a VCF can hold many people.
    // INFO is about the spot, written once per line; FORMAT is the list of
    // keys; then every person gets a column of values in that order.
    const pairs = sINFO.split(";").map((p) => {
      const [k, v] = p.split("=") as [string, string?];
      return { k, v: v ?? "" };
    });
    const fkeys = sFMT.split(":"),
      fvals = sYOU.split(":");
    const w = (s: string, n: number) => String(s).padEnd(n);
    const colw = fkeys.map((k, i) => Math.max(k.length, fvals[i]!.length) + 3);
    const gt = fvals[fkeys.indexOf("GT")] || fvals[0];
    const ref0 = `<span class="o0">${escape(sREF)}</span>`,
      alt1 = `<span class="o1">${escape(sALT)}</span>`;
    // one short plain-words reading per field, using its actual value
    const plain = (level: string, k: string, v: string) => {
      const b = `<b>${escape(v)}</b>`;
      if (level === "INFO")
        return (
          {
            DP: `${b} reads covered this spot — counting everyone in the file`,
            MQ: `${b} — how cleanly those reads mapped; 60 is the best score`,
            AC: `${b} copy carries the change — counting everyone in the file`,
            AN: `${b} copies were examined in total (2 per person)`,
          }[k] || b
        );
      switch (k) {
        case "GT":
          return `${ref0} and ${alt1} — one copy of each (see the cards above)`;
        case "DP":
          return `${b} reads covered this spot — for you`;
        case "GQ":
          return `${b} — how sure the caller is of <em>your</em> genotype; 99 is the top`;
        case "AD": {
          const [r, a] = v.split(",");
          return `<b>${escape(r)}</b> reads showed ${ref0}, <b>${escape(a)}</b> showed ${alt1} — the even split behind ${escape(gt)}`;
        }
        case "PL":
          return `one score per genotype (0/0, 0/1, 1/1); the <b>0</b> marks the most likely — here ${escape(gt)}`;
        default:
          return b;
      }
    };
    const fieldRows = [
      ...pairs.map(({ k, v }) => ({ level: "INFO", k, v })),
      ...fkeys.map((k, i) => ({ level: "FORMAT", k, v: fvals[i] ?? "" })),
    ];
    out.append(
      columnDetail(
        "INFO · FORMAT · YOU",
        `<code>${escape(sINFO)}</code> <code>${escape(sFMT)}</code> <code>${escape(sYOU)}</code>`,
        `<p>A VCF can hold <b>many people</b>. Each line describes one spot <em>once</em>, and then
         gives every person their own column of measurements. That is the split between these
         three columns:</p>
         <div class="cases">
           <div class="case"><div class="case-gt">INFO</div><code>${escape(sINFO)}</code>
             <div class="case-sum">About the <b>spot</b>. Written once per line, whoever is in the file.</div></div>
           <div class="case"><div class="case-gt">FORMAT</div><code>${escape(sFMT)}</code>
             <div class="case-sum">The <b>keys</b> — names of the per-person measurements, in order.</div></div>
           <div class="case on"><div class="case-gt">${escape(sampleId)} <span class="mut">(you)</span></div><code>${escape(sYOU)}</code>
             <div class="case-sum">Your <b>values</b>, in that order. One such column per person — this file has one.</div></div>
         </div>
         <p>Line FORMAT up with YOU and each key gets its value:</p>
<div class="file-excerpt"><pre class="align" role="region" aria-label="FORMAT keys aligned with your sample values" tabindex="0">FORMAT   ${fkeys.map((k, i) => w(k, colw[i]!)).join("")}   ← keys
YOU      ${fvals.map((v, i) => w(v, colw[i]!)).join("")}   ← values</pre></div>
         <p>All the fields on this line, with the header's own description of each:</p>
         ${teachingTable(
           "INFO and FORMAT fields in this example",
           [
             { label: "Column", className: "fd" },
             { label: "Key", className: "fk" },
             { label: "Value", className: "fv" },
             { label: "File says", className: "fd" },
             { label: "In plain words", className: "fd" },
           ],
           fieldRows.map(({ level, k, v }) => [
             level,
             escape(k),
             escape(v),
             escape(hdrDesc(level, k)) || "—",
             plain(level, k, v),
           ]),
         )}
         <p>Notice <code>DP</code> appears at both levels. INFO's is the total across everyone in the
         file; FORMAT's is yours alone — identical here only because this file holds one person.
         <code>AC</code> and <code>AN</code> exist only at the spot level (with three people they
         would count six copies); <code>GT</code>, <code>GQ</code>, <code>AD</code> and
         <code>PL</code> exist only per person.</p>`,
        [...pairs.map(({ k }) => hdr("INFO", k)), ...fkeys.map((k) => hdr("FORMAT", k))].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );

    // ── real rows from the file ──
    const rows: string[][] = [];
    await firstLines(ctx.source!, 6, (f) => rows.push(f));
    // Show them verbatim, as in the file, with the '#CHROM' line on top so the
    // columns are named once. The file separates columns with tabs; we pad with
    // spaces instead so they line up on screen.
    const head = ["#" + ctx.header!.columns[0], ...ctx.header!.columns.slice(1)];
    const cells = [
      head,
      ...rows.map((f) => f.map((v) => (v.length > 24 ? v.slice(0, 23) + "…" : v))),
    ];
    const widths = head.map((_, i) => Math.max(...cells.map((r) => (r[i] ?? "").length)));
    const padded = cells.map((r) =>
      r
        .map((v, i) => (v ?? "").padEnd(widths[i]!))
        .join("  ")
        .trimEnd(),
    );
    const linkedHeader = head
      .map(
        (label, i) =>
          columnLink(COLS[Math.min(i, 9)]!, label) +
          " ".repeat(i < head.length - 1 ? widths[i]! - label.length : 0),
      )
      .join("  ");
    out.append(el("div", "sub", "First real rows from your file:"));
    out.append(
      el(
        "div",
        null,
        fileExcerpt(
          `${linkedHeader}\n${padded.slice(1).map(escape).join("\n")}`,
          "First real VCF rows from your file",
        ),
      ),
    );

    // ── unpack the FORMAT / YOU columns of the first variant ──
    // FORMAT (col 8) lists which measurements are recorded, e.g. GT:DP:GQ:AD.
    // YOU (col 9) holds the matching values, e.g. 0/1:76:35:63,13. The header
    // told us what each key means, so we can label them instead of guessing.
    const first = await firstVariant(ctx.source!); // may lie beyond the six lines shown above
    const defs: Record<string, string> = {};
    for (const l of ctx.header!.meta) {
      const m = /^##FORMAT=<ID=([^,]+),.*Description="([^"]+)"/.exec(l);
      if (m) defs[m[1]!] = m[2]!;
    }
    const keys = (first![8] || "").split(":"),
      vals = (first![9] || "").split(":");
    // What each measurement means for THIS line, in plain words, using its
    // actual value. The header's one-line description is kept above it.
    const opts = [first![3], ...first![4]!.split(",")]; // option 0 = REF, 1… = ALT(s)
    const letter = (i: string | number) =>
      `<span class="o${+i === 0 ? 0 : 1}">${escape(opts[+i] ?? "?")}</span>`;
    const explain = (k: string | number, v: string) => {
      const n = +v;
      switch (k) {
        case "GT": {
          const a = v.split(/[/|]/);
          const how =
            a.length === 1
              ? "a single copy here (one X or Y in a male)"
              : a[0] === a[1]
                ? a[0] === "0"
                  ? "both copies match the reference"
                  : "both copies carry the alternate"
                : "one copy matches the reference, one carries the alternate";
          const result =
            a.length === 1
              ? `you have ${letter(a[0]!)}`
              : `you have ${letter(a[0]!)} and ${letter(a[1]!)}`;
          return `${how} — <b>${result}</b>.${v.includes("|") ? " The bar means the call is phased: allele order tracks chromosome copies within a phase set, without identifying either parent." : ""}`;
        }
        case "DP":
          return `The spot was read <b>${v}</b> times. More reads means more confidence — 30 or more is comfortable.`;
        case "GQ":
          return n > 99
            ? `Confidence in the genotype. A single run caps this at 99; <b>${v}</b> means this file adds up scores from several runs — as solid as it gets.`
            : `Confidence in the genotype, capped at 99. <b>${v}</b> is ${n >= 30 ? "solid" : n >= 20 ? "fair" : "shaky — treat with caution"}.`;
        case "PS":
          return v === "."
            ? `No phase-set ID is reported at this spot.`
            : `Phase set <b>${v}</b>: phased calls on this chromosome with the same ID use a consistent ordering of chromosome copies. The ID does not identify either parent.`;
        case "AD": {
          const [r, ...alt] = v.split(",");
          return `<b>${r}</b> reads matched the reference and <b>${alt.join(", ")}</b> had the alternate. This split is what the genotype above is based on.`;
        }
        case "SP":
          return `A check that reads came from both DNA strands. 0 is ideal; small numbers like <b>${v}</b> are fine, large ones are a warning sign.`;
        case "PL":
          return `Likelihood scores for each possible genotype; the <b>0</b> marks the most likely one.`;
        case "MIN_DP":
          return `The lowest read count anywhere inside this matching stretch.`;
        default:
          return "";
      }
    };
    out.append(
      el("div", "sub", `Let’s re-read a real line — the first true variant in your file:`),
    );
    out.append(card(first!));
    out.append(
      el(
        "p",
        "s-why",
        `A single line carries not just <em>what</em> you have, but <em>how
        confident</em> the call is. Zooming into its measurements —
        <code>${escape(first![8])}</code> paired with <code>${escape(first![9])}</code>:`,
      ),
    );
    out.append(
      el(
        "div",
        null,
        teachingTable(
          "FORMAT measurements in your first variant",
          [
            { label: "Key", className: "fk" },
            { label: "Value", className: "fv" },
            { label: "Meaning", className: "fd" },
          ],
          keys.map((k, i) => {
            const v = vals[i] ?? "·",
              more = explain(k, v);
            return [
              escape(k),
              escape(v),
              `${escape(defs[k] || "")}${more ? `<div class="fx">${more}</div>` : ""}`,
            ];
          }),
        ),
      ),
    );
  },
};
