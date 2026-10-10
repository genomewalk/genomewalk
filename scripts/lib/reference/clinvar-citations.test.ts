import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { citationParser, extractCitations, readCitationIndex } from "./clinvar-citations.ts";

const citation = (id: string, source = "PubMed") =>
  `<Citation Type="general"><ID Source="${source}">${id}</ID></Citation>`;
const release = (body: string) =>
  `<?xml version="1.0"?><ClinVarVariationRelease ReleaseDate="2026-09-28">${body}</ClinVarVariationRelease>`;
const variant = (id: string, body: string) =>
  `<VariationArchive VariationID="${id}"><ClassifiedRecord>${body}</ClassifiedRecord></VariationArchive>`;

// The real TMC1/4103 aggregate list, with unrelated citation scopes around it.
const tmc1 = [
  "11850618",
  "17877751",
  "19187973",
  "20373850",
  "22105175",
  "24949729",
  "25074487",
  "30303587",
  "31854501",
  "34523024",
  "41231290",
];
const xml = release(
  variant(
    "4103",
    `
  <Classifications>
    <GermlineClassification>
      ${tmc1.map((id) => citation(id)).join("")}
      ${citation(tmc1[0]!)}${citation("4544753", "PubMedCentral")}
      <ConditionList><TraitSet><Trait>${citation("20301607")}</Trait></TraitSet></ConditionList>
    </GermlineClassification>
    <SomaticClinicalImpact>${citation("333")}</SomaticClinicalImpact>
    <OncogenicityClassification>${citation("444")}</OncogenicityClassification>
  </Classifications>
  <ClinicalAssertionList><ClinicalAssertion>
    <AttributeSet><Attribute Type="AssertionMethod">ACMG</Attribute>${citation("18414213")}</AttributeSet>
    <Classification>${citation("555")}</Classification>
    <ObservedInList><ObservedIn>${citation("666")}</ObservedIn></ObservedInList>
    <Comment>Mentions PMID 777, not a structured citation.</Comment>
  </ClinicalAssertion></ClinicalAssertionList>
`,
  ) + variant("4104", "<Classifications><GermlineClassification/></Classifications>"),
);

test("ClinVar aggregate citations match the variant table without method, condition or submission references", () => {
  const records: [string, string[]][] = [];
  let date = "";
  const parser = citationParser(
    (value) => {
      date = value;
    },
    (id, ids) => records.push([id, ids]),
  );
  // XML tags and PMID values may cross any stream boundary.
  for (let i = 0; i < xml.length; i += 7) parser.write(xml.slice(i, i + 7));
  parser.close();
  assert.equal(date, "2026-09-28");
  assert.deepEqual(records, [
    ["4103", tmc1],
    ["4104", []],
  ]);
});

test("a paper used as an assertion method elsewhere is retained when ClinVar explicitly cites it for this variant", () => {
  const records: string[][] = [];
  citationParser(
    () => {},
    (_id, ids) => records.push(ids),
  )
    .write(
      release(
        variant(
          "1",
          `
    <Classifications><GermlineClassification>${citation("18414213")}</GermlineClassification></Classifications>
    <ClinicalAssertionList><ClinicalAssertion><AttributeSet>${citation("18414213")}</AttributeSet></ClinicalAssertion></ClinicalAssertionList>
  `,
        ),
      ),
    )
    .close();
  assert.deepEqual(records, [["18414213"]]);
});

test("citation extraction publishes a dated compact cache and preserves it on corrupt or truncated input", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clinvar-citations-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, "input.xml.gz"),
    output = path.join(dir, "citations.tsv");
  fs.writeFileSync(input, gzipSync(xml));
  await extractCitations(input, output);
  const before = fs.readFileSync(output);
  const index = await readCitationIndex(output);
  assert.equal(index.date, "2026-09-28");
  assert.deepEqual(index.pmids, new Map([["4103", new Set(tmc1)]]));
  for (const broken of [
    gzipSync(xml.slice(0, -20)),
    gzipSync(xml).subarray(0, -8),
    gzipSync(release("")),
  ]) {
    fs.writeFileSync(input, broken);
    await assert.rejects(extractCitations(input, output));
    assert.deepEqual(fs.readFileSync(output), before);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["citations.tsv", "input.xml.gz"]);
  }
  fs.writeFileSync(output, before.toString().replace(/#Complete.*\n/, ""));
  await assert.rejects(readCitationIndex(output), /Incomplete/);
  fs.writeFileSync(output, "#AlleleID\tVariationID\n");
  await assert.rejects(readCitationIndex(output), /Invalid ClinVar citation cache/);
});

test("wrong XML roots, missing release dates, invalid PubMed IDs and DTDs fail closed", () => {
  for (const bad of [
    "<Unexpected/>",
    '<ClinVarVariationRelease><VariationArchive VariationID="1"/></ClinVarVariationRelease>',
    release(
      variant(
        "1",
        `<Classifications><GermlineClassification>${citation("not-an-id")}</GermlineClassification></Classifications>`,
      ),
    ),
    '<!DOCTYPE ClinVarVariationRelease SYSTEM "https://example.org/external.dtd">' +
      release(variant("1", "")),
  ])
    assert.throws(() =>
      citationParser(
        () => {},
        () => {},
      )
        .write(bad)
        .close(),
    );
});
