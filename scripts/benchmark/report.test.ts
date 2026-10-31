import test from "node:test";
import assert from "node:assert/strict";
import { markdownReport, scope } from "./report.ts";
import type { SampleResult, SuiteReport } from "./report.ts";
import { bundledSample, giabGrch38 } from "./samples.ts";

const success: SampleResult = {
  sample: bundledSample,
  passed: true,
  verification: {
    build: "GRCh38",
    sample: { sha256: "sample" },
    catalogue: { sha256: "catalogue", records: 10 },
    metadata: { sha256: "metadata" },
    results: {
      identical: true,
      expectedCount: 2,
      actualCount: 2,
      expectedSha256: "same",
      actualSha256: "same",
    },
  },
};
const report: SuiteReport = {
  schema: 5,
  suite: "test",
  createdAt: "test",
  commit: "test",
  workingTree: "clean",
  runtime: { node: "test", platform: "test", arch: "test" },
  expectedSamples: 1,
  passed: true,
  scope,
  results: [success],
};

test("correctness report shows results without retrieval or performance measurements", () => {
  const text = markdownReport(report);
  assert.match(text, /\*\*PASS\*\*/);
  assert.match(text, /HG002 \| 2 \| 2 \| Yes \| PASS/);
  assert.doesNotMatch(
    text,
    /Tabix|selective|baseline|savings|range requests|total bytes|latency|peak memory/i,
  );
  assert.match(markdownReport({ ...report, expectedSamples: 7, passed: false }), /INCOMPLETE/);
});

test("mismatches and failures remain visible in correctness reports", () => {
  const mismatch: SampleResult = {
    ...success,
    passed: false,
    verification: {
      ...success.verification!,
      results: { ...success.verification!.results, identical: false, actualSha256: "different" },
    },
  };
  const text = markdownReport({
    ...report,
    expectedSamples: 2,
    passed: false,
    results: [mismatch, { sample: giabGrch38[2]!, passed: false, error: "Cannot read sample" }],
  });
  assert.match(text, /\*\*FAIL\*\*/);
  assert.match(text, /HG002 \| 2 \| 2 \| No \| FAIL/);
  assert.match(text, /HG003 \| — \| — \| — \| ERROR/);
  assert.match(text, /Cannot read sample/);
});
