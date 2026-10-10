import test from "node:test";
import assert from "node:assert/strict";
import { readHeader, streamVariants } from "../../src/experiences/vcf/engine/vcf.ts";
import { streamBlocks } from "../../src/lib/io/bgzf.ts";
import { indexCatalogue } from "../../src/lib/catalogues/reference-catalogue.ts";
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
  await assert.rejects(Array.fromAsync(streamBlocks(source(bytes.subarray(0, -1)))), /truncated/);
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 8]! ^= 1;
  await assert.rejects(Array.fromAsync(streamBlocks(source(corrupt))), /integrity/);
});

test("catalogue streaming retains exact indel keys, zero frequencies, samples and tallies", async () => {
  const header = "#chrom\tpos\tref\talt\tsig\tstars";
  const rows = ["1\t10\tT\tTC\tP\t2\té\t0", "1\t20\tTGGA\tT\tLP\t1\t.\t."];
  const index = await indexCatalogue(bgzfBytes([header, ...rows].join("\r\n"), 7));
  assert.equal(index.header, header);
  assert.deepEqual(
    [...index.map],
    [
      ["1:10:T:TC", rows[0]],
      ["1:20:TGGA:T", rows[1]],
    ],
  );
  assert.deepEqual(index.sample, rows);
  assert.deepEqual(index.byClass, { P: 1, LP: 1 });
  assert.equal(index.n, 2);
});

test("cancelled VCF and catalogue reads stop before touching the source", async () => {
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
  await assert.rejects(indexCatalogue(bgzfBytes("x"), controller.signal), { name: "AbortError" });
});
