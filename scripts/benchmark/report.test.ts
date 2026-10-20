import test from "node:test";
import assert from "node:assert/strict";
import { savingsSummary, markdownReport, scope } from "./report.ts";
import type { SampleResult, SuiteReport } from "./report.ts";
import { bundledSample, giabGrch38 } from "./samples.ts";

test("suite reports keep failures visible and calculate statistics from successful samples only", () => {
  const success = (savingsPercent: number): SampleResult => ({
    sample: bundledSample,
    passed: true,
    comparison: {
      build: "GRCh38",
      sample: { bytes: 10, sha256: "sample" },
      catalogue: { size: 100, sha256: "catalogue", records: 1 },
      index: { bytes: 10, sha256: "index" },
      results: {
        identical: true,
        fullCount: 1,
        selectiveCount: 1,
        fullSha256: "same",
        selectiveSha256: "same",
      },
      downloads: {
        fullBytes: 100,
        indexBytes: 10,
        blockBytes: 10,
        selectiveBytes: 20,
        rangeRequests: 1,
        savingsPercent,
      },
      requests: { full: [], selective: [] },
    },
  });
  const results = [
    success(10),
    success(70),
    success(-5),
    { sample: giabGrch38[2]!, passed: false, error: "Download failed" },
  ];
  assert.deepEqual(savingsSummary(results), { count: 3, min: -5, median: 10, max: 70 });
  assert.equal(savingsSummary([success(10), success(20)])!.median, 15);
  assert.equal(savingsSummary([]), null);
  const report: SuiteReport = {
    schema: 2,
    suite: "test",
    createdAt: "test",
    commit: "test",
    workingTree: "clean",
    runtime: { node: "test", platform: "test", arch: "test" },
    expectedSamples: 4,
    passed: false,
    scope,
    results,
    savings: savingsSummary(results),
  };
  const text = markdownReport(report);
  assert.match(text, /\*\*FAIL\*\*/);
  assert.match(text, /HG003 \| — \| ERROR/);
  assert.match(text, /Download failed/);
  assert.match(text, /-5.00% minimum/);
  assert.match(markdownReport({ ...report, expectedSamples: 7 }), /INCOMPLETE/);
  assert.equal(giabGrch38.length, 7);
  assert.equal(
    giabGrch38.reduce((total, sample) => total + sample.bytes, 0),
    953013011,
  );
});
