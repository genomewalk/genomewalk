export function describeHeader(meta: string[], columns: string[]) {
  const text = meta.join("\n");
  const provider = /23andme/i.test(text)
    ? "23andMe"
    : /ancestrydna/i.test(text)
      ? "AncestryDNA"
      : null;
  const expected =
    provider === "23andMe"
      ? ["rsid", "chromosome", "position", "genotype"]
      : ["rsid", "chromosome", "position", "allele1", "allele2"];
  if (
    !provider ||
    columns.map((x) => x.toLowerCase().replace(/\s+/g, "")).join("|") !== expected.join("|")
  )
    throw new Error(
      "This is not a supported 23andMe or AncestryDNA raw export. Keep the original header and column names.",
    );
  const builds = new Set(
    [...text.matchAll(/(?:GRCh\s*|build\s*|assembly\s*)(36|37|38)\b/gi)].map((m) => m[1]),
  );
  // Ancestry's documented raw export profile supplies build/strand when omitted
  // from its header. Explicit contradictory metadata always wins over defaults.
  const build =
    builds.size > 1
      ? "conflicting"
      : builds.size
        ? ({ 36: "NCBI36", 37: "GRCh37", 38: "GRCh38" } as Record<string, string>)[[...builds][0]!]!
        : provider === "AncestryDNA"
          ? "GRCh37"
          : "unknown";
  const negative = /(?:minus|negative|reverse|\(-\))\s+strand/i.test(text);
  const positive = /(?:plus|positive|forward|\(\+\))\s+strand/i.test(text);
  const strand = negative ? (positive ? "conflicting" : "reverse") : "forward";
  return {
    provider,
    build,
    strand,
    buildSource: builds.size
      ? "file header"
      : provider === "AncestryDNA"
        ? "documented AncestryDNA format"
        : "not supplied",
    strandSource: positive || negative ? "file header" : "documented provider format",
  };
}
