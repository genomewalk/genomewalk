import test from "node:test";
import assert from "node:assert/strict";
import { visibleShares, splitBar } from "../../src/components/diagrams/share-chart.ts";

test("tiny nonzero segments remain visible without changing counts or percentages", () => {
  const parts = [
    { label: "Large", n: 999999, tone: "green" },
    { label: "Tiny", n: 1, tone: "gold" },
    { label: "Empty", n: 0, tone: "stone" },
  ];
  const shares = visibleShares(parts.map((p) => p.n));
  assert.ok(Math.abs(shares.reduce((a, b) => a + b) - 1) < 1e-9);
  assert.ok(shares[1]! >= 0.012);
  assert.equal(shares[2], 0);
  const html = splitBar(parts);
  assert.match(html, /999,999/);
  assert.match(html, /&lt;0.01%/);
  assert.match(html, /&gt;99.9%/);
  assert.match(html, /Striped segments are widened/);
  assert.equal((html.match(/class="share-chart-segment/g) || []).length, 2);
});

test("ordinary proportions stay proportional; all-zero charts remain empty", () => {
  assert.deepEqual(visibleShares([80, 20]), [0.8, 0.2]);
  assert.deepEqual(visibleShares([0, 0]), [0, 0]);
  const shares = visibleShares([980, 10, 5, 4, 1]);
  assert.ok(shares.every((n) => n >= 0.012));
  assert.ok(Math.abs(shares.reduce((a, b) => a + b) - 1) < 1e-9);
  const empty = splitBar([{ label: "No records", n: 0, tone: "green" }]);
  assert.match(empty, /No records in these categories/);
  assert.doesNotMatch(empty, /NaN|Infinity|class="share-chart-segment/);
});

test("rare ClinVar review levels remain visibly distinct", () => {
  const counts = [33990, 380099, 84541, 12516, 51];
  const shares = visibleShares(counts);
  assert.ok(Math.abs(shares.reduce((a, b) => a + b) - 1) < 1e-9);
  const guidelineToPanel = shares[4]! / shares[3]!;
  assert.ok(guidelineToPanel > 0.45 && guidelineToPanel < 0.55);
  assert.ok(Math.abs(shares[3]! / shares[2]! - counts[3]! / counts[2]!) < 1e-9);
});
