import { deflateRawSync, crc32 } from "node:zlib";

/** Synthetic BGZF bytes exercise the real browser reader, not a substituted parser. */
export function bgzfBytes(text: string, chunkSize = 65280) {
  const input = Buffer.from(text),
    parts = [];
  for (let offset = 0; offset < input.length; offset += chunkSize) {
    const chunk = input.subarray(offset, offset + chunkSize);
    const compressed = deflateRawSync(chunk);
    const block = Buffer.alloc(26 + compressed.length);
    block.set([31, 139, 8, 4, 0, 0, 0, 0, 0, 255, 6, 0, 66, 67, 2, 0]);
    block.writeUInt16LE(block.length - 1, 16);
    compressed.copy(block, 18);
    block.writeUInt32LE(crc32(chunk) >>> 0, block.length - 8);
    block.writeUInt32LE(chunk.length, block.length - 4);
    parts.push(block);
  }
  return Buffer.concat(parts);
}

export const header = {
  meta: ["##fileformat=VCFv4.2", "##reference=GRCh38", "##contig=<ID=1,length=248956422>"],
  columns: ["CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO", "FORMAT", "SAMPLE"],
};

export function vcfSource(
  records: string[][] = [],
  {
    beforeRead = () => {},
    text,
  }: { beforeRead?: (read: number) => void | Promise<void>; text?: string } = {},
) {
  const bytes = bgzfBytes(
    text ??
      `${header.meta.join("\n")}\n#${header.columns.join("\t")}\n${records.map((row) => row.join("\t")).join("\n")}\n`,
  );
  return {
    size: bytes.length,
    bytesRead: 0,
    reads: 0,
    async slice(start: number | undefined, end: number | undefined) {
      this.reads++;
      await beforeRead(this.reads);
      const chunk = bytes.subarray(start, end);
      this.bytesRead += chunk.length;
      return chunk;
    },
  };
}

export { mockDocument as testDocument } from "./fixture.ts";
