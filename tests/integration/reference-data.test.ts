import { fixture as partialFixture } from "../helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { paths } from "../../scripts/lib/config.ts";
import { parseOptions, string, boolean } from "../../scripts/lib/cli.ts";
import { buildPlan } from "../../scripts/lib/plan.ts";
import {
  atomicWriter,
  bgzfWrite,
  bgzfWriter,
  readLines,
  download,
} from "../../scripts/lib/util.ts";
import {
  parseClinvar,
  catalogFields,
  CATALOG_HEADER,
  FREQUENCY_HEADER,
} from "../../scripts/lib/clinvar.ts";
import { buildCatalog } from "../../scripts/lib/catalog.ts";
import { clusterTargets, collectFrequencies } from "../../scripts/lib/frequencies.ts";
import { markerOutput, buildMarkers } from "../../scripts/lib/markers.ts";
import { validateCatalogRow, checkReference } from "../../scripts/lib/validate.ts";

function temporary(t: test.TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "genomewalk-build-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const vcfRow = (pos: number, sig: string, extra = "", alt = "T") =>
  `1\t${pos}\t123\tC\t${alt}\t.\t.\tCLNSIG=${sig};ALLELEID=456;CLNREVSTAT=criteria_provided,_single_submitter;GENEINFO=GENE:1;CLNDN=First_condition|Second_condition;CLNDISDB=MedGen:C001|MedGen:C002${extra}`;
const variant = {
  key: "1:10:C:T",
  af: "0",
  grp: ".",
  afmax: ".",
  ac: 0,
  an: 100,
  filter: "PASS",
  discordanceP: ".",
  pops: { afr: 0 },
};
const marker = {
  rs: "rs123",
  cat: "trait",
  gene: "GENE",
  title: "Synthetic example",
  read: ["zero", "one", "two"],
  cite: { label: "Synthetic citation", url: "https://example.org/study" },
  targets: { GRCh38: { variant: "1-10-C-T", effectAllele: "T" } },
};
async function lines(file: fs.PathLike) {
  return Array.fromAsync(readLines(file));
}
function fixture(t: test.TestContext) {
  const directory = temporary(t),
    files = paths({
      "data-dir": path.join(directory, "data"),
      "out-dir": path.join(directory, "ref"),
    });
  fs.mkdirSync(files.data);
  fs.writeFileSync(
    files.citations,
    "#ClinVar germline citations v1\t2026-09-18\n#VariationID\tPMIDs\n123\t111,222\n#Complete\t1\n",
  );
  fs.writeFileSync(
    files.frequencies,
    FREQUENCY_HEADER + "\n1\t10\tC\tT\t0\tafr\t0\t100\t0\tPASS\t.\n",
  );
  for (const build of ["GRCh38", "GRCh37"])
    bgzfWrite(
      "##fileDate=20260918\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n" +
        vcfRow(build === "GRCh38" ? 10 : 20, "Pathogenic") +
        "\n" +
        vcfRow(30, "Benign") +
        "\n",
      files.clinvar(build),
    );
  files.markerBase = path.join(directory, "markers.base.json");
  fs.writeFileSync(files.markerBase, JSON.stringify([marker]));
  return files;
}

test("CLI rejects unknown, missing and invalid values before executing a step", () => {
  const schema = { only: string, build: string, jobs: string, chrom: string, fresh: boolean };
  for (const args of [
    ["--typo"],
    ["--build"],
    ["--only", "GRCh36"],
    ["--chrom", "0"],
    ["--jobs", "0"],
    ["--jobs", "1.5"],
    ["extra"],
  ])
    assert.throws(() => parseOptions(schema, args));
  assert.equal(parseOptions(schema, ["--build", "GRCh37"]).build, "GRCh37");
});

test("GRCh37-only plan creates its prerequisite join without replacing GRCh38 output", () => {
  const plan = buildPlan({ only: "GRCh37", frequenciesExist: true });
  assert.ok(!plan.some((step) => step.script === "build-freqs.ts"));
  assert.deepEqual(plan.find((step) => step.script === "build-catalog.ts")!.args, [
    "--build",
    "GRCh38",
    "--join-only",
  ]);
  assert.equal(plan.filter((step) => step.script === "build-marker-freqs.ts").length, 1);
  const fresh = buildPlan({ fresh: true, frequenciesExist: true });
  assert.ok(fresh.some((step) => step.script === "build-freqs.ts"));
  assert.ok(
    fresh
      .filter((step) => /download|marker/.test(step.script))
      .every((step) => step.args.includes("--fresh")),
  );
});

test("dry run and help perform no writes even with missing input directories", (t) => {
  const directory = temporary(t),
    data = path.join(directory, "absent"),
    out = path.join(directory, "also absent");
  const result = spawnSync(
    process.execPath,
    ["scripts/build-all.ts", "--dry-run", "--only", "GRCh37", "--data-dir", data, "--out-dir", out],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--join-only/);
  assert.ok(!fs.existsSync(data) && !fs.existsSync(out));
  for (const script of [
    "build-all",
    "build-catalog",
    "build-freqs",
    "build-marker-freqs",
    "download-inputs",
    "download-citations",
    "check-reference-data",
  ]) {
    const help = spawnSync(process.execPath, [`scripts/${script}.ts`, "--help"], {
      encoding: "utf8",
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Options:/);
  }
});

test("streaming BGZF round trips chunk boundaries, UTF-8 and empty EOF", async (t) => {
  const directory = temporary(t),
    file = path.join(directory, "output.bgz");
  const writer = bgzfWriter(file);
  const records = ["A".repeat(65279) + "é", "C".repeat(100_000), "last"];
  for (const line of records) writer.write(line + "\r\n");
  writer.commit();
  assert.deepEqual(await lines(file), records);
  bgzfWrite("", file);
  assert.deepEqual(await lines(file), []);
});

test("offline BGZF reads reject corrupted checksums, oversized blocks and truncated input", async (t) => {
  const file = path.join(temporary(t), "invalid.bgz");
  bgzfWrite("synthetic\n", file);
  const bytes = fs.readFileSync(file);
  const blockSize = bytes.readUInt16LE(16) + 1;

  const corrupted = Buffer.from(bytes);
  corrupted[blockSize - 8]! ^= 1;
  fs.writeFileSync(file, corrupted);
  await assert.rejects(lines(file), /integrity check/);

  const oversized = Buffer.from(bytes);
  oversized.writeUInt32LE(65537, blockSize - 4);
  fs.writeFileSync(file, oversized);
  await assert.rejects(lines(file), /maximum decoded size/);

  fs.writeFileSync(file, bytes.subarray(0, blockSize - 1));
  await assert.rejects(lines(file), /truncated/);
});

test("aborted output leaves the previous artifact and removes partial files", (t) => {
  const directory = temporary(t),
    file = path.join(directory, "output");
  fs.writeFileSync(file, "previous");
  for (const create of [atomicWriter, bgzfWriter]) {
    const writer = create(file);
    writer.write("unfinished");
    writer.abort();
    assert.equal(fs.readFileSync(file, "utf8"), "previous");
    assert.deepEqual(fs.readdirSync(directory), ["output"]);
  }
});

test("download refresh failures preserve cached data and response headers", async (t) => {
  const directory = temporary(t),
    file = path.join(directory, "input"),
    headers = file + ".headers";
  fs.writeFileSync(file, "old");
  fs.writeFileSync(headers, "old headers");
  await assert.rejects(
    download("https://example.org/reference", file, {
      fresh: true,
      headersFile: headers,
      fetcher: async () => new Response("broken", { status: 503 }),
    }),
    /HTTP 503/,
  );
  assert.equal(fs.readFileSync(file, "utf8"), "old");
  assert.equal(fs.readFileSync(headers, "utf8"), "old headers");
  await download("https://example.org/reference", file, {
    fresh: true,
    headersFile: headers,
    fetcher: async () =>
      new Response("complete", { headers: { "last-modified": "Fri, 18 Sep 2026 00:00:00 GMT" } }),
  });
  assert.equal(fs.readFileSync(file, "utf8"), "complete");
  assert.match(fs.readFileSync(headers, "utf8"), /last-modified:/);
  assert.equal(fs.readdirSync(directory).length, 2);
});

test("frequency targets use the same selected classifications as the catalogue", () => {
  assert.equal(parseClinvar(vcfRow(10, "Benign", ";OTHER=pathogenic")), null);
  assert.equal(parseClinvar(vcfRow(10, "Uncertain_significance")), null);
  for (const sig of [
    "Pathogenic",
    "Likely_pathogenic",
    "Conflicting_classifications_of_pathogenicity",
    "drug_response",
    "Affects",
    "risk_factor",
  ])
    assert.ok(parseClinvar(vcfRow(10, sig)));
  assert.equal(parseClinvar(vcfRow(10, "Pathogenic", "", "T,G")), null);
});

test("catalogue fields retain zero frequency, independent dates, citations and condition links", () => {
  const fields = catalogFields(partialFixture(parseClinvar(vcfRow(10, "Pathogenic"))), {
    frequency: ["0", "afr", "0", "100", "0", "PASS", "."],
    frequencyKey: "1-10-C-T",
    pmids: new Set(["111", "222"]),
    releaseDate: "20260918",
    citationDate: "2026-09-18",
  });
  assert.equal(fields[8], "0");
  assert.equal(fields[18], "111,222");
  assert.equal(fields[19], "20260918");
  assert.equal(fields[20], "2026-09-18");
  assert.equal(fields[7], "First condition|Second condition");
  assert.equal(fields[23], "C001|C002");
  assert.equal(validateCatalogRow(fields.join("\t")).length, 27);
});

test("offline catalogue builds join GRCh37 by allele ID and preserve its GRCh38 source link", async (t) => {
  const files = fixture(t);
  await buildCatalog({ paths: files, build: "GRCh38" });
  await buildCatalog({ paths: files, build: "GRCh37" });
  const rows = await lines(files.catalog("GRCh37"));
  assert.equal(rows[0], CATALOG_HEADER);
  assert.equal(rows.length, 2);
  const fields = validateCatalogRow(rows[1]!);
  assert.equal(fields[1], "20");
  assert.equal(fields[8], "0");
  assert.equal(fields[18], "111,222");
  assert.equal(fields[22], "1-10-C-T");
  const old = fs.readFileSync(files.catalog("GRCh38"));
  await buildCatalog({ paths: files, build: "GRCh38", "join-only": true });
  assert.deepEqual(fs.readFileSync(files.catalog("GRCh38")), old);
});

test("malformed ClinVar never replaces a previously built catalogue or allele join", async (t) => {
  const files = fixture(t);
  await buildCatalog({ paths: files });
  const catalog = fs.readFileSync(files.catalog("GRCh38")),
    allele = fs.readFileSync(files.alleleFrequencies);
  bgzfWrite(vcfRow(10, "Pathogenic") + "\nmalformed\n", files.clinvar("GRCh38"));
  await assert.rejects(buildCatalog({ paths: files }), /Malformed/);
  assert.deepEqual(fs.readFileSync(files.catalog("GRCh38")), catalog);
  assert.deepEqual(fs.readFileSync(files.alleleFrequencies), allele);
});

test("region grouping handles unordered targets and clamps chromosome starts", () => {
  const regions = clusterTargets(
    partialFixture(
      new Map([
        [
          "1",
          [
            { pos: 40000, ref: "C", alt: "T" },
            { pos: 1, ref: "G", alt: "A" },
            { pos: 2, ref: "C", alt: "T" },
          ],
        ],
      ]),
    ),
  );
  assert.equal(regions.length, 2);
  assert.equal(regions[0]!.start, 0);
  assert.deepEqual([...regions[0]!.keys], ["1:G:A", "2:C:T"]);
});

test("failed joint extraction rejects and duplicate records are never silently selected", async () => {
  const regions = [{ chrom: "1", start: 0, end: 20, keys: new Set(["10:C:T"]) }];
  await assert.rejects(
    collectFrequencies(regions, {
      makeExtractor: () => async () => {
        throw new Error("fetch failed");
      },
    }),
    /fetch failed/,
  );
  await assert.rejects(
    collectFrequencies(regions, { makeExtractor: () => async () => [variant, variant] }),
    /Duplicate/,
  );
  const rows = await collectFrequencies(regions, { makeExtractor: () => async () => [variant] });
  assert.equal(rows.get("1:10:C:T")!.af, "0");
});

test("marker building requires exact IDs and valid counts rather than guessing an rsID alternative", () => {
  assert.equal(markerOutput(marker, "GRCh38", variant).af, 0);
  assert.throws(() => markerOutput(marker, "GRCh37", variant), /verified/);
  assert.throws(() => markerOutput(marker, "GRCh38", { ...variant, key: "1:10:C:G" }), /different/);
  assert.throws(() => markerOutput(marker, "GRCh38", { ...variant, ac: 101, an: 100 }), /counts/);
});

test("marker refresh and cached rebuild keep original evidence; validator detects corrupted fields", async (t) => {
  const files = fixture(t);
  await buildCatalog({ paths: files });
  let requests = 0;
  await buildMarkers(
    { paths: files },
    {
      extract: async () => {
        requests++;
        return [variant];
      },
    },
  );
  await buildMarkers(
    { paths: files },
    {
      extract: () => {
        throw new Error("should use cache");
      },
    },
  );
  assert.equal(requests, 1);
  assert.deepEqual(await checkReference({ paths: files, build: "GRCh38" }), {
    count: 1,
    markers: 1,
  });
  const saved = fs.readFileSync(files.markers("GRCh38"), "utf8");
  const altered = JSON.parse(saved);
  altered.markers[0].read[0] = "unsupported interpretation";
  fs.writeFileSync(files.markers("GRCh38"), JSON.stringify(altered));
  await assert.rejects(checkReference({ paths: files, build: "GRCh38" }), /evidence changed/);
});
