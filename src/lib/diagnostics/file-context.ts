import { AppError } from "../app-error.ts";

export const fileExtensions = [
  ".vcf.gz",
  ".vcf.bgz",
  ".gvcf.gz",
  ".gvcf.bgz",
  ".fastq.gz",
  ".fasta.gz",
  ".csv.gz",
  ".fq.gz",
  ".fa.gz",
  ".gvcf",
  ".vcf",
  ".fastq",
  ".fasta",
  ".bam",
  ".cram",
  ".csv",
  ".fq",
  ".fa",
  ".txt",
  ".tsv",
  ".zip",
  ".gz",
  ".bgz",
  "other",
] as const;
export const fileFormats = ["VCF", "23andMe", "AncestryDNA", "unrecognized", "unknown"] as const;
export const fileSizeBands = [
  "empty",
  "under-1-MB",
  "1-100-MB",
  "100-MB-1-GB",
  "1-GB-or-more",
  "unknown",
] as const;

export interface FileDiagnostics {
  file_extension: (typeof fileExtensions)[number];
  file_format: (typeof fileFormats)[number];
  file_size_band: (typeof fileSizeBands)[number];
}

type FileMetadata = { readonly name: string; readonly size: number };

/** Recognized suffixes include unsupported inputs for diagnosis, not reader routing. */
export function getFileDiagnostics(
  file: FileMetadata | undefined,
  format: unknown = "unknown",
): FileDiagnostics | undefined {
  if (!file) return undefined;
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  const size = file.size;
  return {
    file_extension:
      fileExtensions.find((extension) => extension !== "other" && name.endsWith(extension)) ||
      "other",
    file_format: fileFormats.find((value) => value === format) || "unknown",
    file_size_band:
      !Number.isSafeInteger(size) || size < 0
        ? "unknown"
        : size === 0
          ? "empty"
          : size < 1_000_000
            ? "under-1-MB"
            : size < 100_000_000
              ? "1-100-MB"
              : size < 1_000_000_000
                ? "100-MB-1-GB"
                : "1-GB-or-more",
  };
}

/** Call only for an opened source: format comes from its validated reader, never its name. */
export function getSourceFileDiagnostics(source: unknown): FileDiagnostics | undefined {
  if (!source || typeof source !== "object" || !("file" in source)) return undefined;
  const file = source.file;
  if (
    !file ||
    typeof file !== "object" ||
    !("name" in file) ||
    typeof file.name !== "string" ||
    !("size" in file) ||
    typeof file.size !== "number"
  )
    return undefined;
  const provider = "provider" in source ? source.provider : undefined;
  const format =
    provider === "23andMe" || provider === "AncestryDNA"
      ? provider
      : "slice" in source && typeof source.slice === "function"
        ? "VCF"
        : "unknown";
  return getFileDiagnostics({ name: file.name, size: file.size }, format);
}

/** Validation can reject a format; a failed read before detection cannot identify it. */
export function getOpeningFileDiagnostics(file: FileMetadata | undefined, error: unknown) {
  const unrecognized =
    error instanceof AppError &&
    [
      "FILE_TYPE_UNSUPPORTED",
      "DNA_HEADER_MISSING",
      "DNA_FORMAT_UNSUPPORTED",
      "VCF_HEADER_INVALID",
      "ARCHIVE_NO_DNA",
    ].includes(error.code);
  return getFileDiagnostics(file, unrecognized ? "unrecognized" : "unknown");
}
