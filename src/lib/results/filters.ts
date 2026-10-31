import type { Evidence } from "../catalogues/types.ts";
import { SIG_LABEL } from "./evidence.ts";

export interface EvidenceFilterValues {
  classifications: string[];
  stars: string | null;
}

export interface ResultFilterOption {
  value: string;
  label: string;
  count: number;
}

const normalizeClassification = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const classificationLabels = new Map(
  Object.values(SIG_LABEL).map((label) => [normalizeClassification(label), label]),
);

/** File-call problems are not interpreted classifications or zero-star evidence. */
export function evidenceFilterValues(hit: Evidence): EvidenceFilterValues {
  if (hit.partialCall || hit.conflictingRecords) return { classifications: [], stars: null };
  const classifications = (hit.rawSig || "")
    .split("|")
    .map(normalizeClassification)
    .filter((value) => value !== "" && value !== ".");
  const fallback = SIG_LABEL[hit.sig];
  return {
    classifications: [
      ...new Set(
        classifications.length
          ? classifications
          : fallback
            ? [normalizeClassification(fallback)]
            : [],
      ),
    ],
    stars:
      Number.isInteger(hit.stars) && hit.stars >= 0 && hit.stars <= 4 ? String(hit.stars) : null,
  };
}

/** Counts describe records, so repeated labels within one record count only once. */
export function resultFilterOptions(values: Iterable<EvidenceFilterValues>) {
  const classifications = new Map<string, number>();
  const stars = new Map<string, number>();
  for (const value of values) {
    for (const classification of new Set(value.classifications))
      classifications.set(classification, (classifications.get(classification) || 0) + 1);
    if (value.stars !== null) stars.set(value.stars, (stars.get(value.stars) || 0) + 1);
  }
  return {
    classifications: [...classifications]
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([value, count]): ResultFilterOption => ({
        value,
        label: classificationLabels.get(value) || value.charAt(0).toUpperCase() + value.slice(1),
        count,
      })),
    stars: [...stars]
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([value, count]): ResultFilterOption => ({
        value,
        label: `${value} ${value === "1" ? "star" : "stars"}`,
        count,
      })),
  };
}
