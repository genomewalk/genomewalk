import { testElement } from "../helpers/fixture.ts";
import { fixture as partialFixture } from "../helpers/fixture.ts";
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { STEPS, ctx } from "../../src/experiences/vcf/engine/learn.ts";
import { ensureStats, rowPreviews } from "../../src/experiences/vcf/engine/runtime.ts";
import {
  meaningIntroduction,
  meaningChapterHtml,
} from "../../src/experiences/shared/meaning-chapter.ts";
import { vcfSource, header, testDocument } from "../helpers/vcf.ts";

const row = (
  chrom: string,
  pos: number,
  ref: string,
  alt: string,
  gt: string,
  dp: number,
  filter = "PASS",
  info = ".",
) => [chrom, String(pos), `rs${pos}`, ref, alt, "100", filter, info, "GT:DP", `${gt}:${dp}`];
const records = [
  row("1", 100, "A", "G", "0/1", 20),
  row("1", 200, "C", "A", "1/1", 30),
  row("1", 300, "A", "AT", "0/1", 10),
  row("1", 400, "G", "T", "0/1", 20, "LowQual"),
  row("1", 500, "A", ".", "0/0", 20, "PASS", "END=509"),
  row("X", 3000000, "A", "G", "0/1", 40),
  row("X", 1000, "A", "C", "1/1", 50),
  row("Y", 5000, "C", "T", "1", 12),
];
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  globalThis.document = testDocument();
  Object.assign(ctx, {
    source: vcfSource(records),
    header,
    stats: null,
    matches: null,
    markerHits: null,
    markers: null,
    build: null,
  });
});

test("the shared catalogue introduction runs before any genome scan or catalogue download", async () => {
  const out = testElement("div");
  for (const [key, value] of Object.entries(meaningIntroduction))
    assert.equal(STEPS[5]![key as "title" | "blurb" | "why"], value);
  await STEPS[5]!.run(out);
  assert.equal(out.children.length, 1);
  assert.equal(out.children[0]!.className, "meaning-chapter");
  assert.equal(out.children[0]!.innerHTML, meaningChapterHtml({ format: "vcf", build: "GRCh38" }));
  assert.equal((ctx.source as ReturnType<typeof vcfSource>).reads, 0);
  assert.equal(ctx.stats, null);
  assert.equal(ctx.matches, null);
});

test("the gnomAD lesson uses catalogue entries without scanning VCF calls or publishing personal findings", async () => {
  ctx.markers = JSON.parse(
    partialFixture(
      fs.readFileSync(new URL("../../public/ref/GRCh38/markers.json", import.meta.url)),
    ),
  );
  const out = testElement("div");
  await STEPS[6]!.run(out);
  const html = out.children.map((child) => child.innerHTML).join("\n");
  assert.equal(out.children.filter((child) => child.className === "kvx").length, 5);
  assert.match(html, /12:111803962:G:A/);
  assert.match(html, /From the gnomAD catalog/);
  assert.match(html, /If you carried <b class="o1">A<\/b>/);
  assert.match(html, /How common <span class="o1">A<\/span> is, per population/);
  assert.doesNotMatch(
    html,
    /variant is absent|you have <b>|Your reported alleles|from your mother|From the file|made-up line/,
  );
  assert.equal((ctx.source as ReturnType<typeof vcfSource>).reads, 0);
  assert.equal(ctx.markerHits, null);
  assert.equal(ctx.stats, null);
  assert.equal(ctx.matches, null);
});

test("a skipped-ahead chapter can prepare and reuse the same full-file counts", async () => {
  ctx.header = null; // Exercise real header reading as well as the real BGZF data stream.
  const stats = await ensureStats();
  for (const [key, expected] of Object.entries({
    records: 8,
    variants: 6,
    failed: 1,
    homref: 1,
    homrefBases: 10,
    snps: 5,
    indels: 1,
    ti: 3,
    tv: 2,
    het: 3,
    hom: 2,
    dpSum: 162,
    dpN: 6,
    xnp: 1,
    xhet: 1,
    y: 1,
  }))
    assert.equal(stats[key as keyof typeof stats], expected, key);
  const reads = (ctx.source as ReturnType<typeof vcfSource>).reads;
  assert.equal(await ensureStats(), stats);
  assert.equal((ctx.source as ReturnType<typeof vcfSource>).reads, reads);
});

test("overlapping chapter runs share their pending counting pass", async () => {
  const gate = deferred();
  ctx.source = vcfSource(records, { beforeRead: () => gate.promise });
  const first = ensureStats(),
    second = ensureStats();
  gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  assert.equal((ctx.source as ReturnType<typeof vcfSource>).reads, 1);
});

test("the summary and results chapters report progress when opened before any counts", async (t) => {
  const previousCatalog = ctx.catalog;
  t.after(() => {
    ctx.catalog = previousCatalog;
  });
  for (const index of [4, 8]) {
    ctx.source = vcfSource(records);
    ctx.stats = null;
    ctx.matches = null;
    ctx.catalog = partialFixture({
      build: "GRCh38",
      chromosomes: ["1", "X", "Y"],
      async *rows() {},
    });
    const percentages: number[] = [];
    const out = testElement("div");
    await STEPS[index]!.run(out, {
      onProgress: (fraction) => percentages.push(fraction),
    });
    assert.equal(percentages[0], 0);
    assert.equal(percentages.at(-1), 1);
    assert.ok(out.children.every((child) => child.className !== "prog"));
    // The fixture reverses two X positions; results retry through the unsorted compatibility path.
    assert.equal((ctx.source as ReturnType<typeof vcfSource>).reads, index === 8 ? 2 : 1);
  }
});

test("a previous file cannot publish counts into a replacement file session", async () => {
  const gate = deferred(),
    started = deferred();
  ctx.source = vcfSource(records, {
    beforeRead: () => {
      started.resolve();
      return gate.promise;
    },
  });
  const scan = ensureStats();
  await started.promise;
  ctx.source = vcfSource();
  gate.resolve();
  await assert.rejects(scan, { name: "AbortError" });
  assert.equal(ctx.stats, null);
});

test("a failed counting pass can be retried", async () => {
  ctx.source = vcfSource(records, {
    beforeRead: (reads) => {
      if (reads === 1) throw new Error("read failed");
    },
  });
  await assert.rejects(ensureStats(), /read failed/);
  assert.equal((await ensureStats()).variants, 6);
  assert.equal((ctx.source as ReturnType<typeof vcfSource>).reads, 2);
});

test("VCF count boxes report loader progress and disappear after the scan", async () => {
  const gate = deferred(),
    started = deferred();
  ctx.source = vcfSource(records, {
    beforeRead: () => {
      started.resolve();
      return gate.promise;
    },
  });
  const out = testElement("div");
  const percentages: number[] = [];
  const run = STEPS[3]!.run(out, { onProgress: (fraction) => percentages.push(fraction) });
  await started.promise;
  assert.deepEqual(percentages, [0]);
  assert.deepEqual(
    out.children[0]!.children.map((child) => child.className),
    ["tiles"],
  );
  gate.resolve();
  await run;
  assert.equal(percentages.at(-1), 1);
  assert.ok(out.children.length > 0);
  assert.ok(out.children.every((child) => child.tagName === "details"));
  const story = out.children.map((child) => child.innerHTML).join("\n");
  for (const label of [
    "Variants (PASS)",
    "SNPs / Indels",
    "Ts/Tv",
    "Het / Hom",
    "Mean depth",
    "Have an rsID",
    "Hom-ref blocks",
    "Read",
  ])
    assert.ok(story.includes(label), `${label} is retained`);
  assert.doesNotMatch(story, /row-map|<details open|undefined|NaN/);
});

test("the row-types chapter samples real rows without preparing full-file counts", async () => {
  ctx.source = vcfSource(
    Array.from({ length: 50001 }, (_, i) => row("1", i + 1, "A", "G", "0/1", 20)),
  );
  const out = testElement("div");
  await STEPS[2]!.run(out);
  assert.equal(rowPreviews.get(ctx.source)!.records, 50000);
  assert.equal(ctx.stats, null);
  assert.equal(out.children[0]!.className, "vcf-row-overview");
  const overview = out.children[0]!.innerHTML,
    story = out.children[1]!.innerHTML;
  assert.match(overview, /Rows side by side/);
  assert.match(overview, /first 50,000 rows read/);
  assert.doesNotMatch(overview, /row-map-totals|Whole file/);
  for (const [, target] of overview.matchAll(/href="#(vcf-count-[^"]+)"/g))
    assert.equal(story.split(`id="${target}"`).length - 1, 1);
  const reads = (ctx.source as ReturnType<typeof vcfSource>).reads;
  await STEPS[2]!.run(testElement("div"));
  assert.equal(
    (ctx.source as ReturnType<typeof vcfSource>).reads,
    reads,
    "revisiting reuses the preview",
  );
  assert.equal((await ensureStats()).records, 50001, "counting still reads the entire file");
});
