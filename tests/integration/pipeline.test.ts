import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildPlan } from "../../scripts/lib/plan.ts";
import { buildMarkers } from "../../scripts/lib/markers.ts";
import { paths, ROOT, FREQUENCY_SOURCE } from "../../scripts/lib/config.ts";
import { inspectCachedInputs, requireCachedInputs } from "../../scripts/lib/preflight.ts";

const temp = (t: test.TestContext) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genomewalk-pipeline-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
test("offline plan excludes downloads and requires exact cached frequencies, markers and publications", () => {
  const plan = buildPlan({ offline: true });
  assert.ok(plan.every((stage) => stage.name));
  assert.ok(plan.every((stage) => stage.script !== "download-inputs.ts"));
  assert.equal(plan[0]!.script, "build-freqs.ts");
  assert.ok(
    plan
      .filter((stage) =>
        ["build-freqs.ts", "build-marker-freqs.ts", "build-publications.ts"].includes(stage.script),
      )
      .every((stage) => stage.args.includes("--offline")),
  );
  assert.throws(() => buildPlan({ offline: true, fresh: true }), /cannot be combined/);
});
test("full builds pass concurrency and refresh options to the frequency stage", () => {
  const stage = buildPlan({ jobs: "3", fresh: true }).find(
    (stage) => stage.script === "build-freqs.ts",
  );
  assert.deepEqual(stage!.args, ["--jobs", "3", "--fresh"]);
});
test("offline marker builds cannot fall through to HTTP when the cache is missing", async (t) => {
  const directory = temp(t);
  const files = paths({ "data-dir": directory, "out-dir": path.join(directory, "out") });
  let fetched = false;
  await assert.rejects(
    buildMarkers(
      { paths: files, offline: true },
      {
        extract: () => {
          fetched = true;
          throw Error("network");
        },
      },
    ),
    /No compatible cached marker response/,
  );
  assert.equal(fetched, false);
  assert.ok(!fs.existsSync(files.output));
});
test("data targets are discoverable and offline plan works from outside the checkout without writes", (t) => {
  const directory = temp(t);
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts/build-all.ts"),
      "--offline",
      "--dry-run",
      "--data-dir",
      path.join(directory, "cache"),
      "--out-dir",
      path.join(directory, "out"),
    ],
    { cwd: directory, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Validate every generated artifact/);
  assert.doesNotMatch(result.stdout, /download-inputs/);
  assert.match(result.stdout, /build-freqs\.ts.*--offline/);
  assert.deepEqual(fs.readdirSync(directory), []);
  const help = spawnSync(process.execPath, [path.join(ROOT, "scripts/data-help.ts")], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  for (const name of [
    "data:plan",
    "data:inputs",
    "data:build",
    "data:rebuild",
    "data:refresh",
    "data:consumer",
    "data:check",
  ])
    assert.ok(help.stdout.includes(name));
});

test("offline preflight reports all missing prerequisites before any stage can write", (t) => {
  const directory = temp(t);
  const files = paths({ "data-dir": directory, "out-dir": path.join(directory, "out") });
  const report = inspectCachedInputs({ paths: files, only: "GRCh37" });
  assert.ok(
    report.issues.some((issue) => issue.includes("clinvar.GRCh38")),
    "GRCh37 needs the GRCh38 join input",
  );
  assert.ok(report.issues.some((issue) => issue.includes("clinvar.GRCh37")));
  assert.ok(
    !report.required.includes(files.frequencies),
    "the TSV is regenerated from region caches",
  );
  assert.ok(report.issues.some((issue) => issue.includes("markers/gnomad-v4.1-joint-")));
  assert.ok(!report.required.some((file) => file.includes("markers/GRCh38-")));
  assert.throws(() => requireCachedInputs({ paths: files }), /No build stages ran/);
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts/build-all.ts"),
      "--offline",
      "--data-dir",
      directory,
      "--out-dir",
      files.output,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Offline prerequisites are incomplete/);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("offline preflight checks marker cache identity and permits a complete isolated cache", (t) => {
  const directory = temp(t);
  const files = {
    ...paths({ "data-dir": directory }),
    markerBase: path.join(directory, "markers.base.json"),
  };
  const marker = {
    rs: "rs1",
    read: ["zero", "one", "two"],
    cite: { label: "Synthetic source", url: "https://example.org/study" },
    targets: { GRCh38: { variant: "1-100-C-T", effectAllele: "T" } },
  };
  for (const file of [files.clinvar("GRCh38"), files.frequencies, files.citations])
    fs.writeFileSync(file, "synthetic input\n");
  fs.writeFileSync(files.markerBase, JSON.stringify([marker]));
  fs.mkdirSync(path.join(directory, "markers"));
  const cache = path.join(directory, "markers/gnomad-v4.1-joint-rs1.json");
  fs.writeFileSync(
    cache,
    JSON.stringify({ source: FREQUENCY_SOURCE, frequency: { key: "1:100:C:G" } }),
  );
  assert.match(
    inspectCachedInputs({ paths: files, only: "GRCh38" }).issues.join("\n"),
    /does not match/,
  );
  fs.writeFileSync(
    cache,
    JSON.stringify({ source: FREQUENCY_SOURCE, frequency: { key: "1:100:C:T" } }),
  );
  assert.deepEqual(requireCachedInputs({ paths: files, only: "GRCh38" }).issues, []);
});
