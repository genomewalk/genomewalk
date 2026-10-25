import assert from "node:assert/strict";
import test from "node:test";
import {
  getReadingContext,
  readingProperties,
  readingVocabulary,
  sanitizeReadingDetails,
  sanitizeReadingProperties,
  withReadingContext,
  type ReadingDetails,
} from "./reading.ts";

const privateText = "PRIVATE_GENOME_rs123456_ACGT_subject.txt";

test("reading vocabulary accepts only fixed categories and strips arbitrary file details", () => {
  for (const [key, values] of Object.entries(readingVocabulary)) {
    for (const value of values)
      assert.deepEqual(sanitizeReadingDetails({ [key]: value }), { [key]: value });
    for (const value of [privateText, 123456, null, { value: privateText }, [privateText]]) {
      assert.deepEqual(sanitizeReadingDetails({ [key]: value }), {});
      const wire = readingProperties({ [key]: value, filename: privateText, row: 123456 });
      assert.deepEqual(wire, {});
    }
  }
  for (const value of [null, undefined, privateText, 123456])
    assert.deepEqual(sanitizeReadingDetails(value), {});
});

test("wire diagnostics preserve categories and revalidate every outbound property", () => {
  const details: ReadingDetails = {
    readerKind: "consumer-dna",
    readingStep: "first-record",
    inputContainer: "gzip",
    textEncoding: "utf8-bom",
    headerProvider: "23andMe",
    headerLayout: "genotype",
    failureReason: "row-columns-too-many",
  };
  const expected = {
    reader_kind: "consumer-dna",
    reading_step: "first-record",
    input_container: "gzip",
    text_encoding: "utf8-bom",
    header_provider: "23andMe",
    header_layout: "genotype",
    failure_reason: "row-columns-too-many",
  };
  assert.deepEqual(readingProperties(details), expected);
  assert.deepEqual(
    sanitizeReadingProperties({ ...expected, filename: privateText, genotype: privateText }),
    expected,
  );
  for (const key of Object.keys(expected)) {
    const clean = sanitizeReadingProperties({ ...expected, [key]: privateText });
    assert.equal(clean[key], undefined);
    assert.equal(JSON.stringify(clean).includes(privateText), false);
  }
});

test("reading context preserves native error identity and keeps the inner failure location", () => {
  const cause = new Error(privateText);
  const error = Object.freeze(new RangeError("Array buffer allocation failed", { cause }));
  const stack = error.stack;
  const inner: ReadingDetails = { readingStep: "decompress", inputContainer: "gzip" };
  assert.equal(withReadingContext(error, inner), error);
  inner.readingStep = "records";
  assert.equal(
    withReadingContext(error, {
      readerKind: "consumer-dna",
      readingStep: "header",
      inputContainer: "plain",
    }),
    error,
  );
  assert.deepEqual(getReadingContext(error), {
    readerKind: "consumer-dna",
    readingStep: "decompress",
    inputContainer: "gzip",
  });
  const copy = getReadingContext(error);
  copy.readingStep = "records";
  assert.equal(getReadingContext(error).readingStep, "decompress");
  assert.equal(error.cause, cause);
  assert.equal(error.stack, stack);
  assert.equal(error.message, "Array buffer allocation failed");
  assert.deepEqual(Object.keys(error), []);
});

test("aborts and primitive thrown values remain untouched and have no reading context", () => {
  const abort = new DOMException("Cancelled", "AbortError");
  for (const value of [abort, null, undefined, privateText, 42, Symbol("cancel")]) {
    assert.equal(withReadingContext(value, { readerKind: "vcf", readingStep: "header" }), value);
    assert.deepEqual(getReadingContext(value), {});
  }
});

test("invalid context cannot override known reader context or add private values", () => {
  const error = new TypeError(privateText);
  withReadingContext(error, { readerKind: "consumer-dna", readingStep: "read-bytes" });
  withReadingContext(error, {
    readerKind: privateText,
    readingStep: privateText,
    filename: privateText,
    position: 123456,
  } as unknown as ReadingDetails);
  assert.deepEqual(getReadingContext(error), {
    readerKind: "consumer-dna",
    readingStep: "read-bytes",
  });
  assert.equal(JSON.stringify(getReadingContext(error)).includes(privateText), false);
});
