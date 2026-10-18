import type { HeaderDataExamples } from "./header-data-examples.ts";
const escape = (value: unknown) =>
  String(value).replace(
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

export function selectHeaderField(meta: string[]) {
  const definitions = meta.flatMap((text, index) => {
    const match = text.match(/^##(INFO|FORMAT|ALT)=<(.*)>$/);
    if (!match) return [];
    const fields: Record<string, string> = Object.fromEntries(
      [...match[2]!.matchAll(/(?:^|,)(\w+)=("(?:[^"\\]|\\.)*"|[^,]*)/g)].map(([, key, value]) => [
        key,
        value!.startsWith('"') ? value!.slice(1, -1).replace(/\\(["\\])/g, "$1") : value,
      ]),
    );
    return fields["ID"] ? [{ text, number: index + 1, kind: match[1], fields }] : [];
  });
  // Prefer a familiar, compact definition actually present in this file.
  for (const [kind, id] of [
    ["FORMAT", "DP"],
    ["FORMAT", "GT"],
    ["INFO", "DP"],
    ["INFO", "END"],
  ]) {
    const example = definitions.find((item) => item.kind === kind && item.fields["ID"] === id);
    if (example) return example;
  }
  return definitions[0] || null;
}

const mark = (text: unknown) => `<mark class="header-field-name">${escape(text)}</mark>`;

// Preserve the real column values, aligning this short excerpt with its labels.
function rowExcerpt(
  columns: string[],
  fields: string[],
  indices: number[],
  highlight: (index: number, text: string) => string = (_, text) => escape(text),
) {
  const widths = indices.map((i) => Math.max((columns[i] || "").length, fields[i]!.length));
  const labels = indices.map((i, n) => escape((columns[i] || "").padEnd(widths[n]!))).join("  ");
  const values = indices
    .map((i, n) => highlight(i, fields[i]!) + " ".repeat(widths[n]! - fields[i]!.length))
    .join("  ");
  return `<div class="file-excerpt"><pre class="header-data-line" role="region" aria-label="VCF data columns for this header example" tabindex="0"><code><span class="header-data-labels">${labels}</span>\n${values}</code></pre></div>`;
}

export function headerFieldExample(
  meta: string[],
  row: HeaderDataExamples["field"],
  columns: string[] = [],
) {
  const example = selectHeaderField(meta);
  if (!example) return null;
  const { text, kind, fields } = example;
  const count =
    {
      0: "A flag: present or absent",
      1: "One value",
      A: "One value per ALT allele",
      R: "One value for REF and each ALT",
      G: "One value per possible genotype",
      ".": "The number of values can vary",
    }[fields["Number"]!] ||
    (/^\d+$/.test(fields["Number"] || "") ? `${fields["Number"]} values` : fields["Number"]);
  const type =
    {
      Integer: "an integer (a whole number)",
      Float: "a number that can include decimals",
      String: "text",
      Character: "a single character",
      Flag: "a flag indicating presence or absence",
    }[fields["Type"]!] || fields["Type"];
  const definition =
    `This <code>${kind}</code> line describes <code>${escape(fields["ID"])}</code> (<code>ID=${escape(fields["ID"])}</code>).` +
    (fields["Number"] !== undefined
      ? ` It expects ${escape(count!.toLowerCase())} (<code>Number=${escape(fields["Number"])}</code>)${fields["Type"] ? `, stored as ${escape(type)} (<code>Type=${escape(fields["Type"])}</code>)` : ""}.`
      : ` ${escape(fields["Description"] || "")}`);
  const highlighted = escape(text).replace(
    /\b(ID|Number|Type)=([^,&]+)/g,
    (token, key) =>
      `<mark class="header-field-${({ ID: "name", Number: "count", Type: "type" } as Record<string, string>)[key]}">${token}</mark>`,
  );
  const intro =
    kind === "FORMAT"
      ? "The <code>##FORMAT</code> headers tell you how to read a sample’s values in a data line."
      : `The <code>##${kind}</code> headers explain the values used in the <code>${kind}</code> column of a data line.`;
  let dataExample =
    '<p class="mini">No value for this definition was found in the short preview of data rows.</p>';
  if (row) {
    const indices =
      kind === "FORMAT"
        ? [0, 1, 3, 4, 8, row.sample!]
        : [0, 1, 3, 4, ...(kind === "INFO" ? [7] : [])];
    const highlight = (column: number, text: string) => {
      if (kind === "FORMAT" && (column === 8 || column === row.sample)) {
        return text
          .split(":")
          .map((part, i) => (i === row.index ? mark(part) : escape(part)))
          .join(":");
      }
      if (kind === "INFO" && column === 7)
        return text
          .split(";")
          .map((part) =>
            part === fields["ID"] || part.startsWith(`${fields["ID"]}=`)
              ? mark(part)
              : escape(part),
          )
          .join(";");
      return kind === "ALT" && column === 4 ? mark(text) : escape(text);
    };
    const meaning =
      fields["ID"] === "DP" && /^\d+$/.test(row.value)
        ? `Here, <code>${escape(row.value)}</code> is the reported read depth${kind === "FORMAT" ? " for this sample" : " at this site"}.`
        : fields["ID"] === "GT"
          ? `Here, <code>${escape(row.value)}</code> is the genotype reported for this sample.`
          : `Here, <code>${escape(fields["ID"])}</code> is reported as <code>${escape(row.value)}</code>.`;
    const position =
      kind === "FORMAT"
        ? `<code>${escape(fields["ID"])}</code> is item <b>${row.index! + 1}</b> in <code>FORMAT</code>, so read item <b>${row.index! + 1}</b> in the sample column. `
        : "";
    dataExample = `${rowExcerpt(columns, row.fields, indices, highlight)}
      <p>${position}${meaning}</p>`;
  }

  return {
    label: `${kind} · ${fields["ID"]}`,
    html: `<p>${intro}</p><figure class="header-field-example">
      <div class="file-excerpt"><pre class="header-definition-line" role="region" aria-label="VCF ${kind} header definition" tabindex="0"><code>${highlighted}</code></pre></div>
      <p>${definition}</p>
      ${dataExample}
    </figure>`,
  };
}

export function headerFilterExamples(
  examples: HeaderDataExamples,
  filters: { id: string | undefined; desc: string }[],
  columns: string[],
) {
  const fallback = filters.find((item) => item.id && item.id !== "PASS");
  const cards = [
    {
      row: examples.pass,
      label: "Pass",
      verdict: "PASS",
      explanation: "All applied quality checks passed for this line.",
    },
    { row: examples.fail, label: "Fail", verdict: fallback?.id || "LowQual" },
    {
      row: examples.unfiltered,
      label: "Not checked",
      verdict: ".",
      explanation: "A dot means filters were not applied to this line.",
    },
  ].map(({ row, label, verdict, explanation }) => {
    const result = row ? row.fields[6] : verdict;
    const reasons = result!
      .split(";")
      .map((id) => filters.find((item) => item.id === id))
      .filter((value) => value != null);
    explanation ||= reasons.length
      ? reasons
          .map(
            (item) =>
              `<code>${escape(item.id)}</code>: ${escape(item.desc || "This quality check failed.")}`,
          )
          .join(" ")
      : `The named quality check failed for this line.`;
    return `<figure class="header-field-example header-filter-example">
      <figcaption><b>${label}</b> · ${row ? `from your file <span>· L${row.number}</span>` : "illustrative example"}</figcaption>
      ${row ? rowExcerpt(columns, row.fields, [0, 1, 6], (i, text) => (i === 6 ? mark(text) : escape(text))) : `<pre><code><span class="header-data-labels">FILTER</span>\n${mark(result)}</code></pre>`}
      <p>${explanation}</p>
    </figure>`;
  });
  return `<div class="header-filter-examples">${cards.join("")}</div>`;
}
