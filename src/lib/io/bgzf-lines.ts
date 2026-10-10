import type { ByteSource } from "./types.ts";
import { streamBlocks } from "./bgzf.ts";

/** Reassemble bounded batches, so full scans need not await every individual line. */
export async function* bgzfLineBatches(
  source: ByteSource,
  signal?: AbortSignal,
  chunkSize?: number,
) {
  const decoder = new TextDecoder();
  let carry = "";
  let progress = 0;
  for await (const block of streamBlocks(source, chunkSize, signal)) {
    const lines = (carry + decoder.decode(block.data, { stream: true })).split("\n");
    carry = lines.pop()!;
    progress = Math.min((block.offset + block.blockLen) / source.size, 1);
    if (lines.length) yield { lines: lines.map((line) => line.replace(/\r$/, "")), progress };
  }
  carry += decoder.decode();
  if (carry) yield { lines: [carry.replace(/\r$/, "")], progress };
}

/** Line-by-line access lets previews stop as soon as they have enough examples. */
export async function* bgzfLines(source: ByteSource, signal?: AbortSignal, chunkSize?: number) {
  for await (const { lines, progress } of bgzfLineBatches(source, signal, chunkSize))
    for (const line of lines) yield { line, progress };
}
