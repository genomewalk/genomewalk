import { fixture as partialFixture } from "../helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { findMatches } from "../../src/experiences/vcf/engine/matching.ts";
import { resultSummary as verdictOf } from "../../src/lib/results/evidence.ts";
import { condList } from "../../src/experiences/vcf/engine/view/conditions.ts";
import { matchKey, variantLocation } from "../../src/experiences/vcf/engine/match-identity.ts";
import { vcfSource } from "../helpers/vcf.ts";

const row = (pos: number, ref: string, alt: string, gt = "0/1", chrom = "12", filter = "PASS") => [
  chrom,
  String(pos),
  `rs${pos}`,
  ref,
  alt,
  "100",
  filter,
  ".",
  "GT",
  gt,
];
const entry = (pos: number, ref: string, alt: string, chrom = "12") =>
  `${chrom}\t${pos}\t${ref}\t${alt}\tC\t1\tHNF1A\tSame condition\t0.02\tTest group\t0.03\t1000`;
async function scan(records: string[][], entries: string[]) {
  const catalog = new Map(
    entries.map((line: string) => [line.split("\t").slice(0, 4).join(":"), line]),
  );
  const matches = await findMatches(vcfSource(records), catalog);
  return { matches, verdictOf };
}

test("repeated VCF records produce one result even with chromosome aliases and reversed GT order", async () => {
  const a = row(120978819, "C", "G");
  const { matches } = await scan(
    [a, [...a], row(120978819, "C", "G", "1/0", "chr12")],
    [entry(120978819, "C", "G")],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0]!.recordCount, 3);
  assert.equal(matches[0]!.sourceCalls.length, 1);
  assert.ok(!matches[0]!.conflictingRecords);
});

test("different HNF1A positions and different ALT alleles remain separate results", async () => {
  const { matches } = await scan(
    [row(120978819, "C", "G"), row(120997672, "G", "A"), row(120978819, "C", "T")],
    [entry(120978819, "C", "G"), entry(120997672, "G", "A"), entry(120978819, "C", "T")],
  );
  assert.equal(matches.length, 3);
  assert.equal(new Set(matches.map(matchKey)).size, 3);
  assert.equal(new Set(matches.map(partialFixture(variantLocation))).size, 3);
});

test("multiallelic records match only called alleles and deduplicate equivalent ALT orderings", async () => {
  const { matches } = await scan(
    [row(100, "A", "C,G", "1/2"), row(100, "A", "G,C", "2/1")],
    [entry(100, "A", "C"), entry(100, "A", "G"), entry(100, "A", "T")],
  );
  assert.equal(matches.length, 2);
  assert.ok(matches.every((h) => h.recordCount === 2 && !h.conflictingRecords));
});

test("sparse catalogue candidates retain their original genotype indices and partial-call flags", async () => {
  const { matches } = await scan(
    [
      row(100, "A", "C,G", "0/2"),
      row(200, "A", "C,G", "1/1"),
      row(300, "A", "C,G", "./2"),
      row(400, "A", "C,G", "2/3"),
    ],
    [100, 200, 300, 400].map((pos) => entry(pos, "A", "G")),
  );
  assert.deepEqual(
    matches.map((hit) => Number(hit.pos)).sort((a, b) => a - b),
    [100, 300, 400],
  );
  for (const hit of matches) {
    assert.equal(hit.alt, "G");
    assert.equal(hit.copies, 1);
    assert.equal(hit.ploidy, 2);
    assert.equal(hit.partialCall, Number(hit.pos) !== 100);
  }
});

test("different genotypes at the same variant remain visible as a conflict, not duplicate rows", async () => {
  const { matches, verdictOf } = await scan(
    [row(100, "A", "G", "0/1"), row(100, "A", "G", "1/1")],
    [entry(100, "A", "G")],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0]!.sourceCalls.length, 2);
  assert.equal(matches[0]!.conflictingRecords, true);
  assert.equal(verdictOf(partialFixture(matches[0])).label, "conflicting file calls");
});

test("failed filters and reference-only calls do not add matches or inflate duplicate counts", async () => {
  const { matches } = await scan(
    [row(100, "A", "G"), row(100, "A", "G", "1/1", "12", "FAIL"), row(200, "C", "T", "0/0")],
    [entry(100, "A", "G"), entry(200, "C", "T")],
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0]!.recordCount, 1);
});

test("mitochondrial aliases share identity and locations distinguish alleles without rsIDs", () => {
  const h = { chrom: "chrM", pos: 100, ref: "A", alt: "G" };
  assert.equal(matchKey(h), matchKey({ ...h, chrom: "MT" }));
  assert.equal(variantLocation(h), "chrMT:100 · A → G");
});

test("repeated condition labels are listed once without merging different conditions", () => {
  assert.deepEqual(
    Array.from(condList("Same condition| Same condition |Different condition|not provided")),
    ["Same condition", "Different condition"],
  );
});
