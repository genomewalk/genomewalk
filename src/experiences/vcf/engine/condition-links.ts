import type { CatalogEntry } from "../../../lib/catalogues/types.ts";
// CLNDN and CLNDISDB are parallel ClinVar lists. Pair them before filtering
// unnamed conditions, so an omitted name cannot shift another condition's ID.
const MEDGEN_ID = /^(?:C|CN)\d+$/;

export function catalogConditionReferences(rawNames = "", rawDatabases = "") {
  const names = rawNames.replaceAll("_", " ").split("|");
  const databases = rawDatabases.split("|");
  const aligned = names.length === databases.length;
  const records = new Map<string, Set<string>>();
  names.forEach((name, index) => {
    if (!name || name === "not provided" || name === "not specified") return;
    if (!records.has(name)) records.set(name, new Set<string>());
    if (!aligned) return;
    // A compound condition can have several MedGen concepts. Preserve them;
    // the reader must not silently link the whole name to just one concept.
    for (const reference of databases[index]!.split(/[,/]/)) {
      const id = reference.trim().match(/^MedGen:((?:C|CN)\d+)$/)?.[1];
      if (id) records.get(name)!.add(id);
    }
  });
  return [...records].map(([name, ids]) => ({ name, ids: [...ids] }));
}

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
