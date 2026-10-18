import { catalogConditionReferences } from "./reference/condition-links.ts";

export const CATALOG_COLUMNS =
  "chrom pos ref alt sig stars gene conditions af grp afmax an variationid alleleid classification reviewstatus rsids hgvs pmids releasedate citationdate conflictingclassifications gnomadkey conditionmedgenids gnomadac gnomadfilter gnomaddiscordancep".split(
    " ",
  );
export const CATALOG_HEADER = "#" + CATALOG_COLUMNS.join("\t");
export const FREQUENCY_HEADER =
  "#chrom\tpos\tref\talt\taf\tgrp\tafmax\tan\tac\tfilter\tdiscordancep";
export const ALLELE_HEADER = "#alleleid\taf\tgrp\tafmax\tan\tac\tfilter\tdiscordancep\tgnomadkey";
export const MISSING_FREQUENCY = [".", ".", ".", ".", ".", ".", "."];
const STARS: Record<string, number> = {
  practice_guideline: 4,
  reviewed_by_expert_panel: 3,
  "criteria_provided,_multiple_submitters,_no_conflicts": 2,
  "criteria_provided,_single_submitter": 1,
  "criteria_provided,_conflicting_classifications": 1,
};

// Catalogue selection is a teaching scope, not a clinical significance decision.
function classificationCode(significance = "") {
  if (/Conflicting/.test(significance)) return "C";
  if (/^Pathogenic\/Likely/.test(significance)) return "PLP";
  if (/^Pathogenic/.test(significance)) return "P";
  if (/^Likely_pathogenic/.test(significance)) return "LP";
  if (/^Benign|^Likely_benign|Uncertain/.test(significance)) return null;
  return /(drug_response|risk_factor|risk_allele|association|protective|Affects|confers)/.test(
    significance,
  )
    ? "O"
    : null;
}

export function parseClinvar(line: string) {
  if (!line || line.startsWith("#")) return null;
  const fields = line.split("\t");
  if (fields.length < 8 || !/^[1-9]\d*$/.test(fields[1]!))
    throw new Error("Malformed ClinVar VCF row");
  const [chrom, position, variationId, ref, alt] = fields as [
    string,
    string,
    string,
    string,
    string,
    ...string[],
  ];
  if (ref.length > 50 || alt.length > 50 || !/^[ACGTN]+$/.test(ref) || !/^[ACGTN]+$/.test(alt))
    return null;
  const info = Object.fromEntries(
    fields[7]!.split(";").map((field) => {
      const at = field.indexOf("=");
      return at < 0 ? [field, ""] : [field.slice(0, at), field.slice(at + 1)];
    }),
  );
  const code = classificationCode(info["CLNSIG"]);
  if (!code) return null;
  return {
    chrom,
    pos: +position,
    variationId,
    ref,
    alt,
    info,
    code,
    key: `${chrom}:${position}:${ref}:${alt}`,
    frequencyKey: `${chrom}-${position}-${ref}-${alt}`,
  };
}

export function catalogFields(
  record: NonNullable<ReturnType<typeof parseClinvar>>,
  {
    frequency = MISSING_FREQUENCY,
    frequencyKey = "",
    pmids = [],
    releaseDate = "",
    citationDate = "",
  }: {
    frequency?: string[];
    frequencyKey?: string;
    pmids?: Iterable<string> | undefined;
    releaseDate?: string;
    citationDate?: string;
  } = {},
) {
  const { chrom, pos, variationId, ref, alt, info, code } = record;
  const conditions = catalogConditionReferences(info["CLNDN"] || "", info["CLNDISDB"] || "");
  return [
    chrom,
    pos,
    ref,
    alt,
    code,
    STARS[info["CLNREVSTAT"] || ""] || 0,
    (info["GENEINFO"] || "").split("|")[0]!.split(":")[0],
    conditions.map((c) => c.name).join("|"),
    ...frequency.slice(0, 4),
    variationId,
    info["ALLELEID"] || "",
    info["CLNSIG"] || "",
    info["CLNREVSTAT"] || "",
    info["RS"] || "",
    info["CLNHGVS"] || "",
    [...pmids].join(","),
    releaseDate,
    citationDate,
    info["CLNSIGCONF"] || "",
    frequencyKey,
    conditions.map((c) => c.ids.join(",")).join("|"),
    ...[4, 5, 6].map((index) => frequency[index] || "."),
  ];
}
