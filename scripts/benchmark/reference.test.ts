import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bgzfBytes, vcfSource } from "../../tests/helpers/vcf.ts";
import { expectedMatches } from "./reference.ts";

const catalogueRow = (chrom: string, pos: number, ref: string, alt: string) =>
  [chrom, pos, ref, alt, "P", 1, "Gène", "Example", 0, "", 0, 100].join("\t");
const variant = (pos: number, ref: string, alt: string, gt: string, filter = "PASS") => [
  "chr1",
  String(pos),
  ".",
  ref,
  alt,
  ".",
  filter,
  ".",
  "GT",
  gt,
];

async function fixture(t: test.TestContext, rows: string[]) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "genomewalk-reference-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "catalog.tsv.gz");
  // Tiny blocks split UTF-8 and records; no final newline.
  await fs.writeFile(file, bgzfBytes(["#chrom\tpos\tref\talt", ...rows].join("\r\n"), 7));
  return file;
}

test("reference answers preserve exact alleles, calls, duplicates and result order", async (t) => {
  const file = await fixture(t, [
    catalogueRow("1", 10, "T", "TC"),
    catalogueRow("1", 20, "A", "T"),
    catalogueRow("1", 20, "A", "G"),
    ...[30, 40, 50, 60, 70].map((pos) => catalogueRow("1", pos, "C", "T")),
    catalogueRow("MT", 1, "A", "G"),
  ]);
  const source = vcfSource([
    ["chrM", "1", ".", "A", "G", ".", "PASS", ".", "GT", "1"],
    variant(10, "T", "TC", "0/1"),
    variant(20, "A", "T,G", "0/2"),
    variant(30, "C", "T", "1/1", "q10"),
    variant(40, "C", "T", "0/0"),
    variant(50, "C", "T", "./1", "."),
    variant(60, "A", "T", "1/1"), // Same position/ALT, different REF.
    [...variant(70, "C", "T", "0/0"), "1/1"], // Only the first sample contributes.
    variant(10, "T", "TC", "1/1"), // Unsorted, conflicting duplicate.
  ]);
  const hits = await expectedMatches(file, source);
  assert.deepEqual(
    hits.map((hit) => [hit.chrom, hit.pos, hit.alt]),
    [
      ["1", 10, "TC"],
      ["1", 50, "T"],
      ["MT", 1, "G"],
      ["1", 20, "G"],
    ],
  );
  assert.equal(hits[0]!.recordCount, 2);
  assert.equal(hits[0]!.conflictingRecords, true);
  assert.equal(hits[0]!.sourceCalls.length, 2);
  assert.equal(hits[0]!.gene, "Gène");
  assert.equal(hits[0]!.af, 0);
  assert.equal(hits[0]!.afmax, 0);
  assert.equal(hits[1]!.partialCall, true);
  assert.equal(hits[1]!.copies, 1);
  assert.equal(hits[2]!.ploidy, 1);
  assert.equal(hits[3]!.gt, "0/2");
});

test("reference refuses ambiguous catalogues and incomplete compressed input", async (t) => {
  const row = catalogueRow("1", 10, "C", "T");
  const duplicate = await fixture(t, [row, row]);
  await assert.rejects(expectedMatches(duplicate, vcfSource()), /duplicate allele key/);
  const corrupt = await fixture(t, [row]);
  const bytes = await fs.readFile(corrupt);
  await fs.writeFile(corrupt, bytes.subarray(0, -1));
  await assert.rejects(expectedMatches(corrupt, vcfSource()), /unexpected end/);
  await assert.rejects(expectedMatches(`${corrupt}.missing`, vcfSource()), { code: "ENOENT" });
});
