import { fixture as partialFixture } from "../../tests/helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { paths, DATASETS, ROOT } from "../lib/config.ts";
import { markerTarget } from "../lib/markers.ts";
import { hasStudyEvidence } from "../lib/reference/study-evidence.ts";
import { buildPlan } from "../lib/plan.ts";
import { bgzfWrite } from "../lib/util.ts";
import { CATALOG_HEADER, catalogFields, parseClinvar } from "../lib/clinvar.ts";
import { PUBMED_SUMMARIES } from "../lib/reference/publication-metadata.ts";
import { buildConsumerIndex, checkConsumerIndex, indexPath, resolveAliases } from "./index.ts";

function fixture(t: test.TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-rsid-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = paths({ "data-dir": path.join(dir, "data"), "out-dir": path.join(dir, "ref") });
  fs.mkdirSync(files.data);
  const row = (pos: number, alt: string, rs: string) =>
    catalogFields(
      partialFixture(
        parseClinvar(
          `1\t${pos}\t123\tC\t${alt}\t.\t.\tCLNSIG=Pathogenic;RS=${rs};ALLELEID=456;CLNDN=Test;CLNDISDB=MedGen:C001`,
        ),
      ),
      { releaseDate: "20260918" },
    ).join("\t");
  for (const build of ["GRCh37", "GRCh38"]) {
    bgzfWrite(
      CATALOG_HEADER +
        "\n" +
        [
          row(100, "T", "123|456"),
          row(100, "G", "123"),
          row(200, "T", "123"),
          row(300, "TT", "789"),
        ].join("\n") +
        "\n",
      files.catalog(build),
    );
    fs.writeFileSync(
      files.markers(build),
      JSON.stringify({
        build,
        dataset: "test",
        markers: [{ rs: "rs123", chrom: "1", pos: 100, ref: "C", alt: "T" }],
      }),
    );
  }
  return files;
}

test("consumer stage follows both catalogue/marker builds and respects --only/removal", () => {
  for (const only of [undefined, "GRCh37", "GRCh38"]) {
    const plan = buildPlan({ only, frequenciesExist: true });
    const index = plan.findIndex((step) => step.script === "build-consumer.ts");
    assert.ok(index > plan.findLastIndex((step) => step.script === "build-marker-freqs.ts"));
    assert.deepEqual(plan[index]!.args, only ? ["--only", only] : []);
    assert.equal(plan[index + 1]!.script, "check-reference-data.ts");
  }
  assert.ok(!buildPlan({ consumer: false }).some((step) => step.script === "build-consumer.ts"));
});

test("sidecars retain all candidate alleles/loci and leave both original indexes intact", async (t) => {
  const files = fixture(t);
  const originals = [
    files.catalog("GRCh37"),
    files.markers("GRCh37"),
    files.catalog("GRCh38"),
    files.markers("GRCh38"),
  ].map((file) => [file, fs.readFileSync(file)]);
  const index = await buildConsumerIndex({ paths: files, build: "GRCh37" });
  assert.deepEqual(index.catalog["rs123"], ["1:100:C:T", "1:100:C:G", "1:200:C:T"]);
  assert.deepEqual(index.catalog["rs456"], ["1:100:C:T"]);
  assert.equal(index.catalog["rs789"], undefined);
  assert.deepEqual(index.markers["rs123"], ["1:100:C:T"]);
  assert.equal(index.sources.aliases, null);
  assert.deepEqual(index.aliases, {});
  await checkConsumerIndex({ paths: files, build: "GRCh37" });
  for (const [file, bytes] of originals) assert.deepEqual(fs.readFileSync(file!), bytes);
  assert.ok(!fs.existsSync(indexPath(files, "GRCh38")));
});

test("verified merge chains resolve only to indexed records and reject cycles/conflicts", () => {
  const input = {
    source: "https://example.org/public-merge-map",
    release: "test",
    aliases: { rs1: "rs2", rs2: "rs3", rs4: "rs5" },
  };
  assert.deepEqual(resolveAliases(input, new Set(["rs3"])), { rs1: "rs3", rs2: "rs3" });
  assert.throws(
    () => resolveAliases({ ...input, aliases: { rs1: "rs2", rs2: "rs1" } }, new Set()),
    /Cycle/,
  );
  assert.throws(() => resolveAliases(input, new Set(["rs1", "rs3"])), /direct ID/);
  assert.throws(() => resolveAliases(partialFixture({ aliases: {} }), new Set()), /source/);
});

test("alias provenance is recorded and invalid rebuilds preserve the previous sidecar", async (t) => {
  const files = fixture(t),
    options = { paths: files, build: "GRCh37" };
  const aliasFile = path.join(files.data, "consumer-rsid-aliases.json");
  fs.writeFileSync(
    aliasFile,
    JSON.stringify({
      source: "https://example.org/verified",
      release: "fixture",
      aliases: { rs9: "rs123" },
    }),
  );
  const index = await buildConsumerIndex(options);
  assert.equal(index.aliases["rs9"], "rs123");
  assert.equal(index.sources.aliases!.release, "fixture");
  const previous = fs.readFileSync(indexPath(files, "GRCh37"));
  fs.writeFileSync(aliasFile, "{}");
  await assert.rejects(buildConsumerIndex(options), /Alias input/);
  assert.deepEqual(fs.readFileSync(indexPath(files, "GRCh37")), previous);
});

test("validation rejects stale source releases and changed candidate mappings", async (t) => {
  const files = fixture(t),
    options = { paths: files, build: "GRCh37" };
  await buildConsumerIndex(options);
  fs.appendFileSync(files.markers("GRCh37"), "\n");
  await assert.rejects(checkConsumerIndex(options), /stale/);
});

test("data:rebuild creates every index through the real CLI using cached synthetic inputs", (t) => {
  const files = fixture(t);
  for (const build of ["GRCh37", "GRCh38"])
    bgzfWrite(
      "##fileDate=20260918\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n1\t100\t123\tC\tT\t.\t.\tCLNSIG=Pathogenic;RS=123;ALLELEID=456;CLNDN=Test;CLNDISDB=MedGen:C001\n",
      files.clinvar(build),
    );
  fs.writeFileSync(
    files.frequencies,
    "#chrom\tpos\tref\talt\taf\tgrp\tafmax\tan\n1\t100\tC\tT\t0.01\tafr\t0.02\t100\n",
  );
  fs.writeFileSync(
    files.citations,
    "#ClinVar germline citations v1\t2026-09-18\n#VariationID\tPMIDs\n123\t19320537\n#Complete\t1\n",
  );
  fs.writeFileSync(
    path.join(files.data, "publications.json.gz"),
    gzipSync(
      JSON.stringify({
        schema: 1,
        source: PUBMED_SUMMARIES,
        entries: {
          "19320537": {
            label: "Brooks et al., PLoS Medicine 2009",
            fetchedAt: "2026-01-01T00:00:00Z",
          },
        },
      }),
    ),
  );
  fs.mkdirSync(path.join(files.data, "markers"));
  for (const marker of JSON.parse(fs.readFileSync(files.markerBase, "utf8")).filter(
    hasStudyEvidence,
  )) {
    for (const build of ["GRCh37", "GRCh38"]) {
      const target = markerTarget(marker, build),
        [, , ref, alt] = target.variant.split("-");
      fs.writeFileSync(
        path.join(files.data, "markers", `${build}-${marker.rs}.json`),
        JSON.stringify({
          dataset: DATASETS[build],
          variant: {
            variant_id: target.variant,
            ref,
            alt,
            genome: { ac: 1, an: 100, populations: [] },
          },
        }),
      );
    }
  }
  const result = spawnSync(
    "npm",
    ["run", "data:rebuild", "--", "--data-dir", files.data, "--out-dir", files.output],
    { cwd: ROOT, encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.doesNotMatch(result.stdout, /Downloading/);
  for (const build of ["GRCh37", "GRCh38"]) assert.ok(fs.existsSync(indexPath(files, build)));
  const publications = JSON.parse(
    fs.readFileSync(path.join(files.output, "publications/index.json"), "utf8"),
  );
  assert.equal(publications.count, 1);
  assert.equal(publications.labeled, 1);
  assert.match(result.stdout, /Reference build complete/);
});
