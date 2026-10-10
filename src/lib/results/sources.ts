import type { CatalogEntry } from "../catalogues/types.ts";
import { ext } from "../view/html.ts";

export function resultSources(h: Partial<Pick<CatalogEntry, "variationId" | "pmids">>) {
  const url = /^\d+$/.test(h.variationId || "")
    ? `https://www.ncbi.nlm.nih.gov/clinvar/variation/${h.variationId}/`
    : null;
  const pmids = [...new Set(h.pmids || [])].filter((id) => /^\d+$/.test(id));
  return `<div class="result-source-lines">
    <p>${url ? ext(url, "ClinVar record") : "ClinVar record link unavailable"}</p>
    <p>${
      pmids.length
        ? `Publications: ${pmids
            .slice(0, 3)
            .map(
              (id) =>
                `<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" data-pmid="${id}" target="_blank" rel="noopener">PMID ${id} ↗</a>`,
            )
            .join(
              " · ",
            )}${pmids.length > 3 && url ? ` · ${ext(url + "#citations", `All ${pmids.length} on ClinVar`)}` : ""}`
        : "No publication links available."
    }</p>
  </div>`;
}
