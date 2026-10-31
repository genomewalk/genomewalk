import test from "node:test";
import assert from "node:assert/strict";
import { evidenceFilterValues, resultFilterOptions } from "./filters.ts";

test("classification filters preserve independent mixed labels and combined classifications", () => {
  const mixed = evidenceFilterValues({ sig: "O", stars: 1, rawSig: "Benign|drug_response" });
  assert.deepEqual(mixed.classifications, ["benign", "drug response"]);
  const pathogenic = evidenceFilterValues({ sig: "P", stars: 2, rawSig: "Pathogenic" });
  const likely = evidenceFilterValues({ sig: "LP", stars: 2, rawSig: "Likely_pathogenic" });
  const combined = evidenceFilterValues({
    sig: "PLP",
    stars: 2,
    rawSig: "Pathogenic/Likely_pathogenic",
  });
  assert.deepEqual(pathogenic.classifications, ["pathogenic"]);
  assert.deepEqual(likely.classifications, ["likely pathogenic"]);
  assert.deepEqual(combined.classifications, ["pathogenic / likely pathogenic"]);
  assert.equal(combined.classifications.includes("likely pathogenic"), false);
  const options = resultFilterOptions([mixed, pathogenic, likely, combined]);
  assert.deepEqual(
    options.classifications.map(({ label }) => label),
    [
      "Benign",
      "Drug response",
      "Likely pathogenic",
      "Pathogenic",
      "Pathogenic / likely pathogenic",
    ],
  );
});

test("classification filters use original labels before the catalogue shorthand", () => {
  const conflict = evidenceFilterValues({
    sig: "C",
    stars: 1,
    rawSig: "Conflicting_classifications_of_pathogenicity|drug_response",
  });
  assert.deepEqual(conflict.classifications, [
    "conflicting classifications of pathogenicity",
    "drug response",
  ]);
  assert.deepEqual(evidenceFilterValues({ sig: "LP", stars: 1 }).classifications, [
    "likely pathogenic",
  ]);
  assert.deepEqual(
    evidenceFilterValues({ sig: "unknown", stars: 1, rawSig: "." }).classifications,
    [],
  );
});

test("review-star filters retain exact zero through four and exclude unknown values", () => {
  const valid = [0, 1, 2, 3, 4].map((stars) => evidenceFilterValues({ sig: "P", stars }));
  assert.deepEqual(
    valid.map(({ stars }) => stars),
    ["0", "1", "2", "3", "4"],
  );
  for (const stars of [NaN, -1, 1.5, 5, Infinity])
    assert.equal(evidenceFilterValues({ sig: "P", stars }).stars, null);
  assert.deepEqual(
    resultFilterOptions(valid).stars.map(({ value, label }) => [value, label]),
    [
      ["4", "4 stars"],
      ["3", "3 stars"],
      ["2", "2 stars"],
      ["1", "1 star"],
      ["0", "0 stars"],
    ],
  );
});

test("file-call verification items do not enter classification or star filters", () => {
  for (const problem of [{ partialCall: true }, { conflictingRecords: true }]) {
    const values = evidenceFilterValues({
      sig: "P",
      stars: 4,
      rawSig: "Pathogenic|drug_response",
      ...problem,
    });
    assert.deepEqual(values, { classifications: [], stars: null });
    assert.deepEqual(resultFilterOptions([values]), { classifications: [], stars: [] });
  }
});

test("filter counts deduplicate labels per record and contain no empty options", () => {
  const first = evidenceFilterValues({
    sig: "O",
    stars: 0,
    rawSig: "drug_response| Drug response |Benign",
  });
  const second = evidenceFilterValues({ sig: "O", stars: 1, rawSig: "drug_response" });
  const options = resultFilterOptions([first, second]);
  assert.deepEqual(options.classifications, [
    { value: "benign", label: "Benign", count: 1 },
    { value: "drug response", label: "Drug response", count: 2 },
  ]);
  assert.deepEqual(options.stars, [
    { value: "1", label: "1 star", count: 1 },
    { value: "0", label: "0 stars", count: 1 },
  ]);
  assert.deepEqual(resultFilterOptions([]), { classifications: [], stars: [] });
});
