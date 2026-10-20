import type { BenchmarkSample } from "./samples.ts";
import type { compareCatalogues } from "./compare.ts";

export type SampleResult = {
  sample: BenchmarkSample;
  passed: boolean;
  comparison?: Awaited<ReturnType<typeof compareCatalogues>>;
  error?: string;
};
export const scope =
  "HTTP response-body bytes only; excludes sample downloads, website assets, publication-label sidecars, other reference files and HTTP/TLS overhead. Fresh catalogue readers; Node fetch has no persistent HTTP cache. No browser timing, memory or clinical-accuracy claim.";

export function savingsSummary(results: SampleResult[]) {
  const values = results
    .filter((r) => r.passed && r.comparison)
    .map((r) => r.comparison!.downloads.savingsPercent)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return {
    count: values.length,
    min: values[0]!,
    max: values.at(-1)!,
    median: values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2,
  };
}

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
  savings: ReturnType<typeof savingsSummary>;
}

export function markdownReport(report: SuiteReport) {
  const number = (value: number) => value.toLocaleString("en-US");
  const lines = [
    `# Catalogue download benchmark: ${report.suite}`,
    "",
    `Status: **${report.results.length < report.expectedSamples ? "INCOMPLETE" : report.passed ? "PASS" : "FAIL"}**. ${report.results.filter((r) => r.passed).length}/${report.expectedSamples} samples passed.`,
    "",
    "| Sample | Full / selective matches | Identical results | Complete catalogue (bytes) | Index (bytes) | Required blocks (bytes) | Total selective (bytes) | Savings | Range requests |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const result of report.results) {
    const c = result.comparison;
    if (!c) {
      lines.push(`| ${result.sample.id} | — | ERROR | — | — | — | — | — | — |`);
      continue;
    }
    const d = c.downloads;
    lines.push(
      `| ${result.sample.id} | ${c.results.fullCount} / ${c.results.selectiveCount} | ${c.results.identical ? "Yes" : "No"} | ${number(d.fullBytes)} | ${number(d.indexBytes)} | ${number(d.blockBytes)} | ${number(d.selectiveBytes)} | ${d.savingsPercent.toFixed(2)}% | ${d.rangeRequests} |`,
    );
  }
  if (report.savings) {
    const s = report.savings;
    lines.push(
      "",
      `Savings among ${s.count} successful samples: **${s.min.toFixed(2)}% minimum · ${s.median.toFixed(2)}% median · ${s.max.toFixed(2)}% maximum**.`,
    );
  }
  lines.push(
    "",
    "Equivalence compares every result field, including annotations and ordering. Zero matches fail the benchmark. Failed samples are excluded from savings statistics and remain listed above.",
    "",
    "HG002–HG004 and HG005–HG007 are families; these are not seven unrelated individuals. The giab-grch38 suite uses v4.2.1 autosomal benchmark VCFs. The hg002 suite uses the bundled v5.0q sample.",
    "",
    `Commit: \`${report.commit}\`. Working tree: ${report.workingTree}.`,
    "",
    report.scope,
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
    "report.json includes input provenance, file checksums, result digests and every request. Downloaded sample files are removed after each test; reports contain no genome files.",
    "",
  );
  return lines.join("\n");
}
