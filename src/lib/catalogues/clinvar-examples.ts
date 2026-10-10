import type { CatalogueMap } from "./catalogue-ranges.ts";
import type { Status } from "../io/types.ts";
import { readCatalogueEntries } from "./catalogue-ranges.ts";

// ClinVar variations 132807, 1131472 and 39357 show different genes, claims and
// review levels. Their index locators must be resolved before rendering rows.
const EXAMPLE_KEYS: Record<string, string[]> = {
  GRCh37: ["1:9780851:G:A", "1:865625:G:A", "10:96521657:C:T"],
  GRCh38: ["1:9720793:G:A", "1:930245:G:A", "10:94761900:C:T"],
};

export async function loadClinvarExamples(
  catalogue: { build: string; map: CatalogueMap },
  signal?: AbortSignal,
  onStatus?: Status,
) {
  const keys = (EXAMPLE_KEYS[catalogue.build] || []).filter((key) => catalogue.map?.has(key));
  const rows = await readCatalogueEntries(catalogue.map || new Map(), keys, signal, () =>
    onStatus?.("Loading catalogue examples…"),
  );
  return [...rows.values()];
}
