import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../app-error.ts";
import { classifyRuntimeFailure, runtimeFailureMessage } from "./runtime-failure.ts";

function internalError(message: string) {
  const error = new Error(message);
  error.name = "InternalError";
  return error;
}

test("specific browser allocation and value-size failures receive precise recovery guidance", () => {
  for (const error of [
    new RangeError("Array buffer allocation failed"),
    new RangeError("Out of memory"),
    internalError("out of memory"),
    "out of memory",
  ]) {
    assert.equal(classifyRuntimeFailure(error), "BROWSER_ALLOCATION_FAILED");
    assert.equal(
      runtimeFailureMessage(error),
      "Your browser could not allocate enough memory to continue. Close other tabs and try again, or use another browser or device.",
    );
  }
  for (const error of [
    new RangeError("Invalid string length"),
    internalError("allocation size overflow"),
  ]) {
    assert.equal(classifyRuntimeFailure(error), "BROWSER_DATA_LIMIT");
    assert.equal(
      runtimeFailureMessage(error),
      "Your browser reached its size limit for a text or binary value. Try another browser or device, or choose a smaller supported file.",
    );
  }
});

test("ambiguous range failures and untrusted error-shaped objects do not imply capacity failures", () => {
  for (const error of [
    new RangeError("Invalid array length"),
    new RangeError("Invalid array buffer length"),
    new RangeError("Invalid typed array length: -1"),
    new RangeError("Maximum call stack size exceeded"),
    new RangeError("Invalid count value: Infinity"),
    new RangeError("Array buffer allocation failed PRIVATE_FILENAME"),
    new Error("Array buffer allocation failed"),
    new DOMException("Quota exceeded", "QuotaExceededError"),
    { name: "RangeError", message: "Array buffer allocation failed" },
    "Out of memory",
    "out of memory PRIVATE_FILENAME",
    null,
  ]) {
    assert.equal(classifyRuntimeFailure(error), null);
    assert.equal(runtimeFailureMessage(error), null);
  }
});

test("typed application errors retain precedence and recognized typed failures use safe recovery text", () => {
  const invalidFile = new AppError("DNA_HEADER_MISSING", "out of memory");
  assert.equal(classifyRuntimeFailure(invalidFile), null);
  assert.equal(runtimeFailureMessage(invalidFile), null);
  for (const code of ["BROWSER_ALLOCATION_FAILED", "BROWSER_DATA_LIMIT"] as const) {
    const error = new AppError(code, "PRIVATE_FILENAME");
    assert.equal(classifyRuntimeFailure(error), null);
    assert.ok(runtimeFailureMessage(error));
    assert.ok(!runtimeFailureMessage(error)?.includes("PRIVATE_FILENAME"));
  }
});

test("native file-read failures give recovery steps without claiming a size or memory problem", () => {
  for (const error of [
    new DOMException("PRIVATE_FILENAME", "NotReadableError"),
    new DOMException("PRIVATE_FILENAME", "SecurityError"),
    new AppError("FILE_READ_FAILED", "PRIVATE_FILENAME"),
  ]) {
    assert.equal(classifyRuntimeFailure(error), null);
    assert.equal(
      runtimeFailureMessage(error),
      "Your browser could not read this file. Check that it is available on this device, then choose it again.",
    );
  }
});
