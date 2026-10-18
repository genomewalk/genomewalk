import type { ByteSource } from "../../lib/io/types.ts";
import type { SelectionData, SelectionKind } from "../types.ts";
import { currentBuild, selectSource } from "./engine/context.ts";
import { STEPS, ctx, FileSource, detectBuild } from "./engine/learn.ts";
import { readHeader } from "./engine/vcf.ts";
import { session, resetSession } from "./engine/session.ts";

// File selection activates the VCF experience and resets its private session.
export default {
  id: "vcf",
  accept: ".vcf.gz,.vcf.bgz",
  label: "A compressed VCF (.vcf.gz or .vcf.bgz)",
  chapters: STEPS,
  context: ctx,
  session,
  matches: (file: { name: string }) => /\.vcf\.(gz|bgz)$/i.test(file.name),
  async open(file: File, signal?: AbortSignal) {
    const opened = await this.openSource(new FileSource(file), signal);
    return { ...opened, source: new FileSource(file) };
  },
  async openSource(source: ByteSource, signal?: AbortSignal) {
    const header = await readHeader(source, signal);
    if (
      !header.meta.some((line) => line.startsWith("##fileformat=VCF")) ||
      header.columns[0] !== "CHROM" ||
      header.columns.length < 10
    )
      throw new Error("Choose a compressed VCF containing a sample genotype.");
    return { source, header, build: detectBuild(header.meta) };
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
