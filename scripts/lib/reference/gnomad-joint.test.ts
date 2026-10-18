import test from "node:test";
import assert from "node:assert/strict";
import { parseJointFrequency } from "./gnomad-joint.ts";

// Public gnomAD v4.1 joint entry for rs121908073; unrelated INFO fields omitted.
const region = { chrom: "9", start: 72694577, end: 72694578, keys: new Set(["72694578:C:T"]) };
const info =
  "AC_joint=35;AN_joint=1612698;AF_joint=2.17028e-05;grpmax_joint=sas;AF_grpmax_joint=0.000197824;stat_union_p_value=0.783198;AC_exomes=33;AN_exomes=1460652;AF_exomes=2.25927e-05;AF_joint_sas=0.000197824;AN_joint_sas=96045";
const row = (fields = info, filter = "PASS") => `chr9\t72694578\t.\tC\tT\t.\t${filter}\t${fields}`;

test("imports the published joint AF and counts, not either component or filtering AF", () => {
  const result = parseJointFrequency(row(info + ";faf95_joint=0.9"), region)!;
  assert.equal(result.af, "2.17028e-05");
  assert.equal(result.ac, 35);
  assert.equal(result.an, 1612698);
  assert.equal(result.grp, "South Asian");
  assert.equal(result.afmax, "0.000197824");
  assert.equal(result.discordanceP, "0.783198");
  assert.equal(result.pops["sas"], 0.000197824);
});
test("exact chromosome, position and both alleles are required", () => {
  for (const changed of [
    row().replace("chr9", "chr8"),
    row().replace("72694578", "72694579"),
    row().replace("\tC\tT", "\tC\tG"),
    row().replace("\tC\tT", "\tA\tT"),
  ])
    assert.equal(parseJointFrequency(changed, region), null);
});
test("zero AF is measured, while no called alleles produces no frequency", () => {
  const zero = parseJointFrequency(
    row("AC_joint=0;AN_joint=100;AF_joint=0;AN_joint_eas=100;AF_joint_eas=0"),
    region,
  )!;
  assert.equal(zero.af, "0");
  assert.equal(zero.afmax, ".");
  assert.equal(zero.discordanceP, ".");
  assert.deepEqual(zero.pops, { eas: 0 });
  assert.equal(parseJointFrequency(row("AC_joint=0;AN_joint=0"), region), null);
});
test("invalid or missing joint fields cannot silently fall back to the old datasets", () => {
  for (const invalid of [
    "AC_exomes=1;AN_exomes=100;AF_exomes=0.01",
    "AC_joint=101;AN_joint=100;AF_joint=1",
    "AC_joint=1;AN_joint=100",
    "AC_joint=1;AN_joint=100;AF_joint=0.5",
    "AC_joint=1;AN_joint=100;AF_joint=0.01;stat_union_p_value=2",
  ])
    assert.throws(() => parseJointFrequency(row(invalid), region), /gnomAD/);
  assert.throws(() => parseJointFrequency(row(info, "NEW_FILTER"), region), /FILTER/);
});
test("source quality filters survive import independently of AF and discordance", () => {
  for (const filter of ["EXOMES_FILTERED", "GENOMES_FILTERED", "BOTH_FILTERED"])
    assert.equal(parseJointFrequency(row(info, filter), region)!.filter, filter);
});
