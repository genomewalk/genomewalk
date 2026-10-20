import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT } from "./lib/config.ts";
import { compareCatalogues } from "./benchmark/compare.ts";
import { suites } from "./benchmark/samples.ts";
import { withSampleFile } from "./benchmark/sample-file.ts";
import { markdownReport, savingsSummary, scope } from "./benchmark/report.ts";
import type { SuiteReport } from "./benchmark/report.ts";

const { values } = parseArgs({
  options: { suite: { type: "string", default: "hg002" }, "out-dir": { type: "string" } },
  allowPositionals: false,
});
const samples = suites[values.suite];
if (!samples) throw new Error(`Unknown suite: ${values.suite}. Use hg002 or giab-grch38.`);
const output = path.resolve(ROOT, values["out-dir"] || `output/benchmarks/${values.suite}`);
await fs.mkdir(output, { recursive: true });
const commit =
  process.env["BENCHMARK_COMMIT"] ||
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const workingTree = process.env["BENCHMARK_COMMIT"]
  ? process.env["BENCHMARK_WORKING_TREE"] || "not available (Git metadata excluded)"
  : execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim()
    ? "modified"
    : "clean";
const report: SuiteReport = {
  schema: 2,
  suite: values.suite,
  createdAt: new Date().toISOString(),
  commit,
  workingTree,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  expectedSamples: samples.length,
  passed: false,
  scope,
  results: [],
  savings: null,
};
async function saveReport() {
  report.passed =
    report.results.length === report.expectedSamples && report.results.every((r) => r.passed);
  report.savings = savingsSummary(report.results);
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(output, "summary.md"), markdownReport(report));
}
await saveReport(); // Replace stale reports immediately; retain partial results if interrupted.
const publicDirectory = path.join(ROOT, "public");
for (const sample of samples) {
  console.log(`\n${sample.id}: ${sample.name}`);
  try {
    const comparison = await withSampleFile(sample, publicDirectory, (sampleFile) =>
      compareCatalogues({
        publicDirectory,
        sampleFile,
        build: sample.build,
        ...(sample.sha256 ? { expectedSampleSha256: sample.sha256 } : {}),
        onStatus: console.log,
      }),
    );
    const first = report.results.find((r) => r.comparison)?.comparison;
    if (
      first &&
      (first.catalogue.sha256 !== comparison.catalogue.sha256 ||
        first.index.sha256 !== comparison.index.sha256)
    )
      throw new Error("Catalogue or index changed between samples");
    const passed = comparison.results.identical && comparison.results.fullCount > 0;
    report.results.push({ sample, passed, comparison });
    console.log(
      `${sample.id}: ${passed ? "PASS" : "FAIL"}; ${comparison.results.fullCount} / ${comparison.results.selectiveCount} matches; ${comparison.downloads.savingsPercent.toFixed(2)}% savings`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.results.push({ sample, passed: false, error: message });
    console.error(`${sample.id}: ${message}`);
  }
  await saveReport();
}
console.log(markdownReport(report));
if (!report.passed) process.exitCode = 1;
