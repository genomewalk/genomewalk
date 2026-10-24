import { AppError } from "../../../lib/app-error.ts";
import { detectReferenceBuild } from "../../../lib/genetics/reference-build.ts";

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
    throw new AppError(
      "DNA_FORMAT_UNSUPPORTED",
      "This is not a supported 23andMe or AncestryDNA raw export. Keep the original header and column names.",
    );
  const headerBuild = detectReferenceBuild(meta);
  const hasBuildMetadata =
    headerBuild !== "unknown" ||
    /\b(?:reference|assembly|build|(?:GRCh|NCBI|hg)[\s_-]*\d+|GC[AF]_\d+(?:\.\d+)?)\b/i.test(text);
  // Ancestry's documented raw export profile supplies build/strand when omitted
  // from its header. Explicit contradictory metadata always wins over defaults.
  const useProviderBuild = !hasBuildMetadata && provider === "AncestryDNA";
  const build = useProviderBuild ? "GRCh37" : headerBuild;
  const negative = /(?:minus|negative|reverse|\(-\))\s+strand/i.test(text);
  const positive = /(?:plus|positive|forward|\(\+\))\s+strand/i.test(text);
  const strand = negative ? (positive ? "conflicting" : "reverse") : "forward";
  return {
    provider,
    build,
    strand,
    buildSource: useProviderBuild
      ? "documented AncestryDNA format"
      : hasBuildMetadata
        ? "file header"
        : "not supplied",
    strandSource: positive || negative ? "file header" : "documented provider format",
  };
}
