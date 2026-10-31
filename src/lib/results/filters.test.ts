import test from "node:test";
import assert from "node:assert/strict";
import { classificationValues, classificationFilterOptions } from "./filters.ts";

test("classification filters preserve independent mixed labels and combined classifications", () => {
  const mixed = classificationValues({ sig: "O", stars: 1, rawSig: "Benign|drug_response" });
  assert.deepEqual(mixed, ["benign", "drug response"]);
  const pathogenic = classificationValues({ sig: "P", stars: 2, rawSig: "Pathogenic" });
  const likely = classificationValues({ sig: "LP", stars: 2, rawSig: "Likely_pathogenic" });
  const combined = classificationValues({
    sig: "PLP",
    stars: 2,
    rawSig: "Pathogenic/Likely_pathogenic",
  });
  assert.deepEqual(pathogenic, ["pathogenic"]);
  assert.deepEqual(likely, ["likely pathogenic"]);
  assert.deepEqual(combined, ["pathogenic / likely pathogenic"]);
  assert.equal(combined.includes("likely pathogenic"), false);
  const options = classificationFilterOptions([mixed, pathogenic, likely, combined]);
  assert.deepEqual(
    options.map(({ label }) => label),
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
  const conflict = classificationValues({
    sig: "C",
    stars: 1,
    rawSig: "Conflicting_classifications_of_pathogenicity|drug_response",
  });
  assert.deepEqual(conflict, ["conflicting classifications of pathogenicity", "drug response"]);
  assert.deepEqual(classificationValues({ sig: "LP", stars: 1 }), ["likely pathogenic"]);
  assert.deepEqual(classificationValues({ sig: "unknown", stars: 1, rawSig: "." }), []);
});

test("file-call verification items do not enter classification filters", () => {
  for (const problem of [{ partialCall: true }, { conflictingRecords: true }]) {
    const values = classificationValues({
      sig: "P",
      stars: 4,
      rawSig: "Pathogenic|drug_response",
      ...problem,
    });
    assert.deepEqual(values, []);
    assert.deepEqual(classificationFilterOptions([values]), []);
  }
});

test("filter counts deduplicate labels per record and contain no empty options", () => {
  const first = classificationValues({
    sig: "O",
    stars: 0,
    rawSig: "drug_response| Drug response |Benign",
  });
  const second = classificationValues({ sig: "O", stars: 1, rawSig: "drug_response" });
  const options = classificationFilterOptions([first, second]);
  assert.deepEqual(options, [
    { value: "benign", label: "Benign", count: 1 },
    { value: "drug response", label: "Drug response", count: 2 },
  ]);
  assert.deepEqual(classificationFilterOptions([]), []);
});
