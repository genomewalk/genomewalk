import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT } from "./lib/config.ts";
import { compareCatalogues } from "./benchmark/compare.ts";
import { SAMPLE } from "../src/lib/catalogues/public-sample.ts";

const { values } = parseArgs({
  options: { "out-dir": { type: "string", default: "output/benchmarks/hg002" } },
  allowPositionals: false,
});
const output = path.resolve(ROOT, values["out-dir"]);
await fs.mkdir(output, { recursive: true });
// Clear only this command's previous reports, so a failed run cannot publish stale success.
for (const name of ["report.json", "summary.md"])
  await fs.rm(path.join(output, name), { force: true });

try {
  const commit =
    process.env["BENCHMARK_COMMIT"] ||
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const workingTree = process.env["BENCHMARK_COMMIT"]
    ? process.env["BENCHMARK_WORKING_TREE"] || "not available (Git metadata excluded)"
    : execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim()
      ? "modified"
      : "clean";
  const comparison = await compareCatalogues({
    publicDirectory: path.join(ROOT, "public"),
    sampleFile: path.join(ROOT, "public", SAMPLE.url),
    expectedSampleSha256: "c7f9d7a4781f1f0a8a42ec54b051d6b95db1935c5e12318bae219740f9c50dc8",
    build: "GRCh38",
    onStatus: console.log,
  });
  const report = {
    schema: 1,
    passed: comparison.results.identical && comparison.results.fullCount > 0,
    createdAt: new Date().toISOString(),
    commit,
    workingTree,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    sampleName: SAMPLE.name,
    sampleUrl:
      "https://ftp-trace.ncbi.nlm.nih.gov/ReferenceSamples/giab/release/AshkenazimTrio/HG002_NA24385_son/v5.0q/HG002_GRCh38_v5.0q_smvar.vcf.gz",
    scope:
      "HTTP response-body bytes only; excludes sample, website assets, publication-label sidecars, other reference files and HTTP/TLS overhead. Fresh catalogue readers; Node fetch has no persistent HTTP cache. No browser timing, memory or clinical-accuracy claim.",
    ...comparison,
  };
  const d = report.downloads;
  const summary = [
    "# HG002 catalogue download benchmark",
    "",
    `Result equivalence: **${report.passed ? "PASS" : "FAIL"}** (complete result objects, including annotations and order).`,
    "",
    "| Measurement | Result |",
    "| --- | ---: |",
    `| Full-catalogue matches | ${report.results.fullCount} |`,
    `| Selective-download matches | ${report.results.selectiveCount} |`,
    `| Complete catalogue | ${d.fullBytes.toLocaleString("en-US")} bytes |`,
    `| Index | ${d.indexBytes.toLocaleString("en-US")} bytes |`,
    `| Required blocks | ${d.blockBytes.toLocaleString("en-US")} bytes |`,
    `| Index + required blocks | ${d.selectiveBytes.toLocaleString("en-US")} bytes |`,
    `| Download savings | ${d.savingsPercent.toFixed(2)}% |`,
    `| Range requests | ${d.rangeRequests} |`,
    "",
    `Sample: ${report.sampleName}. Build: ${report.build}.`,
    `Commit: \`${commit}\`. Working tree: ${workingTree}.`,
    "",
    report.scope,
    "",
    "File checksums, result digests and individual request measurements are in report.json.",
    "",
  ].join("\n");
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await fs.writeFile(path.join(output, "summary.md"), summary);
  console.log(summary);
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await fs.writeFile(path.join(output, "summary.md"), `# HG002 benchmark failed\n\n${message}\n`);
  throw error;
}
