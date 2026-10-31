import assert from "node:assert/strict";
import test from "node:test";
import { prepareErrorReport, reportingStage } from "./error-reporting.ts";
import { AppError, errorDefinitions, type ErrorCode, type ErrorDetails } from "./app-error.ts";
import { withReadingContext } from "./diagnostics/reading.ts";

const privateText = "SYNTHETIC_PRIVATE_GENOME.vcf.gz GATTACAGATTACA";

test("format rejection reports reviewed header categories without raw header values", () => {
  const report = prepareErrorReport(
    new AppError("DNA_FORMAT_UNSUPPORTED", privateText, {
      headerProvider: "23andMe",
      headerLayout: "allele-pair",
      formatReason: "columns-mismatch",
    }),
    "file-open",
    "read-file",
  );
  assert.ok(report);
  assert.equal(report.properties["header_provider"], "23andMe");
  assert.equal(report.properties["header_layout"], "allele-pair");
  assert.equal(report.properties["format_reason"], "columns-mismatch");
  assert.equal(report.error.message, errorDefinitions.DNA_FORMAT_UNSUPPORTED[0]);
  assert.equal(JSON.stringify(report).includes(privateText), false);
});

test("reading diagnostics reject unreviewed values", () => {
  for (const value of [privateText, { value: privateText }, 4, null]) {
    const report = prepareErrorReport(
      new AppError("DNA_FORMAT_UNSUPPORTED", privateText, {
        headerProvider: value,
        headerLayout: value,
        formatReason: value,
        readerKind: value,
        readingStep: value,
        inputContainer: value,
        textEncoding: value,
        failureReason: value,
      } as ErrorDetails),
      "file-open",
    );
    assert.equal(report?.properties["header_provider"], undefined);
    assert.equal(report?.properties["header_layout"], undefined);
    assert.equal(report?.properties["format_reason"], undefined);
    assert.equal(report?.properties["reader_kind"], undefined);
    assert.equal(report?.properties["reading_step"], undefined);
    assert.equal(report?.properties["input_container"], undefined);
    assert.equal(report?.properties["text_encoding"], undefined);
    assert.equal(report?.properties["failure_reason"], undefined);
    assert.equal(JSON.stringify(report).includes(privateText), false);
  }
});

test("specific AppError details override outer reading context without losing other safe context", () => {
  const original = new AppError("ARCHIVE_NO_DNA", privateText, {
    readingStep: "select-payload",
    headerProvider: "unrecognized",
    headerLayout: "genotype",
    formatReason: "provider-unrecognized",
  });
  withReadingContext(original, {
    readerKind: "consumer-dna",
    readingStep: "decompress",
    inputContainer: "zip",
    textEncoding: "utf8-bom",
  });
  const report = prepareErrorReport(original, "file-open", "read-file")!;
  assert.equal(report.properties["reader_kind"], "consumer-dna");
  assert.equal(report.properties["reading_step"], "select-payload");
  assert.equal(report.properties["input_container"], "zip");
  assert.equal(report.properties["text_encoding"], "utf8-bom");
  assert.equal(report.properties["header_provider"], "unrecognized");
  assert.equal(report.properties["header_layout"], "genotype");
  assert.equal(report.properties["format_reason"], "provider-unrecognized");
  assert.equal(JSON.stringify(report).includes(privateText), false);
  const invalidDetails = new AppError("DNA_HEADER_MISSING", privateText, {
    readingStep: privateText,
  } as unknown as ErrorDetails);
  withReadingContext(invalidDetails, { readerKind: "consumer-dna", readingStep: "header" });
  const sanitized = prepareErrorReport(invalidDetails, "file-open")!;
  assert.equal(sanitized.properties["reading_step"], "header");
  assert.equal(JSON.stringify(sanitized).includes(privateText), false);
});

test("native reading failures retain their classification and safe context without original values", () => {
  for (const [original, code] of [
    [
      new RangeError("Array buffer allocation failed", { cause: new Error(privateText) }),
      "BROWSER_ALLOCATION_FAILED",
    ],
    [new TypeError(privateText), "JS_TYPE_ERROR"],
    [new DOMException(privateText, "NotReadableError"), "FILE_READ_FAILED"],
  ] as const) {
    const message = original.message;
    const stack = original.stack;
    const wrapped = withReadingContext(original, {
      readerKind: "vcf",
      readingStep: "read-bytes",
      inputContainer: "bgzf",
    });
    assert.equal(wrapped, original);
    const report = prepareErrorReport(wrapped, "file-open", "read-file")!;
    assert.equal(report.error.name, code);
    assert.equal(report.properties["reader_kind"], "vcf");
    assert.equal(report.properties["reading_step"], "read-bytes");
    assert.equal(report.properties["input_container"], "bgzf");
    assert.equal(original.message, message);
    assert.equal(original.stack, stack);
    assert.equal(report.error.cause, undefined);
    assert.equal(JSON.stringify(report).includes(privateText), false);
  }
});

test("typed errors retain reviewed diagnosis without the original message or cause", () => {
  const original = new AppError("HTTP_ERROR", privateText, {
    resource: "catalogue-index",
    httpStatus: 503,
    publicFile: "https://genomewalk.com/ref/GRCh38/catalog.meta.json?token=private#private",
  });
  original.cause = new Error(privateText);
  original.stack = `AppError: ${privateText}\n    at read (https://genomewalk.com/assets/reference-abc.js:5:17)`;
  const report = prepareErrorReport(original, "results", "reference-index", 7);
  assert.ok(report);
  assert.equal(report.error.name, "HTTP_ERROR");
  assert.equal(report.error.message, errorDefinitions.HTTP_ERROR[0]);
  assert.equal(report.error.cause, undefined);
  assert.equal(report.properties["resource"], "catalogue-index");
  assert.equal(report.properties["public_file"], "/ref/GRCh38/catalog.meta.json");
  assert.equal(report.properties["http_status"], 503);
  assert.equal(report.properties["chapter"], 7);
  assert.match(report.error.stack!, /assets\/reference-abc\.js:5:17/);
  assert.equal(JSON.stringify(report).includes(privateText), false);
  assert.equal(report.error.stack!.includes(privateText), false);
  assert.equal(original.message, privateText);
});

test("error preparation excludes unknown, mismatched and private download paths", () => {
  for (const publicFile of [
    privateText,
    `/ref/GRCh38/${privateText}`,
    "https://private.example/ref/GRCh38/catalog.meta.json",
    "/samples/HG002_GRCh38.vcf.gz",
  ]) {
    const report = prepareErrorReport(
      new AppError("NETWORK_FAILED", privateText, { resource: "catalogue-index", publicFile }),
      "results",
      "reference-index",
    );
    assert.equal(report?.properties["public_file"], undefined);
    assert.equal(JSON.stringify(report).includes(privateText), false);
  }
  assert.equal(
    prepareErrorReport(
      new AppError("NETWORK_FAILED", undefined, {
        publicFile: "/ref/GRCh38/catalog.meta.json",
      }),
      "results",
    )?.properties["public_file"],
    undefined,
  );
});

test("all supported diagnostics produce fixed safe exception names and messages", () => {
  for (const code of Object.keys(errorDefinitions) as ErrorCode[]) {
    const report = prepareErrorReport(new AppError(code, privateText), "file-open");
    assert.equal(report?.error.name, code);
    assert.equal(report?.error.message, errorDefinitions[code][0]);
  }
});

test("only genuine known AppError codes and native error classes classify failures", () => {
  for (const value of [{ code: "HTTP_ERROR", message: privateText }, privateText, null, 42]) {
    assert.equal(prepareErrorReport(value, "file-open")?.error.name, "UNEXPECTED_ERROR");
  }
  for (const code of ["__proto__", "constructor", privateText]) {
    assert.equal(
      prepareErrorReport(new AppError(code as ErrorCode, privateText), "file-open")?.error.name,
      "UNEXPECTED_ERROR",
    );
  }
  assert.equal(
    prepareErrorReport(new TypeError(privateText), "file-open")?.error.name,
    "JS_TYPE_ERROR",
  );
  assert.equal(
    prepareErrorReport(new RangeError(privateText), "file-open")?.error.name,
    "JS_RANGE_ERROR",
  );
  assert.equal(
    prepareErrorReport(new SyntaxError(privateText), "file-open")?.error.name,
    "JS_SYNTAX_ERROR",
  );
  assert.equal(
    prepareErrorReport(new ReferenceError(privateText), "file-open")?.error.name,
    "JS_REFERENCE_ERROR",
  );
});

test("known native download errors are classified without forwarding their text", () => {
  for (const message of [
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
  ]) {
    assert.equal(
      prepareErrorReport(new TypeError(message), "results")?.error.name,
      "NETWORK_FAILED",
    );
  }
  assert.equal(
    prepareErrorReport(new TypeError(`Failed to fetch ${privateText}`), "results")?.error.name,
    "JS_TYPE_ERROR",
  );
  assert.equal(
    prepareErrorReport(new DOMException(privateText, "NotReadableError"), "file-open")?.error.name,
    "FILE_READ_FAILED",
  );
  assert.equal(
    prepareErrorReport(new DOMException(privateText, "TimeoutError"), "sample-open")?.error.name,
    "NETWORK_TIMEOUT",
  );
  assert.equal(
    prepareErrorReport(new DOMException(privateText, "AbortError"), "sample-open"),
    null,
  );
});

test("native capacity reports use reviewed diagnoses and preserve only safe original asset frames", () => {
  for (const [message, code] of [
    ["Array buffer allocation failed", "BROWSER_ALLOCATION_FAILED"],
    ["Out of memory", "BROWSER_ALLOCATION_FAILED"],
    ["Invalid string length", "BROWSER_DATA_LIMIT"],
    ["Invalid array length", "JS_RANGE_ERROR"],
  ] as const) {
    const original = new RangeError(message, { cause: new Error(privateText) });
    original.stack = `RangeError: ${message}\n    at ${privateText} (https://genomewalk.com/assets/reader-abc.js:12:34)\n    at file:///private/${privateText}:1:2`;
    const report = prepareErrorReport(original, "file-open", "read-file");
    assert.ok(report);
    assert.equal(report.error.name, code);
    assert.equal(report.error.message, errorDefinitions[code][0]);
    assert.equal(report.error.cause, undefined);
    assert.match(report.error.stack!, /assets\/reader-abc\.js:12:34/);
    assert.equal(report.error.stack!.includes(privateText), false);
    assert.equal(JSON.stringify(report).includes(privateText), false);
    assert.equal(report.properties["stage"], "read-file");
  }
  assert.equal(
    prepareErrorReport("out of memory", "file-open")?.error.name,
    "BROWSER_ALLOCATION_FAILED",
  );
  assert.equal(
    prepareErrorReport(
      new AppError("DNA_HEADER_MISSING", "Array buffer allocation failed"),
      "file-open",
    )?.error.name,
    "DNA_HEADER_MISSING",
  );
});

test("multiline exception messages cannot be mistaken for asset stack frames", () => {
  const message = "secret line\n    at https://genomewalk.com/assets/private-value.js:1:2";
  const original = new Error(message);
  original.stack = `Error: ${message}\n    at actual (https://genomewalk.com/assets/app-abc.js:3:4)`;
  const report = prepareErrorReport(original, "unhandled");
  assert.ok(report);
  assert.equal(report.error.stack!.includes("private-value"), false);
  assert.equal(report.error.stack!.includes("secret"), false);
  assert.match(report.error.stack!, /assets\/app-abc\.js:3:4/);
});

test("reporting stage uses fixed vocabulary rather than arbitrary progress text", () => {
  assert.equal(
    reportingStage("Matching the genome and catalogue as they stream…"),
    "reference-entries",
  );
  assert.equal(reportingStage("Loading the GRCh37 catalogue summary…"), "reference-index");
  assert.equal(reportingStage("Loading the GRCh38 catalogue summary…"), "reference-index");
  assert.equal(reportingStage(privateText), "prepare");
});
