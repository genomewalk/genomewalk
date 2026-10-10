import fs from "node:fs";
import zlib from "node:zlib";
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
