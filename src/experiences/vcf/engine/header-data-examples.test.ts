import { fixture as partialFixture } from "../../../../tests/helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { collectHeaderDataExamples, fieldInRow } from "./header-data-examples.ts";
import {
  headerFieldExample,
  headerFilterExamples,
  selectHeaderField,
} from "./header-field-example.ts";

const meta = [
  "##fileformat=VCFv4.2",
  '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Read Depth">',
];
const definition = selectHeaderField(meta);
const columns = ["CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO", "FORMAT", "SAMPLE"];
const row = (filter: string, sample = "27:0/1") => [
  "1",
  "100",
  ".",
  "C",
  "T",
  "50",
  filter,
  "DP=99",
  "DP:GT",
  sample,
];
const encoder = new TextEncoder();
async function* blocks(text: string | undefined, size = 17) {
  const data = encoder.encode(text);
  for (let at = 0; at < data.length; at += size) yield { data: data.subarray(at, at + size) };
}

test("header examples preserve physical line numbers and read FORMAT by name across blocks", async () => {
  const text = [
    ...meta,
    "",
    `#${columns.join("\t")}`,
    row(".").join("\t"),
    row("PASS").join("\t"),
    row("LowQual").join("\t"),
  ].join("\r\n");
  const examples = await collectHeaderDataExamples(blocks(text), definition);
  assert.equal(examples.field!.value, "27"); // Not INFO DP=99 or a fixed second FORMAT item.
  assert.equal(examples.field!.index, 0);
  assert.equal(examples.field!.number, 5);
  assert.equal(examples.pass!.number, 6);
  assert.equal(examples.unfiltered!.number, 5);
  assert.equal(examples.fail!.number, 7); // Final row has no trailing newline.
  assert.deepEqual(examples.fail!.fields, row("LowQual"));
  const html = headerFieldExample(meta, examples.field, columns)!.html;
  assert.match(html, /item <b>1<\/b>/);
  assert.match(html, /27<\/mark>:0\/1/);
});

test("missing sample values are not invented or confused with another sample", () => {
  assert.equal(fieldInRow(row("PASS", ".:0/1"), definition), null);
  assert.deepEqual(fieldInRow([...row("PASS", ".:0/1"), "0:1/1"], definition), {
    value: "0",
    index: 0,
    sample: 10,
  });
});

test("preview stops at its row or byte budget when an example is absent", async () => {
  let consumed = 0,
    closed = false;
  async function* manyRows() {
    try {
      for (let i = 0; i < 100; i++) {
        consumed++;
        yield { data: encoder.encode(`${row(".").join("\t")}\n`) };
      }
    } finally {
      closed = true;
    }
  }
  const limited = await collectHeaderDataExamples(manyRows(), definition, { maxRows: 3 });
  assert.equal(limited.scanned, 3);
  assert.equal(limited.fail, null);
  assert.equal(consumed, 3);
  assert.equal(closed, true);
  const noPartialRows = await collectHeaderDataExamples(manyRows(), definition, { maxBytes: 10 });
  assert.equal(noPartialRows.scanned, 0);
  await assert.rejects(
    collectHeaderDataExamples(manyRows(), definition, {
      assertCurrent() {
        throw new DOMException("File changed", "AbortError");
      },
    }),
    { name: "AbortError" },
  );
});

test("preview closes immediately once all examples have been found", async () => {
  async function* enough() {
    yield {
      data: encoder.encode(
        `${row("PASS").join("\t")}\n${row("LowQual").join("\t")}\n${row(".").join("\t")}\n`,
      ),
    };
    throw new Error("Should not read another block");
  }
  const result = await collectHeaderDataExamples(enough(), definition);
  assert.equal(result.scanned, 3);
});

test("filter examples distinguish real rows from illustrative fallbacks and escape file text", () => {
  const filters = [{ id: "LowQual", desc: "<unsafe> quality" }];
  const html = headerFilterExamples(
    partialFixture({ pass: { number: 12, fields: row("PASS") }, fail: null }),
    filters,
    columns,
  );
  assert.match(html, /from your file.*L12/);
  assert.match(html, /Fail<\/b> · illustrative example/);
  assert.match(html, /Not checked<\/b> · illustrative example/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
});
