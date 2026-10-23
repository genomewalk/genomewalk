import { mockDocument } from "../../../../../tests/helpers/fixture.ts";
import { fixture as partialFixture } from "../../../../../tests/helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { openConsumerFile } from "../../reader.ts";
import { runConsumerChapter } from "../../chapters.ts";
import { ctx } from "../context.ts";

async function render(t: test.TestContext, text: BlobPart) {
  const source = await openConsumerFile(new File([text], "synthetic-header.txt"));
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  globalThis.document = mockDocument();
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  t.mock.property(ctx, "source", source);
  t.mock.method(source, "readCalls", () => {
    throw new Error("The header view must not scan DNA rows");
  });
  const children: HTMLElement[] = [];
  await runConsumerChapter(
    0,
    partialFixture({ append: (child: HTMLElement) => children.push(child) }),
  );
  return {
    source,
    children,
    preview: children.find((child) => child.className === "header-overview")!.innerHTML,
  };
}

for (const provider of ["23andMe", "AncestryDNA"]) {
  test(`${provider} header excerpts preserve real line numbers, comments and column spelling`, async (t) => {
    const ancestry = provider === "AncestryDNA";
    const columns = ancestry
      ? "rsid\tchromosome\tposition\tallele1\tallele2"
      : "# rsid \tchromosome\tposition\tgenotype";
    const text = `\uFEFF# Synthetic ${provider} <example>\r\n\r\n# reference build 37; plus strand\r\n\r\n${columns}\r\nrs1\t1\t100\t${ancestry ? "C\tT" : "CT"}`;
    const { source, children, preview } = await render(t, text);
    assert.deepEqual(
      source.header.lines.map((line) => line.number),
      [1, 3, 5],
    );
    assert.equal(source.header.lines[2]!.text, columns);
    assert.equal(source.header.lines[2]!.columns, true);
    for (const number of [1, 3, 5]) assert.ok(preview.includes(`>L${number}<`));
    assert.match(preview, /&lt;example&gt;/);
    assert.doesNotMatch(preview, /<example>|<table|rs1\t1\t100/);
    assert.equal((preview.match(/# reference build 37; plus strand/g) || []).length, 1);
    assert.match(preview, ancestry ? /Two allele columns/ : /Genotype column/);
    for (const [, id] of preview.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(
        children.some((child) => child.id === id),
        `Missing explanation ${id}`,
      );
    }
    const details = new Map(children.map((child) => [child.id, child.innerHTML]));
    assert.ok(details.get("header-source")!.includes(`# Synthetic ${provider} &lt;example&gt;`));
    for (const id of ["reference-build", "header-strand"])
      assert.ok(details.get(id)!.includes("# reference build 37; plus strand"));
    assert.ok(details.get("header-columns")!.includes(columns));
    assert.ok(children.some((child) => child.innerHTML?.includes("File size")));
    assert.doesNotMatch(preview, /File size/);
    assert.equal(source.capabilities.matching, true);
  });
}

test("provider defaults are explained without inventing header comments", async (t) => {
  const { preview, children } = await render(
    t,
    "# AncestryDNA\nrsid\tchromosome\tposition\tallele1\tallele2\nrs1\t1\t100\tC\tT",
  );
  assert.match(preview, /Not stated in these comments/);
  assert.doesNotMatch(preview, /# build|#.*forward strand|GRCh37/);
  assert.match(
    children.find((child) => child.id === "reference-build")!.innerHTML,
    /documented AncestryDNA format/,
  );
  assert.match(
    children.find((child) => child.id === "header-strand")!.innerHTML,
    /comments do not state a strand/,
  );
});

test("long source comments remain complete in the linked detail cards", async (t) => {
  const suffix = "the original provider note ".repeat(20) + "END_OF_ORIGINAL_LINE";
  const sourceLine = `# Synthetic 23andMe: ${suffix}`;
  const buildLine = `# assembly hg38; forward strand: ${suffix}`;
  const { children } = await render(
    t,
    `${sourceLine}\n${buildLine}\n# rsid\tchromosome\tposition\tgenotype\nrs1\t1\t100\tCT`,
  );
  const details = new Map(children.map((child) => [child.id, child.innerHTML]));
  assert.ok(details.get("header-source")!.includes(sourceLine));
  assert.ok(details.get("reference-build")!.includes(buildLine));
  assert.ok(details.get("header-strand")!.includes(buildLine));
});
