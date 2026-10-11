import fs from "node:fs";
import zlib from "node:zlib";
import { gunzipSync } from "fflate";
import { atomicWriter } from "./atomic.ts";

// Bounded BGZF writer: neither the full text nor all compressed blocks are buffered.
export function bgzfWriter(destination: string) {
  const output = atomicWriter(destination);
  const buffer = Buffer.alloc(65280);
  let used = 0;
  function flush() {
    const chunk = buffer.subarray(0, used);
    const compressed = zlib.deflateRawSync(chunk, { level: 6 });
    const block = Buffer.alloc(26 + compressed.length);
    block.set([31, 139, 8, 4, 0, 0, 0, 0, 0, 255, 6, 0, 66, 67, 2, 0]);
    block.writeUInt16LE(block.length - 1, 16);
    compressed.copy(block, 18);
    block.writeUInt32LE(zlib.crc32(chunk) >>> 0, block.length - 8);
    block.writeUInt32LE(chunk.length, block.length - 4);
    output.write(block);
    used = 0;
  }
  return {
    write(text: string) {
      const bytes = Buffer.from(text);
      for (let offset = 0; offset < bytes.length;) {
        const count = Math.min(buffer.length - used, bytes.length - offset);
        bytes.copy(buffer, used, offset, offset + count);
        used += count;
        offset += count;
        if (used === buffer.length) flush();
      }
    },
    commit() {
      if (used) flush();
      flush(); // Standard empty EOF member.
      output.commit();
      return fs.statSync(destination).size;
    },
    abort: output.abort,
  };
}

export function bgzfWrite(text: string, destination: string) {
  const writer = bgzfWriter(destination);
  try {
    writer.write(text);
    return writer.commit();
  } catch (error) {
    writer.abort();
    throw error;
  }
}

/** Returns the BGZF block size, or -1 until its extra fields are buffered. */
function blockLength(bytes: Uint8Array, at = 0) {
  if (at + 12 > bytes.length) return -1;
  if (bytes[at]! !== 31 || bytes[at + 1]! !== 139 || bytes[at + 2]! !== 8 || !(bytes[at + 3]! & 4))
    throw new Error("Choose a bgzip-compressed VCF (.vcf.gz or .vcf.bgz).");
  const extraEnd = at + 12 + (bytes[at + 10]! | (bytes[at + 11]! << 8));
  if (extraEnd > bytes.length) return -1;
  for (let offset = at + 12; offset + 4 <= extraEnd;) {
    const length = bytes[offset + 2]! | (bytes[offset + 3]! << 8);
    if (offset + 4 + length > extraEnd) throw new Error("The BGZF header is incomplete.");
    if (bytes[offset] === 66 && bytes[offset + 1] === 67 && length === 2) {
      const size = (bytes[offset + 4]! | (bytes[offset + 5]! << 8)) + 1;
      if (size < extraEnd - at + 8) throw new Error("The BGZF block size is invalid.");
      return size;
    }
    offset += 4 + length;
  }
  throw new Error("This gzip file is not BGZF. Compress the VCF with bgzip first.");
}

/** Read bounded blocks; truncated files and corrupt blocks fail explicitly. */
export async function* streamBlocks(
  source: { size: number; slice(start: number, end: number): Promise<Uint8Array> },
  chunkSize = 4 << 20,
  signal?: AbortSignal,
) {
  let filePos = 0,
    offset = 0,
    bytes = new Uint8Array(0);
  while (filePos < source.size || bytes.length) {
    signal?.throwIfAborted();
    const size = blockLength(bytes);
    if (size < 0 || bytes.length < size) {
      if (filePos >= source.size)
        throw new Error("The BGZF file is truncated. Choose a complete file.");
      const chunk = await source.slice(filePos, Math.min(filePos + chunkSize, source.size));
      if (!chunk.length) throw new Error("The genome file could not be read completely.");
      filePos += chunk.length;
      const merged = new Uint8Array(bytes.length + chunk.length);
      merged.set(bytes);
      merged.set(chunk, bytes.length);
      bytes = merged;
      continue;
    }
    const block = bytes.subarray(0, size);
    const footer = new DataView(block.buffer, block.byteOffset + size - 8, 8);
    // fflate uses ISIZE when allocating output; validate it before decoding.
    if (footer.getUint32(4, true) > 65536)
      throw new Error("The BGZF block exceeds its maximum decoded size.");
    const data = gunzipSync(block);
    if (
      data.length > 65536 ||
      data.length !== footer.getUint32(4, true) ||
      zlib.crc32(data) !== footer.getUint32(0, true)
    )
      throw new Error(
        "A BGZF block failed its integrity check. Choose a complete, unmodified file.",
      );
    yield { data, offset, blockLen: size };
    offset += size;
    bytes = bytes.subarray(size);
  }
}
