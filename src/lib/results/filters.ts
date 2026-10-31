import type { Evidence } from "../catalogues/types.ts";
import { SIG_LABEL } from "./evidence.ts";

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

/** File-call problems are not interpreted classifications. */
export function classificationValues(hit: Evidence): string[] {
  if (hit.partialCall || hit.conflictingRecords) return [];
  const classifications = (hit.rawSig || "")
    .split("|")
    .map(normalizeClassification)
    .filter((value) => value !== "" && value !== ".");
  const fallback = SIG_LABEL[hit.sig];
  return [
    ...new Set(
      classifications.length
        ? classifications
        : fallback
          ? [normalizeClassification(fallback)]
          : [],
    ),
  ];
}

/** Counts describe records, so repeated labels within one record count only once. */
export function classificationFilterOptions(
  values: Iterable<readonly string[]>,
): ResultFilterOption[] {
  const classifications = new Map<string, number>();
  for (const value of values) {
    for (const classification of new Set(value))
      classifications.set(classification, (classifications.get(classification) || 0) + 1);
  }
  return [...classifications]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([value, count]) => ({
      value,
      label: classificationLabels.get(value) || value.charAt(0).toUpperCase() + value.slice(1),
      count,
    }));
}
