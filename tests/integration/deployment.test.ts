import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectDeployment } from "../../scripts/lib/deployment.ts";
import { CHAPTER_COUNT } from "../../src/lib/navigation/journey.ts";

test("static preflight requires deep-link pages and enforces an optional host size limit", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "genomewalk-deploy-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => inspectDeployment(dir), /Run npm run build first/);
  for (const page of [
    "index.html",
    "privacy/index.html",
    "terms/index.html",
    ...Array.from({ length: CHAPTER_COUNT }, (_, i) => `chapter/${i + 1}/index.html`),
  ]) {
    fs.mkdirSync(path.dirname(path.join(dir, page)), { recursive: true });
    fs.writeFileSync(path.join(dir, page), "<html>Page</html>");
  }
  assert.throws(() => inspectDeployment(dir), /catalog\.tsv\.gz/);
  for (const build of ["GRCh37", "GRCh38"]) {
    fs.mkdirSync(path.join(dir, "ref", build), { recursive: true });
    fs.writeFileSync(path.join(dir, "ref", build, "catalog.tsv.gz"), "fixture");
    fs.writeFileSync(path.join(dir, "ref", build, "catalog.meta.json"), "{}");
  }
  fs.writeFileSync(path.join(dir, "boundary.bgz"), Buffer.alloc(100));
  fs.writeFileSync(path.join(dir, "large.bgz"), Buffer.alloc(101));
  assert.deepEqual(inspectDeployment(dir, { maxAssetBytes: 100 }).oversized, [
    { file: "large.bgz", bytes: 101 },
  ]);
  assert.equal(inspectDeployment(dir).oversized.length, 0);
  const obsolete = path.join(dir, "ref", "GRCh38", "catalog.index.json.gz");
  fs.writeFileSync(obsolete, "unused");
  assert.throws(() => inspectDeployment(dir), /obsolete catalogue membership index/);
  fs.unlinkSync(obsolete);
  fs.unlinkSync(path.join(dir, `chapter/${CHAPTER_COUNT}/index.html`));
  assert.throws(() => inspectDeployment(dir), new RegExp(`chapter/${CHAPTER_COUNT}/index.html`));
});
