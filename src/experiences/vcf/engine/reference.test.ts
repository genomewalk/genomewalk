import test from "node:test";
import assert from "node:assert/strict";
import { detectBuild, genomeLen } from "./reference.ts";
import { detectReferenceBuild } from "../../../lib/genetics/reference-build.ts";
import { buildGuard, refUrl } from "./view/file.ts";
import { loadCatalog } from "./catalogue.ts";
import { ctx, currentBuild, selectSource } from "./context.ts";
import { scanStats } from "./statistics.ts";
import vcfExperience from "../index.ts";
import { ensureStats, rowPreviews } from "./runtime.ts";
import { headerChapter } from "./chapters/header.ts";
import { rowExamplesChapter } from "./chapters/row-examples.ts";
import { STEPS } from "./learn.ts";
import { header, vcfSource, testDocument } from "../../../../tests/helpers/vcf.ts";
import { testElement } from "../../../../tests/helpers/fixture.ts";

const names = {
  GRCh37: [
    "GRCh37",
    "GRCh37.p13",
    "grch_37",
    "hg19",
    "HG-19",
    "NCBI37",
    "NCBI build 37",
    "build:37",
    "build=37.1",
    "b37",
    "hs37d5",
    "human_g1k_v37.fasta.gz",
  ],
  GRCh38: [
    "GRCh38",
    "grch38.p14",
    "GRCh 38",
    "hg38",
    "HG_38",
    "NCBI38",
    "build = 38",
    "assembly:38",
    "file:///refs/Homo_sapiens.GRCh38.dna.fa",
  ],
  NCBI36: ["NCBI36", "build36", "build 36.3", "hg18"],
  "T2T-CHM13": ["T2T-CHM13", "T2T-CHM13v2.0", "chm13v1.1.fa", "hs1"],
};

test("reference aliases, separators, patch releases and FASTA names identify the build", () => {
  for (const [build, aliases] of Object.entries(names)) {
    for (const alias of aliases) {
      assert.equal(detectReferenceBuild([alias]), build, alias);
      assert.equal(detectBuild([`##reference=${alias}`]), build, alias);
    }
  }
});

test("unrelated versions and partial name matches are not build declarations", () => {
  for (const value of [
    "",
    "reference.fa",
    "37",
    "38",
    "GRCh380",
    "hg190",
    "myhg38sample",
    "build 380",
    "annotation release 38",
    "GCF_000001405",
    "NCBI39",
    "T2T-HG002",
    "T2T",
  ])
    assert.equal(detectReferenceBuild([value]), "unknown", value);
  assert.equal(
    detectBuild([
      '##INFO=<ID=DB,Description="Annotations lifted from hg19">',
      '##GATKCommandLine=<CommandLine="--chain hg19ToHg38.over.chain">',
      "##source=GRCh38_tool",
    ]),
    "unknown",
  );
});

test("any primary chromosome can identify the build, independent of field order and quotes", () => {
  assert.equal(
    detectBuild(['##contig=<length="242193529", assembly="GRCh38.p14", ID="chr2">']),
    "GRCh38",
  );
  assert.equal(detectBuild(["##contig=<length=48129895,ID=21>"]), "GRCh37");
  assert.equal(detectBuild(['##contig=<ID=Y,assembly="hg19">']), "GRCh37");
  assert.equal(detectBuild(["##REFERENCE = hg38"]), "GRCh38");
  assert.equal(detectBuild(["##genome_build=GRCh37"]), "GRCh37");
  assert.equal(detectBuild(["##contig=<ID=chr1,length=248387328>"]), "T2T-CHM13");
  assert.equal(detectBuild(["##contig=<ID=chrM,length=16569>"]), "unknown");
  assert.equal(
    detectBuild(['##contig=<ID=other,Description="a label,assembly=hg38",length=248956422>']),
    "unknown",
  );
  assert.equal(
    genomeLen([
      "##contig=<length=20,ID=1>",
      '##contig=<ID="chr2",length="30">',
      "##contig=<ID=alt,length=99>",
    ]),
    50,
  );
});

test("reference labels and chromosome lengths must agree", () => {
  const cases = [
    ["##reference=GRCh37", "##reference=GRCh38"],
    ["##reference=GRCh38", "##contig=<ID=1,length=249250621>"],
    ["##contig=<ID=1,length=249250621>", "##contig=<ID=2,length=242193529>"],
    ['##contig=<ID=1,length=248956422,assembly="hg19">'],
    ["##reference=NCBI36", "##reference=GRCh38"],
  ];
  for (const meta of cases) assert.equal(detectBuild(meta), "conflicting");
  assert.equal(
    detectBuild(["##reference=hg19", "##contig=<ID=1,length=249250621,assembly=GRCh37>"]),
    "GRCh37",
  );
});

test("unknown, conflicting and unsupported VCFs never fetch a catalogue or reuse an earlier build", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected download");
  });
  globalThis.document = testDocument();
  for (const meta of [
    [],
    ["##reference=hg19", "##reference=hg38"],
    ["##reference=NCBI36"],
    ["##reference=T2T-CHM13"],
  ]) {
    selectSource(vcfSource(), { ...header, meta });
    ctx.build = "GRCh38";
    assert.equal(buildGuard(testElement("div")), false);
    assert.equal(ctx.build, null);
    assert.throws(() => refUrl("markers.json"), /supported reference build/);
    await assert.rejects(loadCatalog(), /supported reference build/);
    for (const chapter of STEPS.slice(6)) await chapter.run(testElement("div"));
  }
  selectSource(vcfSource(), { ...header, meta: ["##reference=hg19"] });
  assert.equal(buildGuard(testElement("div")), true);
  assert.equal(refUrl("markers.json"), "/ref/GRCh37/markers.json");
});

test("unknown VCF builds still count records without assuming X chromosome boundaries", async () => {
  const source = vcfSource([["X", "3000000", ".", "A", "G", "60", "PASS", ".", "GT", "0/1"]]);
  const unknown = await scanStats(source, "unknown", () => {});
  assert.equal(unknown.records, 1);
  assert.equal(unknown.xnp, 0);
  const known = await scanStats(source, "GRCh38", () => {});
  assert.equal(known.xnp, 1);
});

test("a chosen build drives VCF chapters, statistics and catalogue paths without changing metadata", async () => {
  globalThis.document = testDocument();
  const source = vcfSource([], {
    text: `##fileformat=VCFv4.2\n#${header.columns.join("\t")}\nX\t2740000\t.\tA\tG\t60\tPASS\t.\tGT\t0/1\n`,
  });
  const opened = await vcfExperience.openSource(source);
  assert.equal(opened.build, "unknown");
  for (const selectedBuild of ["GRCh37", "GRCh38"] as const) {
    vcfExperience.select({ ...opened, selectedBuild }, "unknown.vcf.gz");
    assert.equal(detectBuild(ctx.header!.meta), "unknown");
    assert.equal(currentBuild(), selectedBuild);
    assert.equal(vcfExperience.describe().selectedBuild, selectedBuild);
    assert.equal(vcfExperience.describe().build, selectedBuild);
    assert.equal(buildGuard(testElement("div")), true);
    assert.equal(refUrl("markers.json"), `/ref/${selectedBuild}/markers.json`);
    await rowExamplesChapter.run(testElement("div"));
    assert.equal(rowPreviews.get(source)!.build, selectedBuild);
    const stats = await ensureStats();
    assert.equal(stats.rowExamples.build, selectedBuild);
    assert.equal(stats.rowExamples.matchable, 1);
    assert.equal(stats.xnp, selectedBuild === "GRCh37" ? 1 : 0);
    const out = testElement("div");
    await headerChapter.run(out);
    const html = out.children.map((child) => child.innerHTML).join("");
    assert.match(html, /Selected by you/);
    assert.match(html, /Not listed in the header/);
  }
  vcfExperience.select(opened, "unknown.vcf.gz");
  assert.equal(vcfExperience.describe().build, "unknown");
  assert.equal(vcfExperience.describe().selectedBuild, undefined);
  await rowExamplesChapter.run(testElement("div"));
  assert.equal(rowPreviews.get(source)!.build, "unknown");
  assert.equal((await ensureStats()).rowExamples.matchable, 0);
  assert.equal(buildGuard(testElement("div")), false);
  vcfExperience.clear();
  assert.equal(ctx.selectedBuild, undefined);
  assert.equal(ctx.stats, null);
  assert.equal(currentBuild(), "unknown");
});

test("selected VCF builds cannot replace recognized, conflicting or unsupported metadata", () => {
  globalThis.document = testDocument();
  const source = vcfSource();
  vcfExperience.select(
    { source, header: { ...header, meta: [] }, selectedBuild: "GRCh37" },
    "chosen.vcf.gz",
  );
  for (const meta of [
    ["##reference=hg19"],
    ["##reference=hg38"],
    ["##reference=hg19", "##reference=hg38"],
    ["##reference=NCBI36"],
    ["##reference=T2T-CHM13"],
  ]) {
    assert.throws(
      () =>
        vcfExperience.select(
          { source, header: { ...header, meta }, selectedBuild: "GRCh38" },
          "override.vcf.gz",
        ),
      /only be selected.*unknown/,
    );
    assert.equal(currentBuild(), "GRCh37");
  }
  vcfExperience.select({ source, header }, "detected.vcf.gz");
  assert.equal(currentBuild(), "GRCh38");
  assert.equal(ctx.selectedBuild, undefined);
  vcfExperience.clear();
});

test("header topic cards retain complete original lines beyond the overview excerpts", async () => {
  globalThis.document = testDocument();
  const suffix = "long original header text ".repeat(20) + "END_OF_ORIGINAL_LINE";
  const columns = [...header.columns.slice(0, 9), `SAMPLE_${"long_".repeat(30)}END`];
  const meta = [
    "##fileformat=VCFv4.2",
    `##reference=file:///reference/GRCh38/${"folder/".repeat(20)}genome.fa`,
    `##source=synthetic-pipeline ${suffix}`,
    "##fileDate=20260101",
    `##contig=<ID=1,length=248956422,Description="${suffix}">`,
    `##contig=<ID=2,length=242193529,Description="${suffix}">`,
    `##FORMAT=<ID=GT,Number=1,Type=String,Description="${suffix}">`,
    `##FILTER=<ID=PASS,Description="${suffix}">`,
    `##FILTER=<ID=LowQual,Description="${suffix}">`,
  ];
  const source = vcfSource([], { text: `${meta.join("\n")}\n#${columns.join("\t")}\n` });
  selectSource(source, { meta, columns });
  const out = testElement("div");
  try {
    await headerChapter.run(out);
    const details = new Map(out.children.map((child) => [child.id, child.innerHTML]));
    const escaped = (line: string) =>
      line.replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    for (const [id, lines] of [
      ["header-format", [meta[0]!]],
      ["header-file-type", [meta[0]!]],
      ["reference-build", [meta[1]!, meta[4]!, meta[5]!]],
      ["header-origin", [meta[2]!, meta[3]!]],
      ["header-genome-map", [meta[4]!, meta[5]!]],
      ["header-filters", [meta[7]!, meta[8]!]],
      ["header-sample", [`#${columns.join("\t")}`]],
    ] as const) {
      for (const line of lines)
        assert.ok(
          details.get(id)!.includes(escaped(line)),
          `${id} must retain its complete source line`,
        );
    }
    // The existing highlighted field example already contains the full definition.
    assert.ok(details.get("header-fields")!.includes(suffix));
    assert.equal((details.get("header-fields")!.match(/END_OF_ORIGINAL_LINE/g) || []).length, 1);
  } finally {
    vcfExperience.clear();
  }
});
