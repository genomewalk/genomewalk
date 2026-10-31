import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT } from "./lib/config.ts";
import { verifyMatching } from "./benchmark/verify.ts";
import { suites } from "./benchmark/samples.ts";
import { withSampleFile } from "./benchmark/sample-file.ts";
import { markdownReport, scope } from "./benchmark/report.ts";
import type { SuiteReport } from "./benchmark/report.ts";

const { values } = parseArgs({
  options: {
    suite: { type: "string", default: "hg002" },
    "out-dir": { type: "string" },
  },
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
  schema: 5,
  suite: values.suite,
  createdAt: new Date().toISOString(),
  commit,
  workingTree,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  expectedSamples: samples.length,
  passed: false,
  scope,
  results: [],
};
async function saveReport() {
  report.passed =
    report.results.length === report.expectedSamples && report.results.every((r) => r.passed);
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(output, "summary.md"), markdownReport(report));
}
await saveReport(); // Replace stale reports immediately; retain partial results if interrupted.
const publicDirectory = path.join(ROOT, "public");
for (const sample of samples) {
  console.log(`\n${sample.id}: ${sample.name}`);
  try {
    const verification = await withSampleFile(sample, publicDirectory, (sampleFile) =>
      verifyMatching({
        publicDirectory,
        sampleFile,
        build: sample.build,
        ...(sample.sha256 ? { expectedSampleSha256: sample.sha256 } : {}),
        onStatus: console.log,
      }),
    );
    const first = report.results.find((r) => r.verification)?.verification;
    if (
      first &&
      (first.catalogue.sha256 !== verification.catalogue.sha256 ||
        first.metadata.sha256 !== verification.metadata.sha256)
    )
      throw new Error("Catalogue or metadata changed between samples");
    const passed = verification.results.identical && verification.results.expectedCount > 0;
    report.results.push({ sample, passed, verification });
    console.log(
      `${sample.id}: ${passed ? "PASS" : "FAIL"}; ${verification.results.expectedCount} expected / ${verification.results.actualCount} actual results; all fields and ordering match: ${verification.results.identical}`,
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
