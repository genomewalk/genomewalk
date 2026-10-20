import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { bgzfWrite } from "../lib/io/bgzf.ts";
import { catalogueRangeIndex } from "../lib/catalog-ranges.ts";
import { CATALOG_HEADER } from "../lib/clinvar.ts";
import { compareCatalogues, fileSha256 } from "./compare.ts";

test("benchmark measures real HTTP bodies and compares full result annotations", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "genomewalk-benchmark-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "ref/GRCh38");
  await fs.mkdir(directory, { recursive: true });
  const catalogue = path.join(directory, "catalog.tsv.gz");
  bgzfWrite(
    CATALOG_HEADER +
      "\n" +
      Array.from(
        { length: 3000 },
        (_, i) => `1\t${i + 1}\tA\tG\tP\t2\tGENE${i}\t${"condition ".repeat(20)}`,
      ).join("\n") +
      "\n",
    catalogue,
  );
  const bytes = await fs.readFile(catalogue);
  const index = await catalogueRangeIndex(bytes, "GRCh38");
  const compressedIndex = gzipSync(JSON.stringify(index));
  await fs.writeFile(path.join(directory, "catalog.index.json.gz"), compressedIndex);
  const sampleFile = path.join(root, "sample.vcf.gz");
  bgzfWrite(
    "##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n" +
      "1\t1\t.\tA\tG\t.\tPASS\t.\tGT\t0/1\n" +
      "1\t2\t.\tA\tG\t.\tLowQual\t.\tGT\t0/1\n",
    sampleFile,
  );
  const options = {
    publicDirectory: root,
    sampleFile,
    expectedSampleSha256: await fileSha256(sampleFile),
    build: "GRCh38",
  };
  const report = await compareCatalogues(options);
  assert.equal(report.results.identical, true);
  assert.equal(report.results.fullCount, 1);
  assert.equal(report.downloads.fullBytes, bytes.length);
  assert.equal(report.downloads.indexBytes, compressedIndex.length);
  assert.equal(report.downloads.blockBytes, index.blocks[0]![1]);
  assert.equal(report.downloads.rangeRequests, 1);
  assert.equal(report.requests.selective[1]!.status, 206);
  assert.equal(report.results.fullSha256, report.results.selectiveSha256);
  await assert.rejects(
    compareCatalogues({ ...options, expectedSampleSha256: "invalid" }),
    /sample checksum mismatch/,
  );
  // A structurally valid index missing the observed allele must fail equivalence.
  index.records = index.records.filter(([key]) => key !== "1:1:A:G");
  index.n--;
  await fs.writeFile(
    path.join(directory, "catalog.index.json.gz"),
    gzipSync(JSON.stringify(index)),
  );
  const mismatch = await compareCatalogues(options);
  assert.equal(mismatch.results.identical, false);
  assert.equal(mismatch.results.selectiveCount, 0);
});
