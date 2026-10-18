import type { Marker, MarkerData } from "./types.ts";
const escape = (value: string) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
const LIMIT = 3;
const key = (record: { chrom?: string; pos?: string | number; ref?: string; alt?: string }) =>
  [record.chrom, record.pos, record.ref, record.alt].join(":");
const words = (value: string) => (value ? value.replaceAll("_", " ") : "Not recorded");
const percent = (value: number | null | undefined) => {
  if (!Number.isFinite(value)) return "Not available";
  if (value! > 0 && value! < 0.000001) return "<0.0001%";
  return `${(value! * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
};

function preview({
  name,
  build,
  headings,
  headingLinks = {},
  rows,
  explanation,
}: {
  name: string;
  build: string;
  headings: string[];
  headingLinks?: Record<string, string>;
  rows: string[][];
  explanation: string;
}) {
  if (!rows.length) return "";
  return `<section class="raw catalogue-preview" aria-label="${escape(name)} catalog examples">
    <div class="catalogue-preview-heading">
      <span class="raw-k">From the ${escape(name)} catalog</span>
      <span class="catalogue-preview-meta">${escape(build)}</span>
    </div>
    <div class="catalogue-preview-scroll" role="region" aria-label="${escape(name)} example entries" tabindex="0">
      <table>
        <thead><tr>${headings.map((heading) => `<th scope="col">${headingLinks[heading] ? `<a href="${escape(headingLinks[heading])}">${escape(heading)} <span aria-hidden="true">↓</span></a>` : escape(heading)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((value, i) => `<td>${i === 0 ? `<code>${escape(value)}</code>` : escape(value)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>

    <p class="mini">${explanation} The key is <b>CHROM : POS : REF : ALT</b>.</p>
  </section>`;
}

export function frequencyIndexPreview(data: MarkerData) {
  const markers = data.markers || [];
  return preview({
    name: "gnomAD",
    build: data.build,
    headings: [
      "Variant key",
      "Marker",
      "Overall",
      data.pops?.["eas"] || "East Asian",
      data.pops?.["nfe"] || "European (non-Finnish)",
    ],
    rows: markers
      .slice(0, LIMIT)
      .map((marker) => [
        key(marker),
        marker.rs,
        percent(marker.af),
        percent(marker.pops?.["eas"]),
        percent(marker.pops?.["nfe"]),
      ]),
    explanation:
      "Your browser downloads only a small set of gnomAD entries for this chapter, matched to your file’s reference build. A few examples are shown here. A frequency of 10% means the ALT allele was found in 10 out of every 100 DNA copies checked.",
  });
}

export function frequencyEntryPreview(marker: Marker, data: MarkerData) {
  return `<section class="frequency-entry" aria-label="gnomAD catalogue entry for ${escape(marker.rs)}">
    <div class="catalogue-preview-heading">
      <span class="raw-k">From the gnomAD catalog</span>
      <span class="catalogue-preview-meta">${escape(data.build)}</span>
    </div>
    <dl class="frequency-entry-fields">
      <div class="frequency-entry-key"><dt>Variant key</dt><dd><code>${escape(key(marker))}</code></dd></div>
      <div><dt>Marker</dt><dd>${escape(marker.rs)}</dd></div>
      <div><dt>REF</dt><dd>${escape(marker.ref)}</dd></div>
      <div><dt>ALT</dt><dd>${escape(marker.alt)}</dd></div>
      <div><dt>Overall frequency</dt><dd>${escape(percent(marker.af))}</dd></div>
    </dl>
  </section>`;
}

export function clinvarIndexPreview(
  catalogue: { header: string; sample: string[]; build: string },
  examples: string[] = [],
) {
  const columns = (catalogue.header || "").replace(/^#/, "").split("\t");
  if (!["chrom", "pos", "ref", "alt", "classification"].every((column) => columns.includes(column)))
    return "";
  // Fall back to available sample rows if a future catalogue omits an example.
  const lines = [...new Set([...examples, ...(catalogue.sample || [])])].slice(0, LIMIT);
  const rows = lines.map((line) => {
    const values = line.split("\t");
    const record = Object.fromEntries(columns.map((column, i) => [column, values[i] || ""]));
    const review = /^[0-4]$/.test(record["stars"]!)
      ? `${record["stars"]} / 4 stars`
      : "Not recorded";
    const conditions = record["conditions"]
      ? record["conditions"].split("|").map(words).join("; ")
      : "Not recorded";
    return [
      key(record),
      record["gene"] || "Not recorded",
      words(record["classification"]!),
      conditions,
      review,
    ];
  });
  return preview({
    name: "ClinVar",
    build: catalogue.build,
    headings: ["Variant key", "Gene", "Classification", "Condition", "Review"],
    headingLinks: {
      "Variant key": "#clinvar-variant-key",
      Gene: "#clinvar-gene",
      Classification: "#clinvar-classifications",
      Condition: "#clinvar-condition",
      Review: "#clinvar-review",
    },
    rows,
    explanation:
      "Your browser downloads a compact selection of ClinVar entries; a few examples are shown here.",
  });
}
