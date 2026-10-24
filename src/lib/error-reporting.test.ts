import assert from "node:assert/strict";
import test from "node:test";
import { prepareErrorReport, reportingStage } from "./error-reporting.ts";
import { AppError, errorDefinitions, type ErrorCode } from "./app-error.ts";

const privateText = "SYNTHETIC_PRIVATE_GENOME.vcf.gz GATTACAGATTACA";

test("typed errors retain reviewed diagnosis without the original message or cause", () => {
  const original = new AppError("HTTP_ERROR", privateText, {
    resource: "catalogue-index",
    httpStatus: 503,
    publicFile: "https://genomewalk.com/ref/GRCh38/catalog.index.json.gz?token=private#private",
  });
  original.cause = new Error(privateText);
  original.stack = `AppError: ${privateText}\n    at read (https://genomewalk.com/assets/reference-abc.js:5:17)`;
  const report = prepareErrorReport(original, "results", "reference-index", 7);
  assert.ok(report);
  assert.equal(report.error.name, "HTTP_ERROR");
  assert.equal(report.error.message, errorDefinitions.HTTP_ERROR[0]);
  assert.equal(report.error.cause, undefined);
  assert.equal(report.properties.resource, "catalogue-index");
  assert.equal(report.properties.public_file, "/ref/GRCh38/catalog.index.json.gz");
  assert.equal(report.properties.http_status, 503);
  assert.equal(report.properties.chapter, 7);
  assert.match(report.error.stack!, /assets\/reference-abc\.js:5:17/);
  assert.equal(JSON.stringify(report).includes(privateText), false);
  assert.equal(report.error.stack!.includes(privateText), false);
  assert.equal(original.message, privateText);
});

test("error preparation excludes unknown, mismatched and private download paths", () => {
  for (const publicFile of [
    privateText,
    `/ref/GRCh38/${privateText}`,
    "https://private.example/ref/GRCh38/catalog.index.json.gz",
    "/samples/HG002_GRCh38.vcf.gz",
  ]) {
    const report = prepareErrorReport(
      new AppError("NETWORK_FAILED", privateText, { resource: "catalogue-index", publicFile }),
      "results",
      "reference-index",
    );
    assert.equal(report?.properties.public_file, undefined);
    assert.equal(JSON.stringify(report).includes(privateText), false);
  }
  assert.equal(
    prepareErrorReport(
      new AppError("NETWORK_FAILED", undefined, {
        publicFile: "/ref/GRCh38/catalog.index.json.gz",
      }),
      "results",
    )?.properties.public_file,
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
  assert.equal(reportingStage("Loading matched catalogue entries…"), "reference-entries");
  assert.equal(reportingStage("Loading the GRCh37 catalogue index…"), "reference-index");
  assert.equal(reportingStage("Loading the GRCh38 catalogue index…"), "reference-index");
  assert.equal(reportingStage(privateText), "prepare");
});
