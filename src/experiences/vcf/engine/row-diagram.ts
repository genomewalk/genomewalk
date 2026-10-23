export interface VcfRowExamples {
  build: string;
  records: number;
  matchable: number;
  partial: number;
  examples: Record<
    string,
    { fields: string[]; row: number; check: ReturnType<typeof vcfRowCheck> }
  >;
}
const escape = (value: string) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
const fmt = (n: number) => n.toLocaleString("en-US");

// These are candidates for the existing exact-allele lookup, not catalogue
// findings. Missing parts of a genotype do not erase an explicitly called ALT.
export function vcfRowCheck(fields: string[], build: string) {
  const [, , , ref, alt, , filter] = fields;
  const gt = (fields[9] || "").split(":")[0];
  const entries = gt!.split(/[/|]/);
  const alts = (alt || "").split(",");
  const carried = alts.filter((_, index) =>
    entries.some((entry) => /^\d+$/.test(entry) && Number(entry) === index + 1),
  );
  const partial =
    !/^\d+(?:[/|]\d+)*$/.test(gt!) || entries.some((entry) => Number(entry) > alts.length);
  const omitted = (reason: string) => ({ matchable: false, partial, reason });
  if (build !== "GRCh37" && build !== "GRCh38")
    return omitted("This reference build is not supported by our catalogues.");
  if (alt === ".") return omitted("No alternate allele is listed to look up.");
  if (filter !== "PASS" && filter !== ".")
    return omitted(`The ${filter} filter excludes this row from matching.`);
  if (!carried.length)
    return omitted(
      entries.every((entry) => entry === "." || entry === "")
        ? "The genotype is missing, so no alternate allele is reported."
        : "The genotype does not report carrying an alternate allele.",
    );
  // Keep candidate limits aligned with scripts/lib/clinvar.ts: the compact
  // catalogue accepts A/C/G/T/N sequences of up to 50 characters per allele.
  if (!/^[ACGTN]+$/.test(ref!) || !carried.some((allele) => /^[ACGTN]+$/.test(allele)))
    return omitted(
      "This row uses a symbolic allele rather than a DNA sequence for an exact lookup.",
    );
  if (
    ref!.length > 50 ||
    !carried.some((allele) => /^[ACGTN]+$/.test(allele) && allele.length <= 50)
  )
    return omitted("This change is longer than the variants included in our current catalogue.");
  return {
    matchable: true,
    partial,
    reason: `${filter === "." ? "No filter failure is recorded" : "The row passes its quality filter"}, and the genotype reports ${carried.length > 1 ? "alternate alleles" : "an alternate allele"}.${partial ? " Only the reported allele can be looked up; the incomplete call is flagged in results." : ""}`,
  };
}

export function createVcfRowExamples(build: string): VcfRowExamples {
  return { build, records: 0, matchable: 0, partial: 0, examples: {} };
}

export function collectVcfRowExample(state: VcfRowExamples, fields: string[]) {
  state.records++;
  const check = vcfRowCheck(fields, state.build);
  if (check.matchable) {
    state.matchable++;
    if (check.partial) state.partial++;
  }
  const gt = (fields[9] || "").split(":")[0];
  const alt = fields[4] || "";
  const carried = alt
    .split(",")
    .filter((_, i) => gt!.split(/[/|]/).some((entry) => Number(entry) === i + 1));
  let kind;
  if (fields[6] !== "PASS" && fields[6] !== ".") kind = "filtered";
  else if (!gt || /^\.(?:[/|]\.)*$/.test(gt)) kind = "missing";
  else if (alt === "." || /^0(?:[/|]0)*$/.test(gt)) kind = "reference";
  else if (check.partial) kind = "partial";
  else if (alt.includes(",")) kind = "multiple";
  else if (
    /^[ACGT]+$/i.test(fields[3]!) &&
    carried.some((a) => /^[ACGT]+$/i.test(a) && a.length !== fields[3]!.length)
  )
    kind = "indel";
  else if (check.matchable) kind = "standard";
  else kind = "other";
  if (!state.examples[kind])
    state.examples[kind] = { fields: fields.slice(0, 10), row: state.records, check };
}

const GROUPS: [string, string, string, string][] = [
  [
    "standard",
    "Standard variant",
    "REF is the reference sequence. ALT is the change; GT tells us which allele you carry.",
    "letters",
  ],
  [
    "reference",
    "Reference row",
    "This row reports matching the reference. A reference block can describe a whole stretch.",
    "repeat",
  ],
  ["missing", "No-call", "The position is known, but the genotype is not reported.", "missing"],
  [
    "partial",
    "Partial call",
    "One part of the genotype is missing. A reported alternate allele can still be looked up.",
    "partial",
  ],
  [
    "indel",
    "Insertion / deletion",
    "Different REF and ALT lengths show DNA added or removed. The letters spell out the change.",
    "codes",
  ],
  [
    "multiple",
    "More than one ALT",
    "A comma separates the alternatives. GT refers to their order: 1 is the first, 2 the second.",
    "repeat",
  ],
  ["filtered", "Filtered row", "FILTER names a quality check this row did not pass.", "outside"],
  [
    "other",
    "Other row",
    "Some records need information beyond an ordinary DNA-letter lookup.",
    "outside",
  ],
];

export function vcfRowDiagram(state: VcfRowExamples, sampleName = "", { showSummary = true } = {}) {
  if (!state?.records) return "";
  const groups = GROUPS.filter(([kind]) => state.examples[kind]);
  const columns = ["CHROM", "POS", "REF", "ALT", "FILTER", "GT"];
  const groupsHtml = groups
    .map(([kind, title, text, color]) => {
      const { fields: f, row, check } = state.examples[kind]!;
      const gt = (f[9] || "").split(":")[0] || ".";
      const values = [f[0], f[1], f[3], f[4], f[6], gt];
      const status = check.matchable ? "Matchable" : "Omitted";
      return `<div class="row-map-group row-map-${color}">
      <a class="row-map-note" href="#vcf-count-${kind}"><strong>${title} <span aria-hidden="true">↘</span></strong><p>${text}</p></a>
      <div class="row-map-records"><div class="row-map-record">
        <div class="row-map-data row-map-meta"><div class="row-map-cells">
          <span class="row-map-number">Row ${fmt(row)}</span>
        </div></div>
        <div class="row-map-data"><dl class="row-map-cells">${values
          .map((value, i) => {
            const shown = String(value || ".");
            const highlight =
              i === 5 ||
              (kind === "filtered" && i === 4) ||
              ((kind === "indel" || kind === "multiple") && (i === 2 || i === 3));
            const renderValue = (text: string) =>
              highlight ? `<mark>${escape(text)}</mark>` : escape(text);
            // Each ALT gets its own line; retain commas and every sequence letter.
            // REF and ALT wrap within bounded columns rather than setting their width.
            const alleles = i === 3 ? shown.split(",") : [shown];
            const content =
              i === 2 || i === 3
                ? alleles
                    .map(
                      (allele, index) =>
                        `<span class="row-map-allele">${renderValue(allele + (index < alleles.length - 1 ? "," : ""))}</span>`,
                    )
                    .join("")
                : renderValue(shown);
            return `<div><dt>${columns[i]}</dt><dd>${content}</dd></div>`;
          })
          .join(
            "",
          )}</dl><span class="row-map-status ${check.matchable ? "is-matchable" : "is-omitted"}"><span aria-hidden="true">${check.matchable ? "✓" : "×"}</span> ${status}${check.matchable && check.partial ? "*" : ""}</span></div>
      </div></div>
      <div class="row-map-check"><strong>Why ${status.toLowerCase()}?</strong><p>${escape(check.reason)}</p></div>
    </div>`;
    })
    .join("");
  return `<figure class="file-row-map vcf-row-map">
    <figcaption><strong>${showSummary ? "Your file, at a glance" : "Rows side by side"}</strong><span>${showSummary ? "Real rows, grouped by example." : `Selected examples from the first ${fmt(state.records)} rows read.`} Selected columns are shown${sampleName ? `; GT is for ${escape(sampleName)}` : ""}.</span></figcaption>
    <div class="row-map-layout" role="region" aria-label="VCF rows and matching checks" tabindex="0"><div class="row-map-entries">
      <div class="row-map-head" aria-hidden="true"><span>Reading the rows</span><div class="row-map-data"><div class="row-map-cells">${columns.map((c) => `<span>${c}</span>`).join("")}</div><span>Row check</span></div><span class="row-map-check-heading">Why?</span></div>
      ${groupsHtml}${state.records > groups.length ? '<div class="row-map-end" aria-hidden="true"><span>⋮</span></div>' : ""}
    </div></div>
    ${showSummary ? `<div class="row-map-totals"><div><span>Whole file</span><strong>${fmt(state.records)}</strong><span>data rows</span></div><div class="is-matchable"><span>✓ Matchable</span><strong>${fmt(state.matchable)}</strong><span>have an allele to look up</span></div><div class="is-omitted"><span>× Omitted</span><strong>${fmt(state.records - state.matchable)}</strong><span>outside the row rules</span></div></div>` : ""}
    <p class="row-map-file-check">${state.build === "GRCh37" || state.build === "GRCh38" ? `${escape(state.build)} is supported.` : "This file’s reference build is not supported for matching."} Matching checks the chromosome, position, REF and carried ALT against the catalogue. X, Y and mitochondrial rows can also be looked up.${showSummary && state.partial ? ` *${fmt(state.partial)} matchable ${state.partial === 1 ? "row has an incomplete genotype; that call is" : "rows have incomplete genotypes; those calls are"} flagged in results.` : ""} ${showSummary ? "Counts are before catalogue lookup and repeated-record checks." : "Only row types found in these examples are shown. An omitted row is outside our current matching rules."}</p>
  </figure>`;
}

export function vcfRowExplanations(state: VcfRowExamples) {
  const explanations: Record<string, string> = {
    standard: `<p><code>CHROM</code> and <code>POS</code> give the address. <code>REF</code> is
      the reference sequence; <code>ALT</code> lists the alternatives. In <code>GT</code>,
      <code>0</code> means REF and <code>1</code> means the first ALT. So <code>0/1</code>
      reports one of each, while <code>1/1</code> reports the same alternate allele twice.</p>`,
    reference: `<p>A genotype such as <code>0/0</code> reports matching the reference. These
      rows have no carried alternate allele to look up. A reference block can cover a whole
      stretch instead of a single position; its <code>END</code> value marks the last position.</p>`,
    missing: `<p>A dot in the genotype means an allele was not reported. With <code>./.</code>,
      neither allele is known. The row gives an address, but no alternate allele we can look up.</p>`,
    partial: `<p>A call such as <code>./1</code> reports one alternate allele and leaves the
      other unknown. We can look up the reported allele if it passes the row checks, and flag
      the incomplete call in results. We do not fill in the missing part.</p>`,
    indel: `<p>When ALT is longer than REF, letters have been added; when it is shorter,
      letters have been removed. The sequences show the change, often with an unchanged
      letter at the start to anchor its position. For example, REF <code>A</code> and
      ALT <code>AC</code> describe an added C.</p>`,
    multiple: `<p>Commas separate the alternatives. <code>0</code> still means REF;
      <code>1</code> means the first ALT, <code>2</code> the second, and so on.
      A genotype of <code>1/2</code> reports the first and second alternatives.
      We check each carried alternate allele separately against the catalogue.</p>`,
    filtered: `<p><code>FILTER</code> records the lab’s quality verdict. <code>PASS</code> means
      the row passed; a named filter means it failed that check. A dot (<code>.</code>) means
      no verdict is recorded. Our matching accepts PASS or a dot and leaves out rows with a
      named failure.</p>`,
    other: `<p>Some records describe changes with symbols, such as <code>&lt;DEL&gt;</code>,
      or with sequences longer than our catalogue supports. These can describe real variation,
      but our current exact-allele lookup cannot match them.</p>`,
  };
  return (
    GROUPS.filter(([kind]) => state.examples[kind])
      .map(
        ([kind, title]) =>
          `<details class="kvx vcf-count-detail" id="vcf-count-${kind}"><summary><span>${title}</span><i class="kvx-caret" aria-hidden="true">+</i></summary><div class="kvx-body">${explanations[kind]}</div></details>`,
      )
      .join("") +
    "<p>The next chapter, <b>Count everything</b>, gives the totals for your whole file.</p>"
  );
}
