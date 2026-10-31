import type { BenchmarkSample } from "./samples.ts";
import type { verifyMatching } from "./verify.ts";

export type SampleResult = {
  sample: BenchmarkSample;
  passed: boolean;
  verification?: Awaited<ReturnType<typeof verifyMatching>>;
  error?: string;
};
export const scope =
  "Matching correctness only: the production VCF matcher is checked against a simple local reference join using the same catalogue and input rules. Every result field and array order must agree. Shared parsing and annotation helpers are covered separately by unit tests; this is not independent clinical validation.";

export interface SuiteReport {
  schema: number;
  suite: string;
  createdAt: string;
  commit: string;
  workingTree: string;
  runtime: { node: string; platform: string; arch: string };
  expectedSamples: number;
  passed: boolean;
  scope: string;
  results: SampleResult[];
}

export function markdownReport(report: SuiteReport) {
  const lines = [
    `# Matching correctness: ${report.suite}`,
    "",
    `Status: **${report.results.length < report.expectedSamples ? "INCOMPLETE" : report.passed ? "PASS" : "FAIL"}**. ${report.results.filter((r) => r.passed).length}/${report.expectedSamples} samples passed.`,
    "",
    "| Sample | Expected results | Actual results | All fields and order match | Status |",
    "| --- | ---: | ---: | --- | --- |",
  ];
  for (const result of report.results) {
    const checks = result.verification?.results;
    lines.push(
      checks
        ? `| ${result.sample.id} | ${checks.expectedCount} | ${checks.actualCount} | ${checks.identical ? "Yes" : "No"} | ${result.passed ? "PASS" : "FAIL"} |`
        : `| ${result.sample.id} | — | — | — | ERROR |`,
    );
  }
  lines.push(
    "",
    report.scope,
    "",
    "These public samples are expected to have matches. Zero expected results, any mismatch, an unreadable input, or failed catalogue validation fails the run.",
    "",
    `Commit: \`${report.commit}\`. Working tree: ${report.workingTree}.`,
    "",
  );
  for (const result of report.results) {
    lines.push(
      `- ${result.sample.id}: [${result.sample.name}](${result.sample.url}) — ${result.sample.relationship}.`,
    );
    if (result.error) lines.push(`  Error: ${result.error.replace(/\s+/g, " ")}`);
  }
  lines.push(
    "",
    "report.json records public input provenance, catalogue/metadata checksums and expected/actual result digests. Digests sort object keys while preserving array order. Temporary sample downloads are removed after each check; bundled files are reused.",
    "",
  );
  return lines.join("\n");
}
