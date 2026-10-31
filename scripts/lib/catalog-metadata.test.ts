import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { bgzfWrite } from "./io/bgzf.ts";
import { paths } from "./config.ts";
import { CATALOG_HEADER, catalogFields, parseClinvar } from "./clinvar.ts";
import {
  buildCatalogMetadata,
  catalogueMetadata,
  checkCatalogMetadata,
} from "./catalog-metadata.ts";

const row = (chrom: string, pos: number, id = "1", ref = "C", alt = "T") =>
  catalogFields(
    parseClinvar(
      `${chrom}\t${pos}\t${id}\t${ref}\t${alt}\t.\t.\tCLNSIG=Pathogenic;GENEINFO=Example:1`,
    )!,
  ).join("\t");

function fixture(t: test.TestContext, rows: string[]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "genomewalk-catalogue-meta-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = paths({ "out-dir": directory });
  bgzfWrite([CATALOG_HEADER, ...rows, ""].join("\n"), files.catalog("GRCh38"));
  return { paths: files, build: "GRCh38" };
}

test("compact metadata describes a sorted catalogue and retains only chosen public examples", async (t) => {
  const rows = [
    row("1", 100, "1131472"),
    row("1", 100, "2", "C", "G"),
    ...Array.from({ length: 8 }, (_, i) => row("1", 200 + i, `${i + 10}`)),
    row("2", 1, "132807"),
    row("X", 1, "39357"),
  ];
  const options = fixture(t, rows);
  const metadata = await buildCatalogMetadata(options);
  assert.equal(metadata.n, rows.length);
  assert.deepEqual(metadata.chromosomes, ["1", "2", "X"]);
  assert.deepEqual(metadata.sample, rows.slice(0, 6));
  assert.deepEqual(metadata.examples, [rows[10], rows[0], rows[11]]);
  assert.equal(metadata.byClass["P"], rows.length);
  assert.equal(metadata.byStars["0"], rows.length);
  const bytes = fs.readFileSync(options.paths.catalog(options.build));
  assert.deepEqual(metadata.source, {
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  assert.ok(!("records" in metadata) && !("blocks" in metadata));
  await checkCatalogMetadata(options);
  const altered = { ...metadata, n: metadata.n + 1 };
  fs.writeFileSync(options.paths.catalogMetadata(options.build), JSON.stringify(altered));
  await assert.rejects(checkCatalogMetadata(options), /stale or invalid/);
});

test("metadata rejects decreasing positions, repeated chromosome sections and duplicate variants", async (t) => {
  for (const [rows, message] of [
    [[row("1", 20), row("1", 10)], /positions must be sorted/],
    [[row("1", 10), row("2", 10), row("1", 20)], /sections must be contiguous/],
    [[row("1", 10), row("1", 10)], /duplicate catalogue variant/],
  ] as const) {
    const options = fixture(t, [...rows]);
    await assert.rejects(
      catalogueMetadata(options.paths.catalog(options.build), options.build),
      message,
    );
  }
});

test("an invalid catalogue does not replace a previously generated metadata file", async (t) => {
  const options = fixture(t, [row("1", 10)]);
  await buildCatalogMetadata(options);
  const file = options.paths.catalogMetadata(options.build);
  const previous = fs.readFileSync(file);
  const bytes = fs.readFileSync(options.paths.catalog(options.build));
  bytes[bytes.readUInt16LE(16) + 1 - 8]! ^= 1;
  fs.writeFileSync(options.paths.catalog(options.build), bytes);
  await assert.rejects(buildCatalogMetadata(options), /integrity check/);
  assert.deepEqual(fs.readFileSync(file), previous);
});
