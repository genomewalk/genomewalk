// CLNDN and CLNDISDB are parallel ClinVar lists. Pair them before filtering
// unnamed conditions, so an omitted name cannot shift another condition's ID.
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
