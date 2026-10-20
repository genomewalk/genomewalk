import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { withSampleFile } from "./sample-file.ts";
import type { BenchmarkSample } from "./samples.ts";

test("temporary samples are verified and removed after success or failure; bundled files survive", async (t) => {
  const bytes = Buffer.from("synthetic public test file");
  const server = createServer((_, response) => response.end(bytes));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "benchmark-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sample: BenchmarkSample = {
    id: "synthetic",
    name: "test.vcf.gz",
    build: "GRCh38",
    relationship: "Synthetic",
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/test.vcf.gz`,
    bytes: bytes.length,
    md5: createHash("md5").update(bytes).digest("hex"),
  };
  let downloaded = "";
  assert.equal(
    await withSampleFile(sample, root, async (file) => {
      downloaded = file;
      assert.deepEqual(await fs.readFile(file), bytes);
      return 42;
    }),
    42,
  );
  await assert.rejects(fs.stat(path.dirname(downloaded)), { code: "ENOENT" });
  await assert.rejects(
    withSampleFile(sample, root, async (file) => {
      downloaded = file;
      throw new Error("comparison failed");
    }),
    /comparison failed/,
  );
  await assert.rejects(fs.stat(path.dirname(downloaded)), { code: "ENOENT" });
  await assert.rejects(
    withSampleFile({ ...sample, md5: "0".repeat(32) }, root, async () =>
      assert.fail("must not test corrupted sample"),
    ),
    /MD5 mismatch/,
  );
  await assert.rejects(
    withSampleFile({ ...sample, bytes: 1 }, root, async () =>
      assert.fail("must not test truncated sample"),
    ),
    /size mismatch/,
  );
  await fs.writeFile(path.join(root, sample.name), bytes);
  await assert.rejects(
    withSampleFile({ ...sample, localPath: sample.name }, root, async () => {
      throw new Error("comparison failed");
    }),
    /comparison failed/,
  );
  assert.deepEqual(await fs.readFile(path.join(root, sample.name)), bytes);
});
