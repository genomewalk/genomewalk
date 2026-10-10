// One introduction and lesson for both formats. VCF supplies an exact variant
// key; consumer calls supply a location, then validate the catalogue's alleles.
export const meaningIntroduction = {
  title: "Where would meaning come from?",
  blurb: "comparing your alleles with public catalogues, in your browser",
  why: "You can now read a line of your file — but the line alone does not explain what it means. Public catalogues add context about the same position and allele. This chapter shows how that comparison works, without uploading your DNA file.",
};

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
const link = (url: string, label: string) =>
  `<a href="${url}" target="_blank" rel="noopener">${label} ↗</a>`;
const database =
  '<svg viewBox="0 0 60 72" width="46" height="55" aria-hidden="true"><ellipse cx="30" cy="12" rx="26" ry="9"/><path d="M4 12v46a26 9 0 0 0 52 0V12"/><path d="M4 30a26 9 0 0 0 52 0M4 46a26 9 0 0 0 52 0" fill="none"/></svg>';
const exampleBuild = (build: string) => (["GRCh37", "GRCh38"].includes(build) ? build : "GRCh38");

function catalogueOverview(build: string) {
  const entries = [
    ["1", "100", "C", "T"],
    ["1", "100", "C", "G"],
    ["2", "200", "A", "G"],
    ["3", "300", "T", "C"],
  ];
  return `<div class="catalogue-overview">
    <div class="catalogue-explanation">
      <p>Each catalogue entry describes a change for a particular reference build. Its key is <code>CHROM:POS:REF:ALT</code>: <b>chromosome</b>, <b>position</b>, <b>reference DNA</b> and <b>alternative DNA</b>.</p>
      <p>For a refresher on REF, revisit <a href="/chapter/1#reference-build" data-chapter-link="1">Reference build in Chapter 1</a>.</p>
      <p><code>1:100:C:T</code> identifies a change at chromosome 1, position 100, where the reference is C. It matches if you report <b>at least one T</b> at that location. If both your alleles are C (<code>CC</code>), you have two reference alleles and do not match this entry.</p>
      <p>We match <b>reported changes from the reference</b>, not your pair of genotype letters. Here, <code>CT</code> and <code>TT</code> both match the same <code>C:T</code> entry.</p>
    </div>
    <div class="catalogue-key-preview lk-stage lk-db">
      <div class="catalogue-key-preview-title">${database}<div><span class="lk-lbl">Catalogue · ${exampleBuild(build)}</span><span class="lk-hint">Illustrative entries</span></div></div>
      <table aria-label="Illustrative catalogue entries">
        <thead><tr><th scope="col">Variant key</th><th scope="col">Change</th></tr></thead>
        <tbody>${entries.map(([chrom, pos, ref, alt]) => `<tr><td><code class="lk-entry">${chrom}:${pos}:<span class="o0">${ref}</span>:<span class="o1">${alt}</span></code></td><td><span class="o0">${ref}</span> → <span class="o1">${alt}</span></td></tr>`).join("")}</tbody>
      </table>
      <span class="lk-hint">Each key leads to information about that change.</span>
    </div>
  </div>`;
}

function example(format: string, provider: string, build: string) {
  const vcf = format === "vcf";
  const catalogueBuild = exampleBuild(build);
  const arrow = (label = "") =>
    `<div class="lk-link"><b aria-hidden="true">→</b>${label ? `<span>${label}</span>` : ""}</div>`;
  const variantKey =
    '<code class="lk-key"><span>1</span>:<span>100</span>:<span class="o0">C</span>:<span class="o1">T</span></code>';
  const cases = [
    {
      gt: "0/1",
      alleles: "CT",
      copies: "one copy",
      detail: "One T reported.",
      explanation: vcf
        ? "<code>0/1</code> reports <b>CT</b>: one reference C and one alternative T. We look up <code>1:100:C:T</code> in the catalogue for the same build, with <b>one copy</b> of T."
        : "<code>CT</code> reports one C and one T. The catalogue supplies the REF and ALT: <b>C is the reference letter</b> and T is the alternative. This matches <code>1:100:C:T</code>, with <b>one copy</b> of T.",
    },
    {
      gt: "1/1",
      alleles: "TT",
      copies: "two copies",
      detail: "Two Ts reported.",
      explanation: vcf
        ? "<code>1/1</code> reports <b>TT</b>. This matches the same <code>1:100:C:T</code> entry, with <b>two copies</b> of T. REF stays C even though neither of your copies has C at this site."
        : "The catalogue entry has <b>REF C and ALT T</b>. <code>TT</code> reports two Ts, so it matches the same <code>1:100:C:T</code> entry with <b>two copies</b> of T. REF stays C even though neither of your copies has C at this site.",
    },
    {
      gt: "0/0",
      alleles: "CC",
      copies: null,
      detail: "Only reference C reported.",
      explanation: vcf
        ? "We look for <b>reported changes from the reference</b>. <code>0/0</code> reports <b>CC</b> — no change at this site — so we skip the variant lookup."
        : "The catalogue entry has <b>REF C and ALT T</b>. <code>CC</code> reports two reference Cs and no T. We look for <b>reported changes from the reference</b>, so this call is left out of the variant results.",
    },
  ];
  return `<div class="lookup-examples">${cases
    .map(({ gt, alleles, copies, detail, explanation }) => {
      const fields: (string | undefined)[][] = [
        ["CHROM", "1"],
        ["POS", "100"],
      ];
      fields.push(
        ...(vcf
          ? [
              ["REF", "C"],
              ["ALT", "T"],
              ["GT", gt],
            ]
          : provider === "AncestryDNA"
            ? [
                ["ALLELE 1", alleles[0]],
                ["ALLELE 2", alleles[1]],
              ]
            : [["GENOTYPE", alleles]]),
      );
      const cells = fields
        .map(
          ([label, value]) =>
            `<span class="cell"><span class="cell-k">${label}</span><span class="cell-v">${value}</span></span>`,
        )
        .join("");
      const outcomeLabel = copies
        ? '<span class="lk-outcome">✓ Match</span>'
        : '<span class="lk-outcome lk-skip">× Skipped</span>';
      const catalogue = `<div class="lk-stage lk-db"><span class="lk-lbl">Catalogue · ${catalogueBuild}</span>
      <div class="lk-dbbody">${database}<code class="lk-entry">1:100:C:T</code>${outcomeLabel}</div>
      ${vcf ? `<span class="lk-hint">${detail}</span>` : ""}
    </div>`;
      return `<div class="lookup-example" role="group" aria-label="${alleles}: ${copies || "skipped"}">
      <div class="lk-flow">
      <div class="lk-stage"><span class="lk-lbl">Example line</span><div class="lk-cells">${cells}</div>${vcf ? `<span class="lk-hint">Your call: <b>${alleles[0]} / ${alleles[1]}</b></span>` : ""}</div>
      ${arrow()}
      ${
        vcf
          ? `
        <div class="lk-stage"><span class="lk-lbl">Variant key</span>${copies ? `${variantKey}<span class="lk-hint">CHROM : POS : REF : ALT</span>` : '<span class="lk-key lk-skip">None</span><span class="lk-hint">0/0 carries no ALT.</span>'}</div>
        ${arrow(copies ? "looked up in" : "skip lookup")}
        ${copies ? catalogue : `<div class="lk-stage"><span class="lk-lbl">No change from reference</span>${outcomeLabel}<span class="lk-hint">No ALT carried, so no lookup.</span></div>`}
      `
          : `
        <div class="lk-stage lk-location"><span class="lk-lbl">Location key</span><div class="lk-location-key"><code class="lk-key"><span>1</span>:<span>100</span></code><span class="lk-hint">CHROM : POS</span></div></div>
        ${arrow("looked up in")}
        ${catalogue}
      `
      }
      </div>
      <p class="lk-explanation">${explanation}</p>
    </div>`;
    })
    .join("")}</div>`;
}

function buildExplanation(format: string, build: string) {
  if (build === "GRCh37" || build === "GRCh38")
    return `Your file uses <code>${build}</code>, so we use the catalogue for that build.`;
  if (!build || build === "unknown")
    return format === "vcf"
      ? "Your file’s build could not be identified. The VCF lookup currently assumes GRCh38; that assumption needs to match your file for the comparison to be reliable."
      : "Your file’s build could not be identified, so catalogue matching is unavailable.";
  return `This file’s build is <code>${escape(build)}</code>. The app’s catalogues support GRCh37 and GRCh38, so catalogue matching is unavailable for this file.`;
}

export function meaningChapterHtml({
  format,
  build,
  provider,
}: { format?: string; build?: string; provider?: string } = {}) {
  const callExplanation =
    format === "vcf"
      ? "In a VCF, <b>chromosome, position, REF and a carried ALT</b> form a lookup key."
      : "Your file has no REF or ALT columns. We use <b>chromosome and position</b> to find entries at that location, then check the <b>reported DNA letters</b> against their alleles.";
  return `<div class="sub">Two questions the catalogues help answer:</div>
    <div class="cases">
      <div class="case"><div class="case-gt">1 · How common is it?</div><div class="case-sum">${link("https://gnomad.broadinstitute.org/", "<b>gnomAD</b>")} reports how often an allele was observed, overall and within ancestry groups. We explore those frequencies in chapter 7.</div></div>
      <div class="case"><div class="case-gt">2 · Has anyone linked it to a condition?</div><div class="case-sum">${link("https://www.ncbi.nlm.nih.gov/clinvar/", "<b>ClinVar</b>")} collects findings submitted by labs and researchers. We explore those claims and their evidence in chapter 8.</div></div>
    </div>
    <div class="sub">What does the catalog look like?</div>
    ${catalogueOverview(build!)}
    <div class="sub">How a line finds a matching entry:</div>
    <p>${callExplanation}</p>
    ${example(format!, provider!, build!)}
    <p>The <b>reference build must match</b>, too. ${buildExplanation(format!, build!)} A marker name (rsID) alone is not enough.</p>
    <div class="sub">Where the comparison happens:</div>
    <div class="cases">
      <div class="case"><div class="case-gt case-icon-title case-icon-catalogue">The catalogues come to you</div><div class="case-sum">The next chapters download public reference files for your build. Both file formats use the same catalogue data.</div></div>
      <div class="case"><div class="case-gt case-icon-title case-icon-privacy">Your DNA stays here</div><div class="case-sum">The comparison runs in this browser. Your DNA file, marker list and individual calls are not uploaded for lookups.</div></div>
    </div>
    <div class="note">No-calls and variants without a matching catalogue entry are omitted from the results. A match adds context; it does not by itself say whether a variant affects your health.</div>`;
}
