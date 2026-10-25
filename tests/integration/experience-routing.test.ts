import ts from "typescript";
import { fixture as partialFixture } from "../helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { gzipSync } from "node:zlib";
import { CHAPTER_COUNT, FILE_CHAPTERS, RESULTS_STEP } from "../../src/lib/navigation/journey.ts";
import { bgzfWrite } from "../../scripts/lib/util.ts";
const { default: vcf } = await import("../../src/experiences/vcf/index.ts");
const { acceptedFiles, getExperience, getGenomeSelection, openGenomeFile, selectGenome } =
  await import("../../src/experiences/index.ts");
const { describeSelection, restoreSelection } = await import("../../src/experiences/selection.ts");
const { optionalExperiences } = await import("../../src/experiences/optional.ts");
const text =
  "##fileformat=VCFv4.2\n##reference=GRCh38\n##contig=<ID=1,length=248956422>\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n1\t100\trs100\tC\tT\t100\tPASS\t.\tGT\t0/1\n";
function fixture(contents = text) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "genomewalk-routing-"));
  try {
    const file = path.join(directory, "test.bgz");
    bgzfWrite(contents, file);
    return new File([fs.readFileSync(file)], "synthetic.vcf.bgz");
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
}

test("VCF selection activates its engine and a fresh chapter session", async () => {
  const opened = await openGenomeFile(fixture());
  selectGenome(opened, "synthetic.vcf.bgz", "upload");
  assert.equal(getExperience(), vcf);
  assert.equal(vcf.context.source, opened.source);
  assert.equal(vcf.context.header, opened.header);
  assert.equal(vcf.context.source.bytesRead, 0);
  assert.equal(opened.build, "GRCh38");
  assert.equal(vcf.chapters.length, 9);
  assert.deepEqual(vcf.session.done, {});
});

test("file intake distinguishes unsupported formats, invalid VCF headers and missing samples", async () => {
  await assert.rejects(openGenomeFile(new File(["synthetic"], "synthetic.pdf")), {
    name: "AppError",
    code: "FILE_TYPE_UNSUPPORTED",
  });
  await assert.rejects(openGenomeFile(fixture("# unrelated file header\nsynthetic\n")), {
    name: "AppError",
    code: "VCF_HEADER_INVALID",
  });
  await assert.rejects(
    openGenomeFile(
      fixture("##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n"),
    ),
    {
      name: "AppError",
      code: "VCF_SAMPLE_MISSING",
    },
  );
});

test("standard gVCF suffixes use the streaming VCF reader and appear in the file picker", async () => {
  const contents = await fixture().arrayBuffer();
  for (const name of ["sample.gvcf.gz", "sample.gvcf.bgz", "sample.g.vcf.gz", "sample.GVCF.BGZ"]) {
    const opened = await openGenomeFile(new File([contents], name));
    assert.equal(opened.experience, vcf, name);
    assert.equal(opened.build, "GRCh38", name);
  }
  for (const extension of [".vcf.gz", ".vcf.bgz", ".gvcf.gz", ".gvcf.bgz", ".gz", ".bgz"])
    assert.ok(acceptedFiles.split(",").includes(extension), extension);
});

test("large ambiguous gzip and bgz files use the VCF reader with incremental header reads", async () => {
  const contents = await fixture().arrayBuffer();
  for (const name of ["whole-genome.gz", "whole-genome.bgz"]) {
    const reads: Array<[number, number]> = [];
    // A large logical file backed by a synthetic header proves opening stays
    // bounded without allocating or reading a real whole-genome file.
    class LargeFile extends File {
      override get size() {
        return 9 * 1024 ** 3;
      }
      override slice(start = 0, end = this.size, type?: string) {
        reads.push([start, end]);
        assert.equal(start, 0);
        assert.ok(end <= 65536);
        return super.slice(start, end, type);
      }
    }
    const opened = await openGenomeFile(new LargeFile([contents], name));
    assert.equal(opened.experience, vcf);
    assert.equal(opened.build, "GRCh38");
    assert.equal(reads.length, 2, "one bounded probe and one streaming header read");
  }
});

test("ordinary gzip VCF gets the BGZF remedy rather than a consumer header or size error", async () => {
  const contents = gzipSync(text);
  for (const name of ["whole-genome.gz", "whole-genome.bgz", "sample.gvcf.gz", "sample.vcf.gz"]) {
    await assert.rejects(openGenomeFile(new File([contents], name)), {
      code: "VCF_BGZF_REQUIRED",
      message: /bgzip/i,
    });
  }
});

test("compressed consumer DNA still selects its own reader after the bounded probe", async () => {
  if (!optionalExperiences.length) return;
  const contents = gzipSync(
    "# 23andMe\n# build 37; plus strand\n# rsid\tchromosome\tposition\tgenotype\nrs1\t1\t100\tCT\n",
  );
  const opened = await openGenomeFile(new File([contents], "synthetic.txt.gz"));
  assert.equal(opened.experience.id, "consumer");
  assert.equal(opened.build, "GRCh37");
});

test("empty files have a specific diagnostic before format routing", async () => {
  for (const name of ["empty.gvcf.gz", "empty.vcf.bgz", "empty.txt", "empty.zip"])
    await assert.rejects(openGenomeFile(new File([], name)), { code: "FILE_EMPTY" });
});

test("cancelling an ambiguous compressed file during the prefix read stops intake", async (t) => {
  const file = new File([await fixture().arrayBuffer()], "synthetic.gz");
  const controller = new AbortController();
  const slice = file.slice.bind(file);
  t.mock.method(file, "slice", (start?: number, end?: number, type?: string) => {
    controller.abort();
    return slice(start, end, type);
  });
  await assert.rejects(openGenomeFile(file, controller.signal), { name: "AbortError" });
});

test("switching experiences isolates every chapter, session and personal result", async () => {
  const consumer = optionalExperiences.find((x) => x.id === "consumer");
  if (!consumer) return;
  const file = new File(
    [
      "# This data file is generated by 23andMe.\n# reference assembly build 37; plus strand\n# rsid\tchromosome\tposition\tgenotype\nrs100\t1\t100\tCT\n",
    ],
    "synthetic.txt",
  );
  vcf.session.done[0] = true;
  vcf.context.matches = partialFixture([{ sentinel: "old" }]);
  const opened = await openGenomeFile(file);
  selectGenome(opened, file.name, "upload");
  assert.equal(getExperience(), consumer);
  assert.notEqual(consumer.context, vcf.context);
  assert.notEqual(consumer.session, vcf.session);
  assert.equal(vcf.context.source, null);
  assert.equal(vcf.context.matches, null);
  assert.deepEqual(
    consumer.chapters.map((x) => x.title),
    vcf.chapters.map((x) => x.title),
  );
  for (let i = 0; i < vcf.chapters.length; i++)
    assert.notEqual(consumer.chapters[i]!.run, vcf.chapters[i]!.run);
  consumer.session.done[2] = true;
  assert.ok("matches" in consumer.context);
  consumer.context.matches = [{ sentinel: "consumer" }];
  const next = await openGenomeFile(fixture());
  selectGenome(next, "new.vcf.bgz", "upload");
  assert.equal(getExperience(), vcf);
  assert.equal(consumer.context.source, null);
  assert.equal(consumer.context.matches, null);
  assert.deepEqual(vcf.session.done, {});
  assert.equal(vcf.context.matches, null);
});

test("removing the optional registration leaves VCF intake operational", async () => {
  const saved = optionalExperiences.splice(0);
  try {
    await assert.rejects(openGenomeFile(new File(["DNA"], "consumer.txt")), /Supported files/);
    const opened = await openGenomeFile(fixture());
    assert.equal(opened.experience, vcf);
  } finally {
    optionalExperiences.push(...saved);
  }
});

test("a stale filename cannot make the picker claim a genome is ready", async () => {
  const opened = await openGenomeFile(fixture());
  selectGenome(opened, "synthetic.vcf.bgz", "upload");
  assert.equal(getGenomeSelection()!.name, "synthetic.vcf.bgz");
  vcf.context.source = null;
  assert.equal(vcf.session.fileName, "synthetic.vcf.bgz");
  assert.equal(getGenomeSelection(), null);
  vcf.clear();
});

test("development refresh restores the file handle and header without stale lesson results", async () => {
  const opened = await openGenomeFile(fixture());
  selectGenome(opened, "synthetic.vcf.bgz", "upload");
  vcf.session.done[0] = true;
  vcf.session.outputs[0] = partialFixture({ old: true });
  vcf.context.matches = partialFixture([{ old: true }]);
  const saved = getGenomeSelection();
  vcf.clear();
  assert.equal(restoreSelection([vcf], saved), vcf);
  assert.equal(vcf.context.source, opened.source);
  assert.equal(vcf.context.header, opened.header);
  assert.equal(getGenomeSelection()!.info.build, "GRCh38");
  assert.deepEqual(vcf.session.done, {});
  assert.deepEqual(vcf.session.outputs, {});
  assert.equal(vcf.context.matches, null);
  assert.equal(restoreSelection([], saved), null);
  assert.equal(restoreSelection([vcf], partialFixture({ name: saved!.name })), null);
});

test("manual build selection survives development refresh and clears with the next file", async () => {
  const unknownVcf = fixture(text.replace(/##(?:reference|contig)=[^\n]*\n/g, ""));
  const unknownConsumer = new File(
    ["# 23andMe\n# plus strand\n# rsid\tchromosome\tposition\tgenotype\nrs1\t1\t100\tCT\n"],
    "unknown.txt",
  );
  for (const file of optionalExperiences.length ? [unknownVcf, unknownConsumer] : [unknownVcf]) {
    const opened = await openGenomeFile(file);
    assert.equal(opened.build, "unknown");
    selectGenome({ ...opened, selectedBuild: "GRCh37" }, file.name, "upload");
    const saved = getGenomeSelection();
    assert.equal(saved!.info.build, "GRCh37");
    assert.equal(saved!.info.selectedBuild, "GRCh37");
    opened.experience.clear();
    assert.equal(restoreSelection([opened.experience], saved), opened.experience);
    assert.equal(getGenomeSelection()!.info.selectedBuild, "GRCh37");
    const next = await openGenomeFile(file);
    selectGenome(next, file.name, "upload");
    assert.equal(getGenomeSelection()!.info.build, "unknown");
    assert.equal(getGenomeSelection()!.info.selectedBuild, undefined);
  }
});

test("an aborted header read never produces a selectable genome", async () => {
  const before = getGenomeSelection();
  const controller = new AbortController();
  const original = vcf.open;
  let finish!: () => void, started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  try {
    vcf.open = async () => {
      started();
      await pending;
      return partialFixture<Awaited<ReturnType<typeof original>>>({
        source: before!.source,
        header: before!.header,
        build: "GRCh38",
      });
    };
    const reading = openGenomeFile(fixture(), controller.signal);
    await waiting;
    controller.abort();
    finish();
    await assert.rejects(reading, { name: "AbortError" });
    assert.equal(getGenomeSelection()!.source, before!.source);
  } finally {
    vcf.open = original;
  }
});

test("dependency refresh retains both provider selections without requiring a dispose callback", async () => {
  const code = fs
    .readFileSync(new URL("../../src/experiences/index.ts", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "")
    .replace(/^export /gm, "")
    .replaceAll("import.meta.hot", "hot");
  const hot: { data: Record<string, import("../../src/experiences/types.ts").SavedSelection> } = {
    data: {},
  };
  const refresh = () =>
    vm.runInNewContext(
      ts.transpileModule(`${code}\n({ selectGenome, getGenomeSelection, getExperience })`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
      }).outputText,
      {
        vcf,
        optionalExperiences,
        describeSelection,
        restoreSelection,
        hot,
      },
    );
  const consumer = new File(
    [
      "# 23andMe\n# build 37; plus strand\n# rsid\tchromosome\tposition\tgenotype\nrs1\t1\t100\tCT\n",
    ],
    "synthetic.txt",
  );
  let registry = refresh();
  for (const file of optionalExperiences.length ? [fixture(), consumer, fixture()] : [fixture()]) {
    const opened = await openGenomeFile(file);
    registry.selectGenome(opened, file.name, "upload");
    assert.equal(hot.data["selection"]!.source, opened.source);
    opened.experience.clear();
    registry = refresh();
    assert.equal(registry.getExperience(), opened.experience);
    assert.equal(registry.getGenomeSelection().source, opened.source);
    assert.equal(registry.getGenomeSelection().name, file.name);
  }
});

test("both experiences place the new row-types chapter before counts and retain the results destination", () => {
  for (const experience of [vcf, ...optionalExperiences]) {
    assert.equal(experience.chapters.length, CHAPTER_COUNT);
    assert.equal(experience.chapters[1]!.title, "Lets learn to read a variant line");
    assert.equal(experience.chapters[2]!.title, "A closer look at different types of variants");
    assert.equal(experience.chapters[3]!.title, "Count everything (one full pass)");
    assert.equal(experience.chapters[FILE_CHAPTERS]!.title, "Where would meaning come from?");
    assert.equal(experience.chapters[RESULTS_STEP]!.title, "Your results");
  }
});
