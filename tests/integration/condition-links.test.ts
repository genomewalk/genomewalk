import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogConditionReferences,
  conditionUrl,
} from "../../src/experiences/vcf/engine/condition-links.ts";
import { parseCatalogEntry } from "../../src/lib/results/evidence.ts";

const hitFrom = (names: string | undefined, databases: string | undefined) => {
  const refs = catalogConditionReferences(names, databases);
  const fields = Array(24).fill("");
  fields[7] = refs.map((r) => r.name).join("|");
  fields[23] = refs.map((r) => r.ids.join(",")).join("|");
  return parseCatalogEntry(fields.join("\t"));
};

test("condition identifiers stay paired when unnamed and duplicate conditions are removed", () => {
  const hit = hitFrom(
    "Hypertension,_salt-sensitive_essential,_susceptibility_to|not_provided|hydrochlorothiazide_response_-_Efficacy|Hypertension,_salt-sensitive_essential,_susceptibility_to",
    "MedGen:C3837651|MedGen:C3661900|MedGen:CN322734|MedGen:C3837651",
  );
  assert.equal(
    hit.conditions,
    "Hypertension, salt-sensitive essential, susceptibility to|hydrochlorothiazide response - Efficacy",
  );
  assert.equal(
    conditionUrl(hit, "Hypertension, salt-sensitive essential, susceptibility to"),
    "https://www.ncbi.nlm.nih.gov/medgen/C3837651",
  );
  assert.equal(
    conditionUrl(hit, "hydrochlorothiazide response - Efficacy"),
    "https://www.ncbi.nlm.nih.gov/medgen/CN322734",
  );
  assert.equal(conditionUrl(hit, "not provided"), null);
});

test("a missing middle reference does not shift links onto another condition", () => {
  const hit = hitFrom("First|Second|Third", "MedGen:C3837651|.|MedGen:C3547403");
  assert.equal(conditionUrl(hit, "First"), "https://www.ncbi.nlm.nih.gov/medgen/C3837651");
  assert.equal(conditionUrl(hit, "Second"), null);
  assert.equal(conditionUrl(hit, "Third"), "https://www.ncbi.nlm.nih.gov/medgen/C3547403");
});

test("ambiguous, misaligned and unsupported references do not invent a condition link", () => {
  for (const refs of [
    "MedGen:C1234567,MedGen:C2345678",
    "MedGen:C1234567,OMIM:123456/MedGen:C2345678,OMIM:234567",
    "OMIM:123456",
    ".",
  ])
    assert.equal(conditionUrl(hitFrom("Condition", refs), "Condition"), null, refs);
  assert.equal(conditionUrl(hitFrom("Condition|Another", "MedGen:C1234567"), "Condition"), null);
  assert.equal(
    conditionUrl(hitFrom("Condition|Condition", "MedGen:C1234567|MedGen:C2345678"), "Condition"),
    null,
  );
  assert.equal(
    conditionUrl({ conditions: "Condition", conditionMedgenIds: "C1234567|C2345678" }, "Condition"),
    null,
  );
  assert.equal(
    conditionUrl(
      { conditions: "Condition", conditionMedgenIds: "javascript:alert(1)" },
      "Condition",
    ),
    null,
  );
  assert.equal(
    conditionUrl(
      { conditions: "Condition", conditionMedgenIds: "C1234567/../../wrong" },
      "Condition",
    ),
    null,
  );
  assert.equal(conditionUrl(parseCatalogEntry(""), "Condition"), null);
});
