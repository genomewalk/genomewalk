import { bgzfLines } from "../io/bgzf-lines.ts";
import { yieldToLoop } from "../async/schedule.ts";

/** Index the shipped TSV while decoding bounded blocks, without a second full text copy. */
export async function indexCatalogue(bytes: Uint8Array, signal?: AbortSignal) {
  const source = {
    size: bytes.length,
    async slice(start: number, end: number) {
      return bytes.subarray(start, end);
    },
  };
  const map = new Map<string, string>(),
    byClass: Record<string, number> = {},
    byStars: Record<string, number> = {},
    sample = [];
  let header = "",
    n = 0,
    lastYield = performance.now();
  for await (const { line } of bgzfLines(source, signal)) {
    if (!line) continue;
    if (line.startsWith("#")) {
      header = line;
      continue;
    }
    const [chrom, pos, ref, alt, classification, stars] = line.split("\t", 6);
    map.set(`${chrom}:${pos}:${ref}:${alt}`, line);
    byClass[classification!] = (byClass[classification!] || 0) + 1;
    byStars[stars!] = (byStars[stars!] || 0) + 1;
    if (sample.length < 6) sample.push(line);
    n++;
    if (performance.now() - lastYield > 30) {
      await yieldToLoop();
      signal?.throwIfAborted();
      lastYield = performance.now();
    }
  }
  return { map, byClass, byStars, sample, header, n };
}
