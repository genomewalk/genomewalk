import type { ChapterOptions } from "../../../shared/types.ts";
import { mockDocument, testElement } from "../../../../../tests/helpers/fixture.ts";
import { fixture as partialFixture } from "../../../../../tests/helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "fflate";
import results from "./results.ts";
import { ctx, selectSource } from "../context.ts";
import { testDocument } from "../../../../../tests/helpers/vcf.ts";

test("results forward file progress to the loader and reuse completed matches", async (t) => {
  const previousDocument = globalThis.document;
  const previousCatalog = ctx.catalog;
  globalThis.document = testDocument();
  t.after(() => {
    globalThis.document = previousDocument;
    selectSource(null);
    ctx.catalog = previousCatalog;
  });
  let reads = 0;
  let downloads = 0;
  const sourceHash = "1".repeat(64);
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    assert.equal(url, "/ref/consumer-dna/GRCh37/rsids.json.gz");
    downloads++;
    return new Response(
      gzipSync(
        new TextEncoder().encode(
          JSON.stringify({
            schema: 1,
            build: "GRCh37",
            sources: { catalog: { sha256: sourceHash } },
            catalog: {},
            markers: {},
            aliases: {},
          }),
        ),
      ),
    );
  });
  selectSource(
    partialFixture({
      build: "GRCh37",
      format: "consumer",
      label: "23andMe",
      header: {},
      capabilities: { matching: true },
      async readCalls(_each: unknown, progress: (fraction: number) => void) {
        reads++;
        progress(0.13);
        progress(1);
      },
    }),
  );
  ctx.catalog = partialFixture({
    build: "GRCh37",
    source: { sha256: sourceHash },
    async *rows(_signal: AbortSignal, progress: (fraction: number) => void) {
      progress(1);
      yield* [];
    },
  });
  const values: number[] = [];
  const options: ChapterOptions = { onProgress: (fraction) => values.push(fraction) };
  const out = testElement("div");
  await results.run(out, options);
  assert.deepEqual(values, [0, 0.2, 0.278, 0.8, 1]);
  assert.ok(out.children.every((child) => child.className !== "prog"));
  await results.run(testElement("div"), options);
  assert.equal(reads, 1);
  assert.equal(downloads, 1);
  assert.equal("lookup" in ctx.catalog!, false);
  assert.deepEqual(values, [0, 0.2, 0.278, 0.8, 1]);
});

test("results explain omitted sites and exclude them from all summary counts", async (t) => {
  const originalDocument = globalThis.document;
  const originalCatalog = ctx.catalog;
  globalThis.document = mockDocument();
  t.after(() => {
    globalThis.document = originalDocument;
    selectSource(null);
    ctx.catalog = originalCatalog;
  });
  selectSource(
    partialFixture({
      build: "GRCh37",
      format: "consumer",
      label: "23andMe",
      header: { columns: ["rsid", "chromosome", "position", "genotype"] },
      capabilities: { matching: true },
    }),
  );
  ctx.catalog = partialFixture({ build: "GRCh37" });
  ctx.matches = partialFixture([
    { chrom: "1", pos: 100, alt: "T", conflictingRecords: true },
    { chrom: "1", pos: 100, alt: "G", conflictingRecords: true },
  ]);
  const out = testElement("div");
  assert.equal(await results.run(out), true);
  const html = out.children.map((child) => child.innerHTML).join("\n");
  assert.match(html, /1 site was left out/);
  assert.equal([...html.matchAll(/class="tv">0</g)].length, 3);
  assert.match(html, /Rows and sites in chapter 3/);
  assert.match(html, /No unambiguous supported allele remains/);
  assert.ok(out.children.every((child) => child.className !== "mlist"));
  assert.equal(ctx.matches!.length, 2, "raw observations remain available for inspection");
});
