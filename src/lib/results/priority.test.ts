import test from "node:test";
import assert from "node:assert/strict";
import type { Evidence } from "../catalogues/types.ts";
import { compareReviewPriority, reviewPriority, reviewPriorityReason } from "./priority.ts";

test("review priority groups disease claims by review evidence, then classification", () => {
  const records = [
    { id: "partial", sig: "P", stars: 4, partialCall: true },
    { id: "conflict", sig: "C", stars: 1 },
    { id: "p0", sig: "P", stars: 0 },
    { id: "lp2", sig: "LP", stars: 2 },
    { id: "plp2", sig: "PLP", stars: 2 },
    { id: "p1", sig: "P", stars: 1 },
    { id: "p2", sig: "P", stars: 2 },
    { id: "lp4", sig: "LP", stars: 4 },
    { id: "lp1", sig: "LP", stars: 1 },
    { id: "p3", sig: "P", stars: 3 },
    { id: "drug", sig: "O", stars: 4, rawSig: "drug_response" },
  ];
  assert.deepEqual(
    records.sort(compareReviewPriority).map((record) => record.id),
    ["lp4", "p3", "p2", "plp2", "lp2", "p1", "lp1", "p0", "drug", "conflict", "partial"],
  );
  assert.equal(reviewPriority({ sig: "PLP", stars: 2 }).id, "reviewed");
  assert.equal(reviewPriority({ sig: "LP", stars: 1 }).id, "limited");
});

test("rarity and missing frequencies do not change priority or ties", () => {
  const frequencies = [0.8, null, 0, 0.000001, undefined];
  const records = frequencies.map((afmax, id) => ({
    id,
    sig: "P",
    stars: 2,
    ...(afmax === undefined ? {} : { afmax }),
  }));
  assert.deepEqual(
    records.toSorted(compareReviewPriority).map((record) => record.id),
    [0, 1, 2, 3, 4],
  );
  for (const record of records) {
    assert.equal(reviewPriority(record).id, "reviewed");
    assert.equal(reviewPriorityReason(record), reviewPriorityReason(records[0]!));
  }
  assert.ok(
    compareReviewPriority({ sig: "P", stars: 3, afmax: 0.8 }, { sig: "P", stars: 2, afmax: 0 }) < 0,
  );
});

test("mixed labels retain their disease priority without promoting non-disease records", () => {
  assert.equal(
    reviewPriority({ sig: "P", stars: 3, rawSig: "Pathogenic|drug_response" }).id,
    "reviewed",
  );
  for (const rawSig of [
    "Benign|drug_response",
    "Uncertain_significance|association",
    "protective",
    "risk_factor",
    "Affects",
  ])
    assert.equal(reviewPriority({ sig: "O", stars: 4, rawSig }).id, "context", rawSig);
  assert.equal(
    reviewPriority({
      sig: "C",
      stars: 2,
      rawSig: "Conflicting_classifications_of_pathogenicity|drug_response",
    }).id,
    "context",
  );
});

test("incomplete and contradictory calls are verification items regardless of classification", () => {
  for (const evidence of [
    { sig: "P", stars: 4, partialCall: true },
    { sig: "LP", stars: 4, conflictingRecords: true },
    { sig: "O", stars: 4, rawSig: "drug_response", partialCall: true },
  ]) {
    assert.equal(reviewPriority(evidence).id, "verification");
    assert.match(reviewPriorityReason(evidence), /verify the original/);
    assert.doesNotMatch(reviewPriorityReason(evidence), /Listed first/);
  }
  assert.match(
    reviewPriorityReason({ sig: "P", stars: 3 }),
    /pathogenic classification; expert-panel review/,
  );
});

test("invalid review stars cannot promote a classification into the reviewed group", () => {
  for (const stars of [NaN, -1, 1.5, 5, Infinity]) {
    const evidence: Evidence = { sig: "P", stars };
    assert.equal(reviewPriority(evidence).id, "limited");
    assert.match(reviewPriorityReason(evidence), /review status unavailable/);
    assert.ok(Number.isFinite(compareReviewPriority(evidence, { sig: "P", stars: 1 })));
  }
});
