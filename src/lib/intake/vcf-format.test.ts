import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { hasCompressedVcfHeader } from "./vcf-format.ts";
import { bgzfBytes } from "../../../tests/helpers/vcf.ts";
import { getReadingContext } from "../diagnostics/reading.ts";

test("compressed VCF recognition works across gzip members without requiring a whole header", async () => {
  const text = "##fileformat=VCFv4.2\n##source=synthetic\n";
  assert.equal(await hasCompressedVcfHeader(new Blob([bgzfBytes(text, 1)])), true);
  assert.equal(await hasCompressedVcfHeader(new Blob([gzipSync(text)])), true);
  assert.equal(await hasCompressedVcfHeader(new Blob([gzipSync("# 23andMe\n")])), false);
  assert.equal(await hasCompressedVcfHeader(new Blob([text])), false);
});

test("long optional gzip headers are recognized incrementally without a total-byte cutoff", async (t) => {
  const gzip = gzipSync("##fileformat=VCFv4.2\n");
  const header = Buffer.from(gzip.subarray(0, 10));
  header[3] = 8; // FNAME: a zero-terminated optional filename follows the header.
  const bytes = Buffer.concat([
    header,
    Buffer.alloc(70000, 65),
    Buffer.from([0]),
    gzip.subarray(10),
  ]);
  const file = new Blob([bytes]);
  const slice = file.slice.bind(file);
  const reads: Array<[number | undefined, number | undefined]> = [];
  t.mock.method(file, "slice", (start?: number, end?: number) => {
    reads.push([start, end]);
    return slice(start, end);
  });
  assert.equal(await hasCompressedVcfHeader(file), true);
  assert.deepEqual(reads, [
    [0, 65536],
    [65536, 131072],
  ]);
});

test("a truncated optional gzip header reaches EOF without a false VCF match", async () => {
  const bytes = Buffer.alloc(70000, 65);
  bytes.set([31, 139, 8, 8, 0, 0, 0, 0, 0, 255]);
  assert.equal(await hasCompressedVcfHeader(new Blob([bytes])), false);
});

test("a long gzip-header probe can be cancelled between file chunks", async (t) => {
  const bytes = Buffer.alloc(140000, 65);
  bytes.set([31, 139, 8, 8, 0, 0, 0, 0, 0, 255]);
  const file = new Blob([bytes]);
  const slice = file.slice.bind(file);
  const controller = new AbortController();
  let reads = 0;
  t.mock.method(file, "slice", (start?: number, end?: number) => {
    reads++;
    if (reads === 2) controller.abort();
    return slice(start, end);
  });
  await assert.rejects(hasCompressedVcfHeader(file, controller.signal), { name: "AbortError" });
  assert.equal(reads, 2);
});

test("highly compressed unrelated content is rejected from its prefix", async () => {
  const bytes = gzipSync("X".repeat(10 * 1024 * 1024));
  assert.equal(await hasCompressedVcfHeader(new Blob([bytes])), false);
});

test("a cancelled probe does not read a file", async (t) => {
  const file = new Blob([gzipSync("##fileformat=VCFv4.2\n")]);
  t.mock.method(file, "slice", () => {
    throw new Error("must not read");
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(hasCompressedVcfHeader(file, controller.signal), { name: "AbortError" });
});

test("prefix-read failures retain identity and only report compression actually observed", async (t) => {
  const secret = "PRIVATE_PROBE_FILENAME_AND_NATIVE_MESSAGE";
  const bytes = Buffer.alloc(140000, 65);
  bytes.set([31, 139, 8, 8, 0, 0, 0, 0, 0, 255]);
  for (const failOnRead of [1, 2]) {
    const file = new File([bytes], `${secret}.gz`);
    const slice = file.slice.bind(file);
    const failure = new DOMException(secret, "NotReadableError");
    let reads = 0;
    t.mock.method(file, "slice", (start?: number, end?: number) => {
      if (++reads === failOnRead) throw failure;
      return slice(start, end);
    });
    await assert.rejects(hasCompressedVcfHeader(file), (error: unknown) => {
      assert.equal(error, failure);
      assert.deepEqual(getReadingContext(error), {
        readingStep: "format-detection",
        ...(failOnRead === 2 ? { inputContainer: "gzip" } : {}),
      });
      assert.ok(!JSON.stringify(getReadingContext(error)).includes(secret));
      return true;
    });
  }
  const abort = new DOMException(secret, "AbortError");
  await assert.rejects(
    hasCompressedVcfHeader(new Blob([bytes]), AbortSignal.abort(abort)),
    (error: unknown) => {
      assert.equal(error, abort);
      assert.deepEqual(getReadingContext(error), {});
      return true;
    },
  );
  const malformed = gzipSync("##fileformat=VCFv4.2\n");
  malformed[10] = 7; // A malformed DEFLATE prefix is still only a failed routing hint.
  assert.equal(await hasCompressedVcfHeader(new Blob([malformed])), false);
});
