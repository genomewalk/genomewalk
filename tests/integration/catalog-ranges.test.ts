import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bgzfWrite } from "../../scripts/lib/io/bgzf.ts";
import { CATALOG_HEADER } from "../../scripts/lib/clinvar.ts";
import { catalogueRangeIndex } from "../../scripts/lib/catalog-ranges.ts";
import { RangeCatalogue } from "../../src/lib/catalogues/catalogue-ranges.ts";
import { createStaticServer } from "../../scripts/lib/static-server.ts";

test("range catalogue preserves split UTF-8 rows and indels while leaving unrelated blocks unread", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genomewalk-ranges-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "catalog.bgz");
  const rows = Array.from(
    { length: 2000 },
    (_, i) => `1\t${i + 1}\tT\tTC\tP\t2\t${"é".repeat(i === 1100 ? 70000 : 100)}`,
  );
  rows[1999] = rows[1999]!.replace(/^1\t/, "NW_003315950.2\t");
  bgzfWrite(CATALOG_HEADER + "\n" + rows.join("\n"), file);
  const bytes = fs.readFileSync(file);
  const index = await catalogueRangeIndex(bytes, "GRCh38");
  assert.equal(index.n, rows.length);
  assert.equal(index.byClass["P"], rows.length);
  const requests = [];
  const map = new RangeCatalogue(index, "/catalog.bgz", async (_, { headers } = {}) => {
    const [, start, end] = /bytes=(\d+)-(\d+)/
      .exec(new Headers(headers).get("Range")!)!
      .map(Number);
    requests.push([start, end]);
    return new Response(bytes.subarray(start, end! + 1), {
      status: 206,
      headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}` },
    });
  });
  const result = await map.readEntries(["1:1101:T:TC", "NW_003315950.2:2000:T:TC"]);
  assert.equal(result.get("1:1101:T:TC"), rows[1100]);
  assert.equal(result.get("NW_003315950.2:2000:T:TC"), rows[1999]);
  assert.ok(map.bytesRead < bytes.length);
  const before = requests.length;
  await map.readEntries(["1:1101:T:TC"]);
  assert.equal(requests.length, before, "annotations are reused");
  assert.equal((await map.readEntries([])).size, 0);
  const damaged = new RangeCatalogue(index, "/catalog.bgz", async (_, { headers } = {}) => {
    const [, start, end] = /bytes=(\d+)-(\d+)/
      .exec(new Headers(headers).get("Range")!)!
      .map(Number);
    const body = new Uint8Array(bytes.subarray(start, end! + 1));
    body[20]! ^= 1;
    return new Response(body, {
      status: 206,
      headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}` },
    });
  });
  await assert.rejects(damaged.readEntries(["1:1101:T:TC"]), /does not match its index/);
});

test("static preview serves clean page paths, exact byte ranges and no upload endpoint", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genomewalk-static-"));
  fs.mkdirSync(path.join(root, "chapter/9"), { recursive: true });
  fs.writeFileSync(path.join(root, "chapter/9/index.html"), "<h1>Results</h1>");
  fs.writeFileSync(path.join(root, "catalog.bgz"), Buffer.from([1, 2, 3, 4, 5]));
  const server = createStaticServer(root);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  assert.equal(await (await fetch(origin + "/chapter/9")).text(), "<h1>Results</h1>");
  const response = await fetch(origin + "/catalog.bgz", { headers: { Range: "bytes=1-3" } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 1-3/5");
  assert.equal(response.headers.get("content-encoding"), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([2, 3, 4]));
  assert.equal(
    (await fetch(origin + "/catalog.bgz", { headers: { Range: "bytes=10-12" } })).status,
    416,
  );
  assert.equal(
    (await fetch(origin + "/upload", { method: "POST", body: "synthetic" })).status,
    405,
  );
});
