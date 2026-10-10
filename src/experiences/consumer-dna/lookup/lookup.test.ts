import type { LookupIssue } from "../types.ts";
import { fixture as partialFixture } from "../../../../tests/helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { gzipSync } from "fflate";
import { openConsumerFile } from "../reader.ts";
import { findMatches, resultsWithoutConflicts } from "../engine/matching.ts";
import { findMarkers } from "../engine/markers.ts";
import { ctx, selectSource } from "../engine/context.ts";
import { loadLookup, sha256, validateLookup } from "./index.ts";

test("both shipped consumer indexes satisfy the browser schema and exact source hashes", async () => {
  for (const build of ["GRCh37", "GRCh38"]) {
    const index = JSON.parse(
      gunzipSync(fs.readFileSync(`public/ref/consumer-dna/${build}/rsids.json.gz`)).toString(
        "utf8",
      ),
    );
    await validateLookup(
      index,
      build,
      "catalog",
      fs.readFileSync(`public/ref/${build}/catalog.tsv.gz`),
    );
    await validateLookup(
      index,
      build,
      "markers",
      fs.readFileSync(`public/ref/${build}/markers.json`),
    );
  }
});

const source = (rows: string[], extra = "") =>
  openConsumerFile(
    new File(
      [
        `# 23andMe\n# build 37; plus strand\n${extra}# rsid\tchromosome\tposition\tgenotype\n${rows.join("\n")}`,
      ],
      "synthetic.txt",
    ),
  );
const entry = (pos: number, alt: string) =>
  `1\t${pos}\tC\t${alt}\tP\t2\tTEST\tTest\t0.01\tafr\t0.02\t100\t123\t456\tPathogenic`;
const map = new Map([
  ["1:100:C:T", entry(100, "T")],
  ["1:100:C:G", entry(100, "G")],
  ["1:200:C:T", entry(200, "T")],
]);
const lookup = {
  sources: {},
  schema: 1,
  build: "GRCh37",
  aliases: { rs9: "rs1" },
  catalog: { rs1: ["1:100:C:T", "1:100:C:G"], rs2: ["1:200:C:T"] },
  markers: { rs1: ["1:100:C:T"], rs2: ["1:200:C:T"] },
};

test("coordinates select carried alleles and verified aliases confirm the location", async () => {
  const input = await source(["rs9\t1\t100\tTG"]);
  const hits = await findMatches(input, map, undefined, partialFixture(null), lookup);
  assert.deepEqual(hits.map((hit) => hit.alt).sort(), ["G", "T"]);
  assert.ok(hits.every((hit) => hit.pos === 100 && hit.copies === 1 && hit.af === 0.01));
});

test("known rsID coordinate conflicts never fall back to another record", async () => {
  const input = await source(["rs2\t1\t100\tCT"]);
  const issues: LookupIssue[] = [];
  assert.deepEqual(
    await findMatches(input, map, undefined, partialFixture(null), lookup, (i) => issues.push(i)),
    [],
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.type, "rsid-position-conflict");
  assert.equal(issues[0]!.build, "GRCh37");
  assert.equal(issues[0]!.call.pos, 100);
  assert.deepEqual(issues[0]!.referencePositions, ["1:200"]);
});

test("coordinate matching keeps alleles missing from a same-position rsID mapping", async () => {
  const partialLookup = { ...lookup, catalog: { rs1: ["1:100:C:T"] } };
  const input = await source(["rs1\t1\t100\tTG"]);
  const issues: LookupIssue[] = [];
  const hits = await findMatches(input, map, undefined, partialFixture(null), partialLookup, (i) =>
    issues.push(i),
  );
  assert.deepEqual(hits.map((hit) => hit.alt).sort(), ["G", "T"]);
  assert.deepEqual(issues, []);
});

test("the same coordinate-first rules apply to AncestryDNA split-allele columns", async () => {
  const input = await openConsumerFile(
    new File(
      [
        "# AncestryDNA\n# human reference build 37.1; forward strand\n" +
          "rsid\tchromosome\tposition\tallele1\tallele2\n" +
          "rs1\t1\t100\tT\tG\nrs2\t1\t300\tC\tT\n",
      ],
      "synthetic-ancestry.txt",
    ),
  );
  const issues: LookupIssue[] = [];
  const hits = await findMatches(
    input,
    map,
    undefined,
    partialFixture(null),
    { ...lookup, catalog: { ...lookup.catalog, rs1: ["1:100:C:T"] } },
    (i) => issues.push(i),
  );
  assert.deepEqual(hits.map((hit) => hit.alt).sort(), ["G", "T"]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.call.pos, 300); // Flag even when the file position has no candidate.
  assert.deepEqual(issues[0]!.call.fields, ["rs2", "1", "300", "C", "T"]);
});

test("coordinates disambiguate an rsID indexed at multiple locations", async () => {
  const input = await source(["rs1\t1\t200\tCT"]);
  const issues: LookupIssue[] = [];
  const hits = await findMatches(
    input,
    map,
    undefined,
    partialFixture(null),
    { ...lookup, catalog: { rs1: ["1:100:C:T", "1:200:C:T"] } },
    (i) => issues.push(i),
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.pos, 200);
  assert.deepEqual(issues, []);
});

test("switching files clears unresolved records along with interpreted results", () => {
  ctx.matchIssues = partialFixture([{}]);
  ctx.markerIssues = partialFixture([{}]);
  ctx.matches = partialFixture([{}]);
  ctx.markerHits = partialFixture({ rs1: {} });
  selectSource(null);
  assert.deepEqual(ctx.matchIssues, []);
  assert.deepEqual(ctx.markerIssues, []);
  assert.equal(ctx.matches, null);
  assert.equal(ctx.markerHits, null);
});

test("internal/unindexed IDs preserve exact-coordinate lookup; incompatible alleles stay unresolved", async () => {
  const input = await source(["i123\t1\t100\tCT"]);
  assert.equal((await findMatches(input, map, undefined, partialFixture(null), lookup)).length, 1);
  for (const genotype of ["AT", "--", "ID", "CC"]) {
    const invalid = await source([`rs1\t1\t100\t${genotype}`]);
    assert.deepEqual(await findMatches(invalid, map, undefined, partialFixture(null), lookup), []);
  }
});

test("build, strand and incomplete calls retain their matching guards", async () => {
  const input = await source(["rs1\t1\t100\tCT"]);
  await assert.rejects(
    findMatches(input, map, undefined, partialFixture(null), { ...lookup, build: "GRCh38" }),
    /build mismatch/,
  );
  const reverse = await source(["rs1\t1\t100\tCT"], "# reverse strand\n");
  assert.deepEqual(await findMatches(reverse, map, undefined, partialFixture(null), lookup), []);
});

test("alias/direct duplicates still expose conflicting calls", async () => {
  const input = await source(["rs9\t1\t100\tCT", "rs1\t1\t100\tCC"]);
  const [hit] = await findMatches(input, map, undefined, partialFixture(null), lookup);
  assert.equal(hit!.conflictingRecords, true);
  assert.equal(hit!.recordCount, 2);
});

test("an rsID-rejected duplicate cannot hide disagreement at a matched position", async () => {
  const markers = [{ rs: "rs1", chrom: "1", pos: 100, ref: "C", alt: "T" }];
  for (const rows of [
    ["rs1\t1\t100\tCT", "rs2\t1\t100\tCC"],
    ["rs2\t1\t100\tCC", "rs1\t1\t100\tCT"],
  ]) {
    const input = await source(rows);
    const matches = await findMatches(input, map, undefined, partialFixture(null), lookup);
    assert.deepEqual(resultsWithoutConflicts(matches), { hits: [], skippedSites: 1 });
    const hits = await findMarkers(input, partialFixture(markers), undefined, undefined, lookup);
    assert.equal(hits["rs1"]!.conflicting, true);
    assert.equal(hits["rs1"]!.usable, false);
  }
});

test("gnomAD examples use coordinate lookup, flag rsID disagreements and keep no-calls distinct", async () => {
  const markers = [{ rs: "rs1", chrom: "1", pos: 100, ref: "C", alt: "T" }];
  const input = await source(["rs9\t1\t100\tCT"]);
  const hits = await findMarkers(input, partialFixture(markers), null!, undefined, lookup);
  assert.equal(hits["rs1"]!.usable, true);
  const conflict = await source(["rs2\t1\t100\tCT"]);
  const issues: LookupIssue[] = [];
  assert.deepEqual(
    await findMarkers(conflict, partialFixture(markers), null!, undefined, lookup, (i) =>
      issues.push(i),
    ),
    {},
  );
  assert.equal(issues.length, 1);
  const unindexed = await source(["i123\t1\t100\tCT"]);
  assert.equal(
    (await findMarkers(unindexed, partialFixture(markers), null!, undefined, lookup))["rs1"]!
      .usable,
    true,
  );
  const missing = await source(["rs9\t1\t100\t--"]);
  assert.equal(
    (await findMarkers(missing, partialFixture(markers), null!, undefined, lookup))["rs1"]!.usable,
    false,
  );
});

test("lookup downloads contain no personal identifiers and reject mismatched source bytes", async (t) => {
  const sourceBytes = new TextEncoder().encode("public catalogue fixture");
  const index = {
    ...lookup,
    sources: { catalog: { sha256: await sha256(sourceBytes) } },
  };
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let requests = 0;
  globalThis.fetch = async (url) => {
    assert.equal(url, "/ref/consumer-dna/GRCh37/rsids.json.gz");
    requests++;
    return new Response(gzipSync(new TextEncoder().encode(JSON.stringify(index))));
  };
  assert.equal((await loadLookup("GRCh37", "catalog", sourceBytes)).build, "GRCh37");
  assert.equal(requests, 1);
  await assert.rejects(
    validateLookup(index, "GRCh37", "catalog", new Uint8Array([1])),
    /reference release/,
  );
  await assert.rejects(
    validateLookup(index, "GRCh38", "catalog", sourceBytes),
    /reference release/,
  );
  await assert.rejects(
    validateLookup({ ...index, schema: 2 }, "GRCh37", "catalog", sourceBytes),
    /reference release/,
  );
  globalThis.fetch = async () => new Response("missing", { status: 404 });
  await assert.rejects(loadLookup("GRCh37", "catalog", sourceBytes), /unavailable/);
});
