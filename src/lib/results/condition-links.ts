import type { CatalogEntry } from "../catalogues/types.ts";
const MEDGEN_ID = /^(?:C|CN)\d+$/;

export function conditionUrl(
  hit: Partial<Pick<CatalogEntry, "conditionMedgenIds" | "conditions">>,
  name: string,
) {
  if (!hit.conditionMedgenIds) return null;
  const names = (hit.conditions || "").split("|");
  const ids = hit.conditionMedgenIds.split("|");
  if (names.length !== ids.length) return null;
  const matches = new Set<string>();
  names.forEach((candidate, index) => {
    if (candidate.trim() !== name) return;
    for (const id of ids[index]!.split(",")) {
      if (id && !MEDGEN_ID.test(id)) {
        matches.add("invalid");
        continue;
      }
      if (id) matches.add(id);
    }
  });
  const [id] = matches;
  return matches.size === 1 && MEDGEN_ID.test(id!)
    ? `https://www.ncbi.nlm.nih.gov/medgen/${id}`
    : null;
}
