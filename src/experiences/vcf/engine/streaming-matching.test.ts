import test from "node:test";
import assert from "node:assert/strict";
import { findMatches } from "./matching.ts";
import { vcfSource } from "../../../../tests/helpers/vcf.ts";
import { AppError } from "../../../lib/app-error.ts";

const variant = (pos: number, alt = "G", gt = "0/1", chrom = "1", filter = "PASS") => [
  chrom,
  String(pos),
  ".",
  "A",
  alt,
  ".",
  filter,
  ".",
  "GT",
  gt,
];
const entry = (pos: number, alt = "G", chrom = "1") =>
  `${chrom}\t${pos}\tA\t${alt}\tP\t2\tGENE\tcondition\t0.01\tgroup\t0.02\t1000`;
function catalogue(lines: string[], options: { end?: () => void; chromosomes?: string[] } = {}) {
  let passes = 0,
    closed = 0;
  return {
    chromosomes: options.chromosomes ?? ["1", "2", "X", "Y", "MT"],
    get passes() {
      return passes;
    },
    get closed() {
      return closed;
    },
    async *rows(signal?: AbortSignal) {
      passes++;
      try {
        for (const line of lines) {
          signal?.throwIfAborted();
          yield line;
        }
        options.end?.();
      } finally {
        closed++;
      }
    },
  };
}
const asMap = (lines: string[]) =>
  new Map(lines.map((line) => [line.split("\t", 4).join(":"), line]));

test("sorted merge preserves multiallelic, partial, filtered, duplicate and conflicting call semantics", async () => {
  const lines = [
    entry(10, "G"),
    entry(10, "C"),
    entry(20),
    entry(30),
    entry(40),
    entry(50),
    entry(2, "G", "MT"),
  ];
  const records = [
    variant(1),
    variant(10, "C,G", "1/2"),
    variant(10, "G,C", "2/1", "chr1"),
    variant(20, "G", "./1"),
    variant(20, "G", "1/1"),
    variant(30, "G", "0/0"),
    variant(40, "G", "0/1", "1", "LowQual"),
    variant(50, "G", "0/1", "1", "."),
    variant(2, "G", "0/1", "chrM"),
  ];
  const cat = catalogue(lines);
  const actual = await findMatches(vcfSource(records), cat);
  const expected = await findMatches(vcfSource(records), asMap(lines));
  assert.deepEqual(actual, expected);
  assert.equal(cat.passes, 1);
  assert.equal(cat.closed, 1);
  assert.equal(actual.length, 5);
  assert.equal(actual.find((hit) => hit.pos === 20)?.conflictingRecords, true);
});

test("an ordering violation after catalogue exhaustion restarts without losing early-locus matches", async () => {
  const lines = [entry(10), entry(20)];
  const records = [variant(10), variant(999), variant(20), variant(10, "G", "1/1")];
  const cat = catalogue(lines);
  const actual = await findMatches(vcfSource(records), cat);
  assert.deepEqual(actual, await findMatches(vcfSource(records), asMap(lines)));
  assert.equal(cat.passes, 3);
  assert.equal(cat.closed, 3);
  assert.equal(actual.find((hit) => hit.pos === 10)?.recordCount, 2);
});

test("a different chromosome ordering uses compatibility matching, including noncanonical contigs", async () => {
  const lines = [entry(1), entry(1, "G", "2"), entry(1, "G", "NW_1")];
  const records = [variant(1, "G", "0/1", "2"), variant(1), variant(1, "G", "0/1", "NW_1")];
  const cat = catalogue(lines, { chromosomes: ["1", "2", "NW_1"] });
  assert.deepEqual(
    await findMatches(vcfSource(records), cat),
    await findMatches(vcfSource(records), asMap(lines)),
  );
  assert.equal(cat.passes, 3);
});

test("merge consumes and verifies the catalogue tail even when the personal input ends early", async () => {
  const failure = new AppError("REFERENCE_INTEGRITY_FAILED");
  const cat = catalogue([entry(10), entry(20), entry(30)], {
    end: () => {
      throw failure;
    },
  });
  await assert.rejects(findMatches(vcfSource([variant(10)]), cat), (error) => error === failure);
  assert.equal(cat.passes, 1, "integrity failures must never trigger a compatibility retry");
  assert.equal(cat.closed, 1);
});

test("cancelled matching closes the public stream and returns no partial results", async () => {
  const controller = new AbortController();
  const cat = catalogue([entry(10), entry(20)]);
  const source = vcfSource([variant(10)], { beforeRead: () => controller.abort() });
  await assert.rejects(findMatches(source, cat, undefined, controller.signal), {
    name: "AbortError",
  });
  assert.equal(cat.closed, 1);
});

test("a zero-match sorted input still validates both streams in one pass", async () => {
  let completed = false;
  const cat = catalogue([entry(10), entry(20)], {
    end: () => {
      completed = true;
    },
  });
  assert.deepEqual(await findMatches(vcfSource([variant(100)]), cat), []);
  assert.equal(completed, true);
  assert.equal(cat.passes, 1);
});
