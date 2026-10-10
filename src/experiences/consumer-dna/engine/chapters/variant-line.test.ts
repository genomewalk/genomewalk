import type { TestElement } from "../../../../../tests/helpers/fixture.ts";
import { mockDocument, testElement } from "../../../../../tests/helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { openConsumerFile } from "../../reader.ts";
import { renderVariantLine } from "./variant-line.ts";

function output(t: test.TestContext) {
  const original = globalThis.document;
  globalThis.document = mockDocument();
  t.after(() => {
    globalThis.document = original;
  });
  return testElement("div");
}

async function render(
  out: TestElement,
  genotype: string,
  { ancestry = false, chrom = "1", id = "rsTest" } = {},
) {
  const header = ancestry
    ? "# AncestryDNA\n# build 37\nrsid\tchromosome\tposition\tallele1\tallele2"
    : "# 23andMe\n# build 37\n# rsid\tchromosome\tposition\tgenotype";
  const source = await openConsumerFile(
    new File([`${header}\n${id}\t${chrom}\t82154\t${genotype}`], "synthetic.txt"),
  );
  renderVariantLine(source, out);
  return {
    details: out.children.filter((child: { tagName: string }) => child.tagName === "details"),
    reading: out.children.find((child: { className: string }) => child.className === "note")!
      .innerHTML,
    raw: out.children.find((child: { className: string | string[] }) =>
      child.className?.includes("consumer-example-row"),
    )!.innerHTML,
  };
}

test("the walkthrough reads the selected row literally, including its marker and differing alleles", async (t) => {
  const out = output(t);
  const { details, reading, raw } = await render(out, "CT", { id: "i<example>" });
  assert.match(
    details.find((detail: { id: string }) => detail.id === "variant-genotype")!.innerHTML,
    /same \(<code>AA<\/code>\) or different \(<code>AG<\/code>\)/,
  );
  for (const [, id] of raw.matchAll(/href="#([^"]+)"/g))
    assert.ok(details.some((detail) => detail.id === id));
  assert.match(reading, /chromosome <b>1<\/b>.*position <b>82,154<\/b>/s);
  assert.match(reading, /<code>CT<\/code> reports <b>C<\/b> and <b>T<\/b>/);
  assert.match(reading, /two different alleles at the same site/);
  assert.match(reading, /i&lt;example&gt;/);
  assert.match(raw, /i&lt;example&gt;/);
  assert.doesNotMatch(reading, /<example>|reference|mother|father/);
  assert.equal(out.children.filter((child) => child.tagName === "details").length, 4);
});

test("the Ancestry walkthrough preserves separate allele columns and explains numeric chromosome labels", async (t) => {
  const out = output(t);
  const { details, reading, raw } = await render(out, "A\tA", { ancestry: true, chrom: "23" });
  assert.match(raw, /href="#variant-allele1"/);
  assert.match(raw, /href="#variant-allele2"/);
  assert.match(
    details.find((detail: { id: string }) => detail.id === "variant-allele1")!.innerHTML,
    /same \(<code>A<\/code> and <code>A<\/code>\)/,
  );
  assert.doesNotMatch(raw, /variant-genotype/);
  for (const [, id] of raw.matchAll(/href="#([^"]+)"/g))
    assert.ok(details.some((detail) => detail.id === id));
  assert.match(reading, /chromosome <b>X<\/b> \(written as <code>23<\/code> here\)/);
  assert.match(reading, /Both entries report <b>A<\/b> — the same allele twice/);
  assert.match(raw, /cell-v">23<\/span>/);
  assert.equal(out.children.filter((child) => child.tagName === "details").length, 5);
});

test("an unusual first row is explained without inventing two complete DNA alleles", async (t) => {
  const out = output(t);
  const examples: [string, { ancestry?: boolean; chrom?: string }, RegExp][] = [
    ["--", {}, /no DNA letters were reported/],
    ["0\t0", { ancestry: true }, /no DNA letters were reported/],
    ["A-", {}, /one reported entry and one missing entry/],
    ["ID", {}, /uses insertion\/deletion codes/],
    ["A", { chrom: "X" }, /reports a single letter/],
    ["AA", {}, /same allele twice/],
  ];
  for (const [genotype, options, expected] of examples) {
    out.children.length = 0;
    const { reading } = await render(out, genotype, options);
    assert.match(reading, expected);
    assert.doesNotMatch(reading, /two different alleles|undefined|null/);
  }
});
