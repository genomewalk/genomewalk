import { Gunzip } from "fflate";
import { yieldToLoop } from "../async/schedule.ts";
import { withReadingContext } from "../diagnostics/reading.ts";

export const compressedVcfExtensions = ".vcf.gz,.vcf.bgz,.gvcf.gz,.gvcf.bgz";
export const isCompressedVcfName = (name: string) => /\.(?:g?vcf)\.(?:gz|bgz)$/i.test(name);

/** A routing hint only; the VCF reader still validates BGZF blocks and the header. */
export async function hasCompressedVcfHeader(file: Blob, signal?: AbortSignal) {
  let gzipObserved = false;
  try {
    signal?.throwIfAborted();
    // Stop as soon as the fixed signature matches or differs. Read incrementally
    // so long optional gzip headers are supported without unpacking the genome.
    const signature = "##fileformat=VCF";
    let matched = 0;
    let mismatch = false;
    const decoder = new Gunzip((data) => {
      for (let i = 0; i < data.length && matched < signature.length && !mismatch; i++) {
        if (data[i] !== signature.charCodeAt(matched)) mismatch = true;
        else matched++;
      }
    });
    for (let offset = 0; offset < file.size; offset += 65536) {
      signal?.throwIfAborted();
      const bytes = new Uint8Array(await file.slice(offset, offset + 65536).arrayBuffer());
      signal?.throwIfAborted();
      if (!offset && (bytes[0] !== 31 || bytes[1] !== 139)) return false;
      if (!offset) gzipObserved = true;
      if (!bytes.length) return false;
      for (let part = 0; part < bytes.length; part += 64) {
        signal?.throwIfAborted();
        try {
          // Tiny pushes bound decoded work even for highly compressed data.
          decoder.push(bytes.subarray(part, part + 64), false);
        } catch (error) {
          // A malformed prefix is not evidence of VCF. Its selected reader reports
          // the actual archive error; programming errors must remain visible.
          if (
            error instanceof Error &&
            "code" in error &&
            typeof error.code === "number" &&
            [0, 1, 2, 3, 6].includes(error.code)
          )
            return false;
          throw error;
        }
        if (mismatch || matched === signature.length) return !mismatch;
        if ((part + 64) % 4096 === 0) await yieldToLoop();
      }
    }
    signal?.throwIfAborted();
    return false;
  } catch (error) {
    throw withReadingContext(error, {
      readingStep: "format-detection",
      ...(gzipObserved ? { inputContainer: "gzip" } : {}),
    });
  }
}
