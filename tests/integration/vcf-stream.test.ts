import test from "node:test";
import assert from "node:assert/strict";
import { readHeader, streamVariants } from "../../src/experiences/vcf/engine/vcf.ts";
import { FileSource, streamBlocks } from "../../src/lib/io/bgzf.ts";
import { AppError } from "../../src/lib/app-error.ts";
import { getReadingContext } from "../../src/lib/diagnostics/reading.ts";
import { bgzfBytes } from "../helpers/vcf.ts";
const source = (bytes: Buffer<ArrayBuffer>) => ({
  size: bytes.length,
  async slice(a: number | undefined, b: number | undefined) {
    return bytes.subarray(a, b);
  },
});

test("VCF streaming preserves UTF-8 across blocks, CRLF and a final row without newline", async () => {
  const text =
    "##fileformat=VCFv4.2\r\n##source=éclair\r\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\r\n1\t100\trs1\tT\tTC\t.\tPASS\t.\tGT\t1/1";
  const src = source(bgzfBytes(text, 1));
  const header = await readHeader(src);
  assert.equal(header.meta[1], "##source=éclair");
  assert.equal(header.columns.at(-1), "SAMPLE");
  const rows: (string | unknown[])[] = [];
  await streamVariants(src, (row) => rows.push(row));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.at(-1), "1/1");
});

test("batched VCF scans preserve every row and report monotonic progress across blocks", async (t) => {
  let tick = 0;
  t.mock.method(performance, "now", () => (tick += 31));
  const expected = Array.from({ length: 200 }, (_, i) => [
    "1",
    String(i + 1),
    `rs${i + 1}`,
    "T",
    "TC",
    ".",
    "PASS",
    "note=é",
    "GT",
    "0/1",
  ]);
  const text = ["##fileformat=VCFv4.2", "", ...expected.map((row) => row.join("\t"))].join("\r\n");
  const actual: string[][] = [],
    progress: number[] = [];
  await streamVariants(
    source(bgzfBytes(text, 257)),
    (row) => actual.push(row),
    (p) => progress.push(p),
  );
  assert.deepEqual(actual, expected);
  assert.ok(progress.length > 1);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((p, i) => p >= 0 && p <= 1 && (!i || p >= progress[i - 1]!)));
});

test("a VCF scan can be cancelled between batches without reporting completion", async (t) => {
  let tick = 0;
  t.mock.method(performance, "now", () => (tick += 61));
  const controller = new AbortController();
  const progress: number[] = [];
  let count = 0;
  const row = "1\t100\t.\tT\tTC\t.\tPASS\t.\tGT\t0/1\n";
  await assert.rejects(
    streamVariants(
      source(bgzfBytes(row.repeat(100), 512)),
      () => {
        count++;
      },
      (p) => {
        progress.push(p);
        controller.abort();
      },
      controller.signal,
    ),
    { name: "AbortError" },
  );
  assert.ok(count > 0 && count < 100);
  assert.equal(progress.length, 1);
  assert.ok(progress.every((p) => p < 1));
});

test("truncated and corrupt VCF blocks fail instead of silently returning partial results", async () => {
  const bytes = bgzfBytes("##fileformat=VCFv4.2\n");
  await assert.rejects(Array.fromAsync(streamBlocks(source(bytes.subarray(0, -1)))), {
    name: "AppError",
    code: "VCF_TRUNCATED",
    message: /truncated/,
  });
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 8]! ^= 1;
  await assert.rejects(Array.fromAsync(streamBlocks(source(corrupt))), {
    name: "AppError",
    code: "VCF_BLOCK_INVALID",
    message: /integrity/,
  });
  const invalidDeflate = Buffer.from(bytes);
  invalidDeflate[18] = 7; // Reserved DEFLATE block type after the BGZF header.
  await assert.rejects(Array.fromAsync(streamBlocks(source(invalidDeflate))), {
    name: "AppError",
    code: "VCF_BLOCK_INVALID",
    message: /decompressed/,
  });
});

test("BGZF failures identify structural reasons without retaining input bytes or positions", async () => {
  const secret = "PRIVATE_PROBE_VCF_HEADER_SAMPLE_AND_FILENAME";
  const text = `##fileformat=VCFv4.2\n##source=${secret}\n`;
  const bytes = bgzfBytes(text);
  const altered = (change: (value: Buffer<ArrayBuffer>) => void) => {
    const result = Buffer.from(bytes);
    change(result);
    return result;
  };
  const cases = [
    [Buffer.from(secret), "bgzf-signature-missing", undefined],
    [altered((value) => value.writeUInt16LE(3, 14)), "bgzf-header-incomplete", "gzip"],
    [
      altered((value) => {
        value[12] = 88;
      }),
      "bgzf-extra-field-missing",
      "gzip",
    ],
    [altered((value) => value.writeUInt16LE(10, 16)), "bgzf-block-size-invalid", "bgzf"],
    [bytes.subarray(0, -1), "payload-incomplete", "bgzf"],
    [
      altered((value) => value.writeUInt32LE(65537, value.length - 4)),
      "decoded-size-invalid",
      "bgzf",
    ],
    [
      altered((value) => {
        value[18] = 7;
      }),
      "decompression-failed",
      "bgzf",
    ],
    [
      altered((value) => value.writeUInt32LE(Buffer.byteLength(text) + 1, value.length - 4)),
      "decoded-size-mismatch",
      "bgzf",
    ],
    [
      altered((value) => {
        value[value.length - 8]! ^= 1;
      }),
      "checksum-mismatch",
      "bgzf",
    ],
  ] as const;
  for (const [input, reason, container] of cases) {
    await assert.rejects(Array.fromAsync(streamBlocks(source(input))), (error: unknown) => {
      assert.ok(error instanceof AppError);
      const details = { ...getReadingContext(error), ...error.details };
      assert.equal(details.failureReason, reason);
      assert.equal(details.inputContainer, container);
      assert.equal(details.readerKind, undefined, "the shared BGZF reader must not assume VCF");
      assert.ok(!JSON.stringify(details).includes(secret));
      assert.ok(!JSON.stringify(error).includes(secret));
      return true;
    });
  }
});

test("VCF reads and text decoding preserve native failure identity with safe operation context", async (t) => {
  const secret = "PRIVATE_PROBE_FILENAME_OR_NATIVE_MESSAGE";
  const failure = new DOMException(secret, "NotReadableError");
  const file = new File([bgzfBytes("##fileformat=VCFv4.2\n")], `${secret}.vcf.gz`);
  t.mock.method(file, "slice", () => {
    throw failure;
  });
  await assert.rejects(Array.fromAsync(streamBlocks(new FileSource(file))), (error: unknown) => {
    assert.equal(error, failure);
    assert.deepEqual(getReadingContext(error), { readerKind: "vcf", readingStep: "read-bytes" });
    return true;
  });

  for (const step of ["header", "records"] as const) {
    const failure = new RangeError("Invalid string length");
    const mock = t.mock.method(TextDecoder.prototype, "decode", () => {
      throw failure;
    });
    const src = source(bgzfBytes("##fileformat=VCFv4.2\n"));
    await assert.rejects(
      step === "header" ? readHeader(src) : streamVariants(src, () => {}),
      (error: unknown) => {
        assert.equal(error, failure);
        assert.deepEqual(getReadingContext(error), {
          readingStep: step,
          inputContainer: "bgzf",
          ...(step === "records" ? { readerKind: "vcf" } : {}),
        });
        return true;
      },
    );
    mock.mock.restore();
  }

  const abort = new DOMException(secret, "AbortError");
  const cancelled = AbortSignal.abort(abort);
  await assert.rejects(
    Array.fromAsync(streamBlocks(source(bgzfBytes("x")), undefined, cancelled)),
    (error: unknown) => {
      assert.equal(error, abort);
      assert.deepEqual(getReadingContext(error), {});
      return true;
    },
  );
});

test("VCF row processing failures retain native identity and the records operation", async () => {
  const failure = new RangeError("PRIVATE_PROBE_NATIVE_ROW_MESSAGE");
  await assert.rejects(
    streamVariants(source(bgzfBytes("1\t100\t.\tC\tT\t.\tPASS\t.\tGT\t0/1\n")), () => {
      throw failure;
    }),
    (error: unknown) => {
      assert.equal(error, failure);
      assert.deepEqual(getReadingContext(error), { readerKind: "vcf", readingStep: "records" });
      assert.ok(!JSON.stringify(getReadingContext(error)).includes("PRIVATE_PROBE"));
      return true;
    },
  );
});

test("cancelled VCF reads stop before touching the source", async () => {
  const controller = new AbortController();
  controller.abort();
  const src = {
    size: 1,
    slice() {
      throw new Error("should not read");
    },
  };
  await assert.rejects(
    streamVariants(src, () => {}, null, controller.signal),
    { name: "AbortError" },
  );
});
