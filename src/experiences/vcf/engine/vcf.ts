import type { ByteSource, Progress } from "../../../lib/io/types.ts";
import { bgzfLines, bgzfLineBatches } from "../../../lib/io/bgzf-lines.ts";
import { yieldToLoop } from "../../../lib/async/schedule.ts";

/** Read metadata and column names; no full-file scan is needed. */
export async function readHeader(source: ByteSource, signal?: AbortSignal) {
  const meta = [];
  let columns: string[] = [];
  for await (const { line } of bgzfLines(source, signal, 64 << 10)) {
    if (line.startsWith("##")) meta.push(line);
    else if (line.startsWith("#CHROM")) {
      columns = line.slice(1).split("\t");
      break;
    } else if (line) break;
  }
  return { meta, columns };
}

/** Stream data rows without retaining the genome; yield periodically so progress paints. */
export async function streamVariants(
  source: ByteSource,
  onLine: (fields: string[]) => void,
  onProgress?: Progress | null,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  let lastTick = performance.now();
  for await (const { lines, progress } of bgzfLineBatches(source, signal)) {
    for (const line of lines) {
      if (!line || line.charCodeAt(0) === 35) continue;
      onLine(line.split("\t"));
    }
    // Check the paint budget once per decoded block, instead of reading the
    // browser's high-resolution clock millions of times.
    if (performance.now() - lastTick > 60) {
      signal?.throwIfAborted();
      onProgress?.(progress);
      await yieldToLoop();
      lastTick = performance.now();
    }
  }
  signal?.throwIfAborted();
  onProgress?.(1);
}
