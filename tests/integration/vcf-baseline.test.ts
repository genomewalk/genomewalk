import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { BinaryLike } from "crypto";
const sha = (bytes: NonSharedBuffer | BinaryLike) =>
  createHash("sha256").update(bytes).digest("hex");
const baseline = JSON.parse(
  fs.readFileSync(new URL("../fixtures/vcf-baseline.sha256.json", import.meta.url), "utf8"),
);

test("VCF identity, session, study sources and preserved lesson styles remain intact", () => {
  for (const [file, expected] of Object.entries(baseline))
    assert.equal(sha(fs.readFileSync(new URL(`../../${file}`, import.meta.url))), expected, file);
});

test("the VCF chapter body preserves the saved rendering and navigation behavior", () => {
  const expected = JSON.parse(
    fs.readFileSync(new URL("../fixtures/vcf-shell.sha256.json", import.meta.url), "utf8"),
  );
  const code = fs.readFileSync(
    new URL("../../src/experiences/vcf/chapter-page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(sha(code.slice(code.indexOf("function ChapterContent"))), expected.chapterContent);
});

test("the VCF engine has no imports from the optional consumer experience", () => {
  const root = new URL("../../src/experiences/vcf/", import.meta.url);
  function check(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) check(file);
      else if (/\.[cm]?[jt]sx?$/.test(file))
        assert.doesNotMatch(
          fs.readFileSync(file, "utf8"),
          /consumer-dna|lib\/genome|features\//,
          file,
        );
    }
  }
  check(root.pathname);
});
