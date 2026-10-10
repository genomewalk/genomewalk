import test from "node:test";
import assert from "node:assert/strict";
import {
  createVcfRowExamples,
  collectVcfRowExample,
  vcfRowCheck,
  vcfRowDiagram,
  vcfRowExplanations,
} from "../../src/experiences/vcf/engine/row-diagram.ts";
const row = (alt: string, gt: string, filter = "PASS", chrom = "1", ref = "A") => [
  chrom,
  "12345",
  "rs123",
  ref,
  alt,
  ".",
  filter,
  ".",
  "GT",
  gt,
];

test("VCF row checks include carried indels and sex chromosomes, and flag partial calls", () => {
  for (const f of [
    row("G", "0/1"),
    row("AT", "1/1"),
    row("G", "1", "PASS", "X"),
    row("G,T", "0/2"),
  ])
    assert.equal(vcfRowCheck(f, "GRCh38").matchable, true);
  const partial = vcfRowCheck(row("G", "./1"), "GRCh37");
  assert.equal(partial.matchable, true);
  assert.equal(partial.partial, true);
  for (const f of [
    row(".", "0/0"),
    row("G", "0/0"),
    row("G", "./."),
    row("G", "0/1", "LowQual"),
    row("<NON_REF>", "0/1"),
  ])
    assert.equal(vcfRowCheck(f, "GRCh38").matchable, false);
  assert.equal(vcfRowCheck(row("G", "0/1"), "unknown").matchable, false);
  assert.equal(vcfRowCheck(row("N", "0/1"), "GRCh38").matchable, true);
  assert.equal(vcfRowCheck(row("A".repeat(51), "0/1"), "GRCh38").matchable, false);
});

test("examples retain real row numbers, stay bounded, and sum to whole-file totals", () => {
  const state = createVcfRowExamples("GRCh38");
  const records = [
    row(".", "0/0", "PASS", "chr1"),
    row("G", "0/1", "PASS", "2"),
    row("G", "./.", "PASS", "X"),
    row("AT", "1/1", "PASS", "7"),
    row("G", "0/1", "LowQual", "chrY"),
    row("G,T", "1/2", "PASS", "MT"),
  ];
  for (const fields of records) collectVcfRowExample(state, fields);
  for (let i = 0; i < 100; i++) collectVcfRowExample(state, row("G", "0/1"));
  assert.equal(state.records, 106);
  assert.equal(state.matchable, 103);
  assert.equal(state.examples["standard"]!.row, 2);
  assert.equal(Object.keys(state.examples).length, 6);
  const html = vcfRowDiagram(state, "<sample>");
  assert.doesNotMatch(html, /row-map-id|rs123/);
  assert.match(html, /class="row-map-number">Row 2<\/span>/);
  assert.deepEqual(
    [...html.matchAll(/<dt>CHROM<\/dt><dd>([^<]+)<\/dd>/g)].map((match) => match[1]).sort(),
    records.map((fields) => fields[0]).sort(),
    "displayed chromosomes come verbatim from each selected source row",
  );
  assert.match(html, /Insertion \/ deletion/);
  assert.match(html, /&lt;sample&gt;/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test("long alleles remain complete with separate lines for ALT alternatives", () => {
  const state = createVcfRowExamples("GRCh38");
  const sequence = "ACGT".repeat(12);
  collectVcfRowExample(state, row(`${sequence},C`, "1/2"));
  const html = vcfRowDiagram(state);
  assert.ok(
    html.includes(
      `<span class="row-map-allele"><mark>${sequence},</mark></span><span class="row-map-allele"><mark>C</mark></span>`,
    ),
  );
  assert.doesNotMatch(html, /…/);
  assert.match(html, /href="#vcf-count-multiple"/);
});

test("every example link has exactly one explanation, including incomplete and symbolic calls", () => {
  const state = createVcfRowExamples("GRCh38");
  for (const fields of [
    row("G", "0/1"),
    row(".", "0/0"),
    row("G", "./."),
    row("G", "./1"),
    row("AT", "1/1"),
    row("G,T", "1/2"),
    row("G", "0/1", "LowQual"),
    row("<DEL>", "0/1"),
  ])
    collectVcfRowExample(state, fields);
  const diagram = vcfRowDiagram(state, "sample", { showSummary: false });
  const story = vcfRowExplanations(state);
  const targets = [...diagram.matchAll(/href="#(vcf-count-[^"]+)"/g)];
  assert.equal(targets.length, 8);
  for (const [, id] of targets) assert.equal(story.split(`id="${id}"`).length - 1, 1);
  assert.doesNotMatch(diagram, /row-map-totals|Whole file/);
});
