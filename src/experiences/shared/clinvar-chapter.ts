import type { CatalogueIndex } from "../../lib/catalogues/types.ts";
import { clinvarIndexPreview } from "../../lib/catalogues/catalogue-preview.ts";
import { splitBar } from "../../components/diagrams/share-chart.ts";
import { teachingTable } from "../../lib/view/teaching-table.ts";

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
const fmt = (value: number | null | undefined) => (value ?? 0).toLocaleString("en-US");
const section = (
  id: string,
  title: string,
  body: string,
) => `<details class="kvx clinvar-field-section catalogue-section-target" id="${id}">
  <summary><span>${title}</span><i class="kvx-caret" aria-hidden="true">+</i></summary>
  <div class="kvx-body">${body}</div>
</details>`;

// Catalogue fields mean the same thing for VCF and consumer DNA files.
export function clinvarChapterHtml(
  catalogue: Pick<CatalogueIndex, "header" | "sample" | "build" | "n" | "byClass" | "byStars">,
  {
    labels,
    meanings,
    reviewLabels,
    examples,
  }: {
    labels: Record<string, string>;
    meanings: Record<string, string>;
    reviewLabels: string[];
    examples: string[];
  },
) {
  const classes = ["P", "LP", "PLP", "C", "O"].filter((kind) => catalogue.byClass[kind]);
  const classificationCounts = teachingTable(
    "ClinVar classifications in this catalogue",
    [
      { label: "Classification", className: "fk" },
      { label: "Entries", className: "fv" },
      { label: "Meaning", className: "fd" },
    ],
    classes.map((kind) => [
      escape(labels[kind]),
      fmt(catalogue.byClass[kind]),
      escape(meanings[kind]),
    ]),
  );
  const reviewCounts = splitBar(
    [0, 1, 2, 3, 4].map((stars) => ({
      label: `${stars}★ ${reviewLabels[stars]}`,
      n: catalogue.byStars[stars] || 0,
      tone: `review-${stars}`,
    })),
  );

  return `${clinvarIndexPreview(catalogue, examples)}
    <p>Each row is a <a href="https://www.ncbi.nlm.nih.gov/clinvar/" target="_blank" rel="noopener">ClinVar ↗</a> catalogue entry. Follow a column heading to learn how to read that field.</p>
    <div class="clinvar-field-sections">
      ${section(
        "clinvar-variant-key",
        "Variant key",
        `
        <p>The key identifies the exact variant: <code>CHROM:POS:REF:ALT</code> — <b>chromosome</b>, <b>position</b>, <b>reference DNA</b> and <b>alternative DNA</b>.</p>
        <p>Coordinates belong to a particular reference build. This catalogue uses <code>${escape(catalogue.build)}</code>; the file and catalogue must use the same build for matching.</p>`,
      )}
      ${section(
        "clinvar-gene",
        "Gene",
        `
        <p>This column names the gene associated with the catalogue record. Different variants in the same gene can have different classifications, so read the gene name alongside the <b>exact variant key</b>.</p>`,
      )}
      ${section(
        "clinvar-classifications",
        "Classification",
        `
        <p>The classification is the <b>submitted interpretation</b> — from <b>Pathogenic</b> through <b>Uncertain significance</b> to <b>Benign</b> — for a particular condition and inheritance context. ClinVar also includes drug-response, trait and association records.</p>
        <p>A classification applies to the variant in that context; it is not a diagnosis of the person carrying it. Read it together with the <b>condition</b> and <b>review status</b>.</p>
        <p>Classifications across the <b>${fmt(catalogue.n)}</b> entries covered by this catalogue index:</p>
        ${classificationCounts}
        <p><b>What was left out, and why.</b> ClinVar classifies over four million variants. About 2.3 million are <em>Uncertain significance</em> and over a million are <em>Benign</em> — together they would need more memory than a browser tab should use. This compact catalogue keeps selected classification types and is not a complete clinical screen. It also preserves exact variant identifiers, review text, source dates and publication links, with gnomAD allele frequencies as a separate evidence layer.</p>`,
      )}
      ${section(
        "clinvar-condition",
        "Condition",
        `
        <p>The condition is the <b>disease, trait or drug-response context</b> the claim concerns. An entry can list more than one condition; those names describe the catalogue record, not a finding that you have those conditions.</p>
        <p>Read this field with the classification: for example, a <b>drug response</b> entry concerns a response to a medicine rather than a disease diagnosis.</p>`,
      )}
      ${section(
        "clinvar-review",
        "Review",
        `
        <p><b>Review status</b> describes the review behind the classification. ClinVar summarizes it with <a href="https://www.ncbi.nlm.nih.gov/clinvar/docs/review_status/" target="_blank" rel="noopener">zero to four stars ↗</a>:</p>
        <ul class="plain">
          <li><b><span class="clinvar-review-rating"><span>0</span><span>★</span></span> — criteria unavailable.</b> One or more submitters have not supplied assertion criteria.</li>
          <li><b><span class="clinvar-review-rating"><span>1</span><span>★</span></span> — criteria provided.</b> A single submission or conflicting submissions with criteria.</li>
          <li><b><span class="clinvar-review-rating"><span>2</span><span>★</span></span> — multiple submitters agree.</b> Their classifications agree and criteria are provided.</li>
          <li><b><span class="clinvar-review-rating"><span>3</span><span>★</span></span> — expert panel.</b> An expert panel has reviewed the variant.</li>
          <li><b><span class="clinvar-review-rating"><span>4</span><span>★</span></span> — practice guideline.</b> The classification comes from a practice guideline.</li>
        </ul>
        <p>Review status across the same <b>${fmt(catalogue.n)}</b> catalogue entries:</p>
        ${reviewCounts}`,
      )}
    </div>`;
}
