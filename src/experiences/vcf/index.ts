import type { ByteSource } from "../../lib/io/types.ts";
import { AppError } from "../../lib/app-error.ts";
import { withReadingContext } from "../../lib/diagnostics/reading.ts";
import type { SelectionData, SelectionKind } from "../types.ts";
import { currentBuild, selectSource } from "./engine/context.ts";
import { STEPS, ctx, FileSource, detectBuild } from "./engine/learn.ts";
import { readHeader } from "./engine/vcf.ts";
import { session, resetSession } from "./engine/session.ts";
import { compressedVcfExtensions, isCompressedVcfName } from "../../lib/intake/vcf-format.ts";

// File selection activates the VCF experience and resets its private session.
export default {
  id: "vcf",
  accept: `${compressedVcfExtensions},.gz,.bgz`,
  label: "A bgzip-compressed VCF/gVCF (.vcf.gz, .vcf.bgz, .gvcf.gz or .gvcf.bgz)",
  chapters: STEPS,
  context: ctx,
  session,
  matches: (file: { name: string }) => isCompressedVcfName(file.name),
  async open(file: File, signal?: AbortSignal) {
    const opened = await this.openSource(new FileSource(file), signal);
    return { ...opened, source: new FileSource(file) };
  },
  async openSource(source: ByteSource, signal?: AbortSignal) {
    try {
      const header = await readHeader(source, signal);
      const hasFormat = header.meta.some((line) => line.startsWith("##fileformat=VCF"));
      if (!hasFormat || header.columns[0] !== "CHROM")
        throw new AppError(
          "VCF_HEADER_INVALID",
          "Choose a compressed VCF containing a sample genotype.",
          {
            ...(source.size > 0 ? { inputContainer: "bgzf" } : {}),
            failureReason: hasFormat ? "vcf-column-header-missing" : "vcf-format-marker-missing",
          },
        );
      if (header.columns.length < 10)
        throw new AppError(
          "VCF_SAMPLE_MISSING",
          "Choose a compressed VCF containing a sample genotype.",
          { inputContainer: "bgzf" },
        );
      return { source, header, build: detectBuild(header.meta) };
    } catch (error) {
      throw withReadingContext(error, { readerKind: "vcf", readingStep: "header" });
    }
  },
  select({ source, header, selectedBuild }: SelectionData, name: string, kind?: SelectionKind) {
    if (!("slice" in source)) throw new Error("A VCF selection requires a byte reader.");
    selectSource(source as ByteSource, header, selectedBuild);
    resetSession(name, kind);
  },
  clear() {
    selectSource(null);
    resetSession("");
    session.fileName = null;
  },
  describe() {
    return {
      size: ctx.source?.size || 0,
      build: currentBuild(),
      selectedBuild: ctx.selectedBuild,
    };
  },
};
