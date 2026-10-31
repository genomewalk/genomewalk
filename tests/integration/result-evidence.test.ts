import { fixture as partialFixture } from "../helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  resultCategories,
  resultSummary,
  parseCatalogEntry,
  reviewText,
} from "../../src/lib/results/evidence.ts";
import { ctx } from "../../src/experiences/vcf/engine/context.ts";
import { findMatches } from "../../src/experiences/vcf/engine/matching.ts";
import { matchRow } from "../../src/experiences/vcf/engine/view/results.ts";
import { vcfSource, testDocument } from "../helpers/vcf.ts";
import type { VcfMatch } from "../../src/experiences/vcf/types.ts";
import { catalogFields, parseClinvar } from "../../scripts/lib/clinvar.ts";

globalThis.document = testDocument();
const record = (gt = "0/1") => [
  "9",
  "72694578",
  "rs121908073",
  "C",
  "T",
  "100",
  "PASS",
  ".",
  "GT",
  gt,
];
const entry = [
  "9",
  "72694578",
  "C",
  "T",
  "P",
  "2",
  "TMC1",
  "Hearing loss",
  ".",
  "",
  ".",
  ".",
  "4103",
  "",
  "Pathogenic",
].join("\t");
const runtime = (records: string[][] = []) => ({
  ctx,
  matchRow,
  findMatches: (_source: unknown, map: Map<string, string>) => findMatches(vcfSource(records), map),
});
const render = (h: Partial<VcfMatch> = {}) => {
  const r = runtime();
  r.ctx.header = {
    meta: [],
    columns: ["CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO", "FORMAT", "YOU"],
  };
  return r.matchRow({
    ...parseCatalogEntry(entry),
    f: record(),
    copies: 1,
    ploidy: 2,
    gt: "0/1",
    partialCall: false,
    recordCount: 1,
    sourceCalls: [record()],
    callKeys: [],
    ...h,
  }).innerHTML;
};

test("catalogue decoding preserves all reference fields, measured zero and aligned condition IDs", () => {
  const row = [
    "9",
    "72694578",
    "C",
    "T",
    "P",
    "2",
    "TMC1",
    "Hearing loss|Other condition",
    "0",
    "sas",
    ".",
    "1000",
    "4103",
    "12345",
    "Pathogenic",
    "criteria_provided,_multiple_submitters,_no_conflicts",
    "rs121908073",
    "NM_138691.3:c.100C>T",
    "11850618,not-a-pmid,17877751",
    "2024-01-01",
    "2023-12-01",
    "",
    "9-72694578-C-T",
    "C1832394|",
    "0",
    "PASS",
    "0.00001",
  ];
  assert.deepEqual(parseCatalogEntry(row.join("\t")), {
    chrom: "9",
    pos: 72694578,
    ref: "C",
    alt: "T",
    sig: "P",
    stars: 2,
    gene: "TMC1",
    conditions: "Hearing loss|Other condition",
    af: 0,
    grp: "sas",
    afmax: null,
    an: 1000,
    variationId: "4103",
    alleleId: "12345",
    rawSig: "Pathogenic",
    reviewStatus: "criteria_provided,_multiple_submitters,_no_conflicts",
    rsIds: "rs121908073",
    hgvs: "NM_138691.3:c.100C>T",
    pmids: ["11850618", "17877751"],
    releaseDate: "2024-01-01",
    citationDate: "2023-12-01",
    conflictingSig: "",
    gnomadKey: "9-72694578-C-T",
    conditionMedgenIds: "C1832394|",
    gnomadAc: 0,
    gnomadFilter: "PASS",
    gnomadDiscordanceP: 0.00001,
  });
});

test("categories follow source labels, including ClinVar Affects for non-disease traits", () => {
  for (const [rawSig, category] of [
    ["drug_response", "drug"],
    ["Affects", "trait"],
    ["association", "association"],
    ["protective", "association"],
    ["risk_factor", "association"],
    ["Uncertain_risk_allele", "association"],
    ["Likely risk allele", "association"],
    ["Established_risk_allele", "association"],
    ["other", "other"],
  ])
    assert.deepEqual(resultCategories({ sig: "O", stars: 0, rawSig: rawSig! }), [category], rawSig);
  assert.deepEqual(
    resultCategories(partialFixture({ sig: "P", rawSig: "Pathogenic|drug_response|Affects" })),
    ["drug", "trait", "disease"],
  );
  assert.deepEqual(
    resultCategories(
      partialFixture({
        sig: "C",
        rawSig: "Conflicting_classifications_of_pathogenicity|risk_factor",
      }),
    ),
    ["association", "disease"],
  );
});

test("mixed benign or uncertain classifications keep their independent evidence and full labels", () => {
  for (const [rawSig, category, summary] of [
    ["Benign|drug_response", "drug", "drug response"],
    ["Likely_benign|drug_response|other", "drug", "drug response"],
    ["Benign/Likely_benign|drug_response", "drug", "drug response"],
    ["Uncertain_significance|drug_response", "drug", "drug response"],
    ["Benign|risk_factor", "association", "association record"],
    ["Uncertain_significance|association", "association", "association record"],
    ["Benign|protective", "association", "association record"],
    ["Benign|Affects", "trait", "trait record"],
  ]) {
    const parsed = parseClinvar(
      `9\t72694578\t4103\tC\tT\t.\t.\tCLNSIG=${rawSig};CLNDN=Example_condition`,
    );
    assert.ok(parsed, rawSig);
    const evidence = parseCatalogEntry(catalogFields(parsed).join("\t"));
    assert.equal(evidence.sig, "O", rawSig);
    assert.equal(evidence.rawSig, rawSig);
    assert.deepEqual(resultCategories(evidence), [category], rawSig);
    assert.equal(resultSummary(evidence).label, summary, rawSig);
    const html = render(evidence);
    assert.ok(html.includes(rawSig!.replaceAll("_", " ").replaceAll("|", " · ")), rawSig);
    assert.ok(!html.includes(">Pathogenic<"), rawSig);
  }
});

test("gene names, exact variant IDs and curated marker metadata never change categories or summaries", () => {
  const original = { sig: "O", rawSig: "other", afmax: 0.1, stars: 2 };
  for (const metadata of [
    { gene: "TMC1", variationId: "4103", chrom: "9", pos: 72694578, ref: "C", alt: "T" },
    { gene: "PNPLA3", variationId: "341932", chrom: "22", pos: 43928847, ref: "C", alt: "G" },
    {
      marker: {
        cat: "trait",
        read: ["a", "b", "c"],
        cite: { label: "Study", url: "https://example.org" },
      },
    },
  ]) {
    assert.deepEqual(resultCategories({ ...original, ...metadata }), resultCategories(original));
    assert.deepEqual(resultSummary({ ...original, ...metadata }), resultSummary(original));
  }
});

test("category matching respects source terms rather than arbitrary substrings", () => {
  assert.deepEqual(
    resultCategories(
      partialFixture({ sig: "O", rawSig: "other", conditions: "Drug response affects a trait" }),
    ),
    ["other"],
  );
  assert.deepEqual(
    resultCategories(partialFixture({ sig: "O", rawSig: "not_a_drug_response|not_protective" })),
    ["other"],
  );
});

test("missing frequencies remain unknown; zero stays zero", () => {
  const unknown = parseCatalogEntry(entry);
  assert.equal(unknown.af, null);
  assert.equal(unknown.afmax, null);
  assert.equal(resultSummary(unknown).label, "frequency unknown");
  const zero = parseCatalogEntry(entry.replace("\t.\t\t.\t.\t", "\t0\tgroup\t0\t1000\t"));
  assert.equal(zero.afmax, 0);
  const html = render({ af: 0, afmax: null });
  assert.match(html, /0%/);
  assert.doesNotMatch(html, /highest group/);
});

test("common variants retain context without automatic dismissal or carrier percentages", () => {
  const summary = resultSummary(
    partialFixture({
      sig: "C",
      rawSig: "Conflicting_classifications_of_pathogenicity",
      afmax: 0.5,
    }),
  );
  assert.equal(summary.label, "common variant");
  assert.doesNotMatch(summary.why, /carried by|dismiss|rules out|healthy/);
  assert.match(summary.why, /associations/);
});

test("one-star conflicts retain the original review status", () => {
  assert.equal(
    reviewText({
      stars: 1,
      sig: "C",
      reviewStatus: "criteria_provided,_conflicting_classifications",
    }),
    "criteria provided, conflicting classifications",
  );
});

test("results contain only carried catalogue alleles, without added manually curated readings", async () => {
  assert.equal((await runtime([record()]).findMatches({}, new Map())).length, 0);
  assert.equal(
    (await runtime([record("0/0")]).findMatches({}, new Map([["9:72694578:C:T", entry]]))).length,
    0,
  );
  const found = await runtime([record()]).findMatches({}, new Map([["9:72694578:C:T", entry]]));
  assert.equal(found.length, 1);
  assert.equal(found[0]!.variationId, "4103");
  assert.equal(Reflect.get(found[0]!, "marker"), undefined);
});

test("partial and contradictory calls do not produce a complete copy count", async () => {
  const found = await runtime([record("1/.")]).findMatches(
    {},
    new Map([["9:72694578:C:T", entry]]),
  );
  assert.equal(found[0]!.ploidy, 2);
  assert.equal(found[0]!.partialCall, true);
  assert.equal(resultSummary(partialFixture(found[0])).label, "incomplete call");
  assert.doesNotMatch(render(found[0]), /one copy|single copy|carrier context/);
  assert.match(render(found[0]), /unknown<\/span><\/b> \(incomplete call\)/);
  assert.match(render(found[0]), /class="mh-location">chr9:72,694,578 · T\?<\/span>/);
  assert.doesNotMatch(render({ conflictingRecords: true }), /You have|one copy|single copy/);
  assert.match(render({ conflictingRecords: true }), /conflicting allele calls/);
  assert.match(
    render({ conflictingRecords: true }),
    /class="mh-location">chr9:72,694,578 · conflicting calls<\/span>/,
  );
});

test("the combined row pairs called alleles with the exact ClinVar allele across genotype types", () => {
  for (const [gt, alleles] of [
    ["0/1", "C and T"],
    ["1|0", "T and C"],
    ["1/1", "T and T"],
    ["1", "T"],
  ]) {
    const html = render({
      f: record(gt),
      copies: gt === "1/1" ? 2 : 1,
      ploidy: gt === "1" ? 1 : 2,
    });
    const combined = html
      .match(/<td class="fk">You & ClinVar<\/td><td class="fd">([\s\S]*?)<\/td>/)![1]!
      .replace(/<[^>]+>/g, "");
    assert.match(combined, new RegExp(`Your ${gt === "1" ? "allele" : "alleles"}: ${alleles}\\.`));
    assert.match(combined, /ClinVar allele: T — Pathogenic\./);
    assert.equal(
      html.match(/class="mh-location">([^<]+)<\/span>/)![1],
      `chr9:72,694,578 · ${alleles!.replaceAll(" and ", "")}`,
    );
    assert.doesNotMatch(
      html,
      /<td class="fk">(?:You|Claim)<\/td>|The claim is about|at this spot, where the reference/,
    );
  }
});

test("the combined row resolves multiallelic indices and preserves insertion sequences", () => {
  const multi = ["1", "100", "rs100", "A", "C,G", "100", "PASS", ".", "GT", "1/2"];
  for (const alt of ["C", "G"]) {
    const rendered = render({ f: multi, ref: "A", alt });
    assert.match(rendered, /class="mh-location">[^<]* · CG<\/span>/);
    const html = rendered.replace(/<[^>]+>/g, "");
    assert.match(html, /Your alleles: C and G\./);
    assert.match(html, new RegExp(`ClinVar allele: ${alt} — Pathogenic\\.`));
  }
  const insertion = ["1", "101", "rs101", "C", "CTT", "100", "PASS", ".", "GT", "0/1"];
  const rendered = render({ f: insertion, ref: "C", alt: "CTT" });
  assert.match(rendered, /class="mh-location">[^<]* · C \/ CTT<\/span>/);
  const html = rendered.replace(/<[^>]+>/g, "");
  assert.match(html, /Your alleles: C and CTT\./);
  assert.match(html, /ClinVar allele: CTT — Pathogenic\./);
});

test("compact details retain exact sources and distinct conditions without technical date metadata", () => {
  const html = render({
    conditions: "Autosomal dominant hearing loss|Autosomal recessive hearing loss",
    releaseDate: "2026-09-05",
    citationDate: "2026-09-13",
    pmids: ["17877751", "17877751"],
    gnomadKey: "9-72694578-C-T",
  });
  assert.match(html, /clinvar\/variation\/4103\//);
  assert.match(html, /gnomad.broadinstitute.org\/variant\/9-72694578-C-T\?dataset=gnomad_r4/);
  assert.doesNotMatch(html, /2026-09-05|2026-09-13|snapshot|Publication index|Sources & dates/);
  assert.equal(html.split("pubmed.ncbi.nlm.nih.gov/17877751/").length - 1, 1);
  assert.match(html, /Autosomal dominant hearing loss/);
  assert.match(html, /Autosomal recessive hearing loss/);
  assert.match(html, /<td class="fk">Sources<\/td>/);
  assert.doesNotMatch(html, /p.Arg34Ter|Research context|Inheritance context|RCV000004319/);
});

test("frequency figures do not invent missing population values", () => {
  const html = render({ af: null, afmax: 0.02, grp: "Test group" });
  assert.equal(html.split('class="person"').length - 1, 1);
  assert.match(html, /2\.0% of allele copies/);
  assert.doesNotMatch(html, /fp all|NaN|result-af-row/);
  assert.doesNotMatch(render({ af: null, afmax: null }), /class="person"/);
});

test("expanded condition names use their source identifiers while titles stay compact", () => {
  const html = render({
    conditions:
      "Hypertension, salt-sensitive essential, susceptibility to|hydrochlorothiazide response - Efficacy|Another condition",
    conditionMedgenIds: "C3837651|CN322734|",
  });
  const conditions = html.match(/<ul class="plain conds">([\s\S]*?)<\/ul>/)![1];
  assert.match(
    conditions!,
    /href="https:\/\/www.ncbi.nlm.nih.gov\/medgen\/C3837651" target="_blank" rel="noopener">Hypertension, salt-sensitive essential, susceptibility to ↗<\/a>/,
  );
  assert.match(
    conditions!,
    /href="https:\/\/www.ncbi.nlm.nih.gov\/medgen\/CN322734"[^>]*>hydrochlorothiazide response - Efficacy ↗<\/a>/,
  );
  assert.match(conditions!, /<li>Another condition<\/li>/);
  assert.match(
    html,
    /class="mh-condition mut">Hypertension, salt-sensitive essential, susceptibility to \(\+2 more\)<\/span>/,
  );
  assert.doesNotMatch(conditions!, /\(\+2 more\)|…/);
});
