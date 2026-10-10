import { lessonStrings, unscopedStyles } from "../helpers/source-snapshots.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { ROOT } from "../../scripts/lib/config.ts";
import type { BinaryLike } from "crypto";
const sha = (data: NonSharedBuffer | BinaryLike) => createHash("sha256").update(data).digest("hex");
const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures", name), "utf8"));

test("styles match the reviewed presentation snapshots", () => {
  for (const [file, expected] of Object.entries(fixture("styles.sha256.json"))) {
    // The consumer experience is removable as a whole; protect its styles when installed.
    if (
      file.startsWith("src/experiences/consumer-dna/") &&
      !fs.existsSync(path.join(ROOT, "src/experiences/consumer-dna"))
    )
      continue;
    const css = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(sha(file.endsWith(".module.css") ? unscopedStyles(css) : css), expected, file);
  }
});

test("all VCF lessons retain their original copy and HTML templates", () => {
  for (const [file, expected] of Object.entries(fixture("vcf-lesson-content.sha256.json"))) {
    const strings = lessonStrings(fs.readFileSync(path.join(ROOT, file), "utf8"));
    assert.equal(
      sha(JSON.stringify(strings)),
      expected,
      `${file}: review any intentional lesson-copy change`,
    );
  }
});

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.[cm]?[jt]sx?$/.test(file) ? [file] : [];
  });
}
test("runtime modules do not import offline builders; browser and offline code stay independent", () => {
  for (const file of files(path.join(ROOT, "src"))) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      const spec =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : undefined;
      if (!spec?.startsWith(".")) continue;
      assert.ok(
        !path.resolve(path.dirname(file), spec).startsWith(path.join(ROOT, "scripts") + path.sep),
        file,
      );
    }
  }
});
