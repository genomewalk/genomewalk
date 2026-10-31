import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bgzfWrite } from "../lib/io/bgzf.ts";
import { catalogueMetadata } from "../lib/catalog-metadata.ts";
import { CATALOG_HEADER } from "../lib/clinvar.ts";
import { checkResults, fileSha256, verifyMatching } from "./verify.ts";
import { expectedMatches } from "./reference.ts";
import { vcfSource } from "../../tests/helpers/vcf.ts";

const variant = (pos: number, filter = "PASS") => [
  "1",
  String(pos),
  ".",
  "A",
  "G",
  ".",
  filter,
  ".",
  "GT",
  "0/1",
];

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "genomewalk-correctness-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "ref/GRCh38");
  await fs.mkdir(directory, { recursive: true });
  const catalogueFile = path.join(directory, "catalog.tsv.gz");
  const rows = [1, 2, 3].map((pos) =>
    [
      "1",
      String(pos),
      "A",
      "G",
      "P",
      "2",
      `GENE${pos}`,
      "condition",
      ".",
      "",
      ".",
      ".",
      "",
      "",
      "Pathogenic",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ".",
      ".",
      ".",
    ].join("\t"),
  );
  bgzfWrite(CATALOG_HEADER + "\n" + rows.join("\n") + "\n", catalogueFile);
  const metadataFile = path.join(directory, "catalog.meta.json");
  await fs.writeFile(
    metadataFile,
    JSON.stringify(await catalogueMetadata(catalogueFile, "GRCh38")),
  );
  const sampleFile = path.join(root, "sample.vcf.gz");
  const sample = (records: string[][]) =>
    bgzfWrite(
      "##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n" +
        records.map((row) => row.join("\t")).join("\n") +
        "\n",
      sampleFile,
    );
  return { root, catalogueFile, metadataFile, sampleFile, sample };
}

test("correctness check verifies sorted and unordered inputs without generating retrieval artifacts", async (t) => {
  const f = await fixture(t);
  for (const records of [
    [variant(1), variant(2, "LowQual"), variant(3)],
    [variant(3), variant(2, "LowQual"), variant(1)],
  ]) {
    f.sample(records);
    const verification = await verifyMatching({
      publicDirectory: f.root,
      sampleFile: f.sampleFile,
      build: "GRCh38",
      expectedSampleSha256: await fileSha256(f.sampleFile),
    });
    assert.equal(verification.results.identical, true);
    assert.equal(verification.results.expectedCount, 2);
    assert.equal(verification.results.actualCount, 2);
    assert.equal(verification.results.expectedSha256, verification.results.actualSha256);
  }
  assert.deepEqual(await fs.readdir(path.dirname(f.catalogueFile)), [
    "catalog.meta.json",
    "catalog.tsv.gz",
  ]);
});

test("correctness check rejects invalid public sample and mismatched catalogue metadata", async (t) => {
  const f = await fixture(t);
  f.sample([variant(1)]);
  const options = { publicDirectory: f.root, sampleFile: f.sampleFile, build: "GRCh38" };
  await assert.rejects(
    verifyMatching({ ...options, expectedSampleSha256: "invalid" }),
    /sample checksum mismatch/,
  );
  const metadata = JSON.parse(await fs.readFile(f.metadataFile, "utf8"));
  metadata.source.sha256 = "0".repeat(64);
  await fs.writeFile(f.metadataFile, JSON.stringify(metadata));
  await assert.rejects(verifyMatching(options), /Catalogue and metadata identify different files/);
});

test("equal counts cannot hide altered annotations, dropped results or changed ordering", async (t) => {
  const f = await fixture(t);
  const expected = await expectedMatches(f.catalogueFile, vcfSource([variant(1), variant(3)]));
  const altered = structuredClone(expected);
  altered[0]!.gene = "different annotation";
  const mismatch = checkResults(expected, altered);
  assert.equal(mismatch.expectedCount, mismatch.actualCount);
  assert.equal(mismatch.identical, false);
  assert.notEqual(mismatch.expectedSha256, mismatch.actualSha256);
  assert.equal(checkResults(expected, expected.toReversed()).identical, false);
  assert.equal(checkResults(expected, expected.slice(1)).identical, false);
  const reordered = expected.map((record) =>
    Object.fromEntries(Object.entries(record).reverse()),
  ) as typeof expected;
  const same = checkResults(expected, reordered);
  assert.equal(same.identical, true);
  assert.equal(same.expectedSha256, same.actualSha256);
});
