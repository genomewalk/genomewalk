import type { Progress } from "../../lib/io/types.ts";
interface Checksum {
  crc: number;
  size: number;
}
interface DecodedEntry {
  chunks: Uint8Array<ArrayBuffer>[];
  finished: boolean;
  expected?: Checksum | undefined;
}
import { Gunzip, Unzip, UnzipInflate, strFromU8 } from "fflate";
import { crc32 } from "./engine/checksum.ts";
import { yieldToLoop } from "./engine/schedule.ts";

// Limits apply only to compact consumer exports; the streaming VCF path has
// no such file-size limit. Check decoded bytes as well as archive declarations.
export const MAX_BYTES = 128 * 1024 * 1024;
const error = () =>
  new Error("This consumer DNA archive is too large. Choose a raw TXT export under 128 MB.");

export async function unpack(file: Blob, signal?: AbortSignal, onProgress?: Progress) {
  if (file.size > MAX_BYTES) throw error();
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const zip = magic[0] === 80 && magic[1] === 75;
  const gzip = magic[0] === 31 && magic[1] === 139;
  if (!zip && !gzip) return file;
  let total = 0,
    failure: Error | null = null;
  const entries: DecodedEntry[] = [];
  const append = (entry: DecodedEntry, data: Uint8Array<ArrayBuffer>, final: boolean) => {
    total += data.length;
    if (total > MAX_BYTES) {
      failure = error();
      return;
    }
    entry.chunks.push(data);
    entry.finished = final;
  };
  let decoder: Unzip | Gunzip;
  let expectedGzip: Checksum | null = null;
  const checksums = new Map<string, Checksum>();
  if (zip) {
    // A ZIP's end record must still be present, even if its first payload
    // decompressed successfully. Reject partial downloads and split archives.
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (
        tail[i] === 80 &&
        tail[i + 1] === 75 &&
        tail[i + 2] === 5 &&
        tail[i + 3] === 6 &&
        i + 22 + (tail[i + 20]! | (tail[i + 21]! << 8)) === tail.length
      ) {
        end = i;
        break;
      }
    }
    if (end < 0)
      throw new Error("The ZIP is incomplete. Download it again or choose the extracted TXT file.");
    const directory = new DataView(tail.buffer, tail.byteOffset + end);
    if (
      directory.getUint16(4, true) ||
      directory.getUint16(6, true) ||
      directory.getUint16(10, true) === 65535
    )
      throw new Error("Split and ZIP64 archives are not supported. Choose the extracted TXT file.");
    const count = directory.getUint16(10, true);
    const centralSize = directory.getUint32(12, true);
    const centralOffset = directory.getUint32(16, true);
    if (count > 1000 || centralOffset + centralSize > file.size - (tail.length - end))
      throw new Error("The ZIP directory is invalid or too large. Choose the extracted TXT file.");
    const central = new Uint8Array(
      await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer(),
    );
    let offset = 0;
    for (let index = 0; index < count; index++) {
      if (offset + 46 > central.length) throw new Error("The ZIP directory is incomplete.");
      const record = new DataView(central.buffer, central.byteOffset + offset);
      if (record.getUint32(0, true) !== 0x02014b50)
        throw new Error("The ZIP directory is invalid.");
      const nameLength = record.getUint16(28, true);
      const next =
        offset + 46 + nameLength + record.getUint16(30, true) + record.getUint16(32, true);
      if (next > central.length) throw new Error("The ZIP directory is incomplete.");
      const name = strFromU8(
        central.subarray(offset + 46, offset + 46 + nameLength),
        !(record.getUint16(8, true) & 2048),
      );
      checksums.set(name, { crc: record.getUint32(16, true), size: record.getUint32(24, true) });
      offset = next;
    }
    decoder = new Unzip((entry) => {
      if (
        entry.name.startsWith("__MACOSX/") ||
        /(?:^|\/)\.[^/]+$/.test(entry.name) ||
        !/\.(txt|csv|tsv)$/i.test(entry.name)
      )
        return;
      if (entries.length) {
        failure = new Error(
          "This ZIP contains more than one DNA text file. Extract it and choose one file.",
        );
        return;
      }
      if (entry.originalSize! > MAX_BYTES) {
        failure = error();
        return;
      }
      const output: DecodedEntry = {
        chunks: [],
        finished: false,
        expected: checksums.get(entry.name),
      };
      entries.push(output);
      entry.ondata = (err, data, final) => {
        if (err) failure = err;
        else append(output, data, final);
      };
      entry.start();
    });
    decoder.register(UnzipInflate);
  } else {
    if (file.size < 18) throw new Error("The gzip file is incomplete.");
    const footer = new DataView(await file.slice(file.size - 8).arrayBuffer());
    expectedGzip = { crc: footer.getUint32(0, true), size: footer.getUint32(4, true) };
    const output: DecodedEntry = { chunks: [], finished: false };
    entries.push(output);
    decoder = new Gunzip((data, final) => append(output, data, final));
  }
  onProgress?.(0);
  for (let offset = 0; offset < file.size; offset += 65536) {
    signal?.throwIfAborted();
    const end = Math.min(offset + 65536, file.size);
    decoder.push(new Uint8Array(await file.slice(offset, end).arrayBuffer()), end === file.size);
    if (failure) throw failure;
    onProgress?.(end / file.size);
    await yieldToLoop();
  }
  if (entries.length !== 1 || !entries[0]!.finished)
    throw new Error("No complete DNA text file was found in this archive.");
  const output = entries[0]!;
  const expected = output.expected || expectedGzip;
  if (
    !expected ||
    expected.size !== total ||
    output.chunks.reduce((crc, bytes) => crc32(bytes, crc), 0) !== expected.crc
  )
    throw new Error(
      "The DNA archive failed its integrity check. Download it again or choose the extracted TXT file.",
    );
  return new Blob(output.chunks, { type: "text/plain" });
}

export async function* textLines(file: Blob, onProgress?: Progress | null, signal?: AbortSignal) {
  const decoder = new TextDecoder();
  let carry = "",
    first = true;
  for (let offset = 0; offset < file.size; offset += 256 * 1024) {
    signal?.throwIfAborted();
    const end = Math.min(offset + 256 * 1024, file.size);
    let text = decoder.decode(await file.slice(offset, end).arrayBuffer(), {
      stream: end !== file.size,
    });
    if (first) {
      text = text.replace(/^\uFEFF/, "");
      first = false;
    }
    carry += text;
    const parts = carry.split("\n");
    carry = parts.pop()!;
    for (const line of parts) {
      if (line.length > 65536) throw new Error("A DNA data row is too long.");
      yield line.replace(/\r$/, "");
    }
    if (carry.length > 65536) throw new Error("A DNA data row is too long.");
    onProgress?.(end / file.size);
    await yieldToLoop();
  }
  if (carry) yield carry.replace(/\r$/, "");
  signal?.throwIfAborted();
  onProgress?.(1);
}
