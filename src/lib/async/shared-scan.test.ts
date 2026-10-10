import test from "node:test";
import assert from "node:assert/strict";
import { sharedScan } from "./shared-scan.ts";

test("joining a scan replays its progress and receives subsequent updates without rereading", async () => {
  const cache = new WeakMap();
  const source = {};
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const a: [number, { records: number }][] = [],
    b: [number, { records: number }][] = [];
  let reads = 0,
    report!: (fraction: number, counts: { records: number }) => void;
  const read = async (update: (fraction: number, counts: { records: number }) => void) => {
    reads++;
    report = update;
    report(0.13, { records: 13 });
    started.resolve();
    await gate.promise;
    report(1, { records: 100 });
    return { records: 100 };
  };
  const first = sharedScan(cache, source, read, (...value) => a.push(value));
  await started.promise;
  const second = sharedScan(cache, source, read, (...value) => b.push(value));
  assert.deepEqual(b, a);
  report(0.5, { records: 50 });
  gate.resolve();
  const results = await Promise.all([first, second]);
  assert.deepEqual(a, b);
  assert.deepEqual(
    b.map(([fraction]) => fraction),
    [0.13, 0.5, 1],
  );
  assert.equal(results[0], results[1]);
  assert.equal(reads, 1);
  assert.equal(cache.has(source), false);
});

test("failed scans release subscribers and can be retried", async () => {
  const cache = new WeakMap(),
    source = {};
  const updates: number[] = [];
  await assert.rejects(
    sharedScan(
      cache,
      source,
      async (report: (arg0: number) => void) => {
        report(0.13);
        throw new Error("read failed");
      },
      (fraction) => updates.push(fraction),
    ),
    /read failed/,
  );
  assert.equal(cache.has(source), false);
  const retried: number[] = [];
  await sharedScan(
    cache,
    source,
    async (report) => report(1),
    (fraction: number) => retried.push(fraction),
  );
  assert.deepEqual(updates, [0.13]);
  assert.deepEqual(retried, [1]);
});
