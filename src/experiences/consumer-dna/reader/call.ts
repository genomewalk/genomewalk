import { AppError } from "../../../lib/app-error.ts";
import type { ConsumerProfile } from "../types.ts";
import { normChrom } from "../engine/identity.ts";
import { isAutosome } from "../engine/calls.ts";

export function decodeConsumerCall(fields: string[], profile: ConsumerProfile) {
  if (fields.length !== (profile.provider === "23andMe" ? 4 : 5))
    throw new AppError("DNA_COLUMNS_INVALID", "A DNA row has an unexpected number of columns.");
  const [id = "", rawChrom = "", position = ""] = fields;
  if (!/^\d+$/.test(position) || Number(position) < 1)
    throw new AppError("DNA_POSITION_INVALID", "A DNA row has an invalid position.");
  const chrom =
    profile.provider === "AncestryDNA" && rawChrom === "23"
      ? "X"
      : profile.provider === "AncestryDNA" && rawChrom === "24"
        ? "Y"
        : normChrom(rawChrom);
  if (profile.provider === "AncestryDNA" && !fields.slice(3).every((a) => /^[ACGTIDN0-]$/i.test(a)))
    throw new AppError(
      "DNA_GENOTYPE_INVALID",
      "An AncestryDNA allele column is missing or invalid.",
    );
  const encoded = profile.provider === "23andMe" ? fields[3]! : fields.slice(3).join("");
  if (!/^[ACGTIDN0-]{1,2}$/i.test(encoded))
    throw new AppError(
      "DNA_GENOTYPE_INVALID",
      "A DNA row contains an unrecognized genotype encoding.",
    );
  const alleles = [...encoded.toUpperCase()].map((a) => (/[N0-]/.test(a) ? null : a));
  const missing = alleles.filter((a) => a === null).length;
  const status: "called" | "no-call" | "partial" | "unsupported" =
    missing === alleles.length
      ? "no-call"
      : missing
        ? "partial"
        : alleles.some((a) => !/^[ACGT]$/.test(a!))
          ? "unsupported"
          : "called";
  return {
    chrom,
    pos: Number(position),
    id,
    alleles,
    status,
    fields,
    format: "consumer",
    gt: encoded,
    ref: null,
    alts: [],
    filter: "unknown",
    quality: null,
    phase: "unphased",
    ploidy: isAutosome(chrom) && alleles.length === 2 ? 2 : null,
    canMatch:
      profile.strand === "forward" &&
      ["GRCh37", "GRCh38"].includes(profile.build) &&
      isAutosome(chrom) &&
      alleles.length === 2 &&
      status === "called",
    referenceEnd: null,
  };
}
