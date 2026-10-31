import { AppError, errorDefinitions, errorResources, type ErrorCode } from "./app-error.ts";
import {
  captureAppException,
  initAnalytics,
  errorAreas,
  errorStages,
  safeAssetFrames,
} from "./analytics.ts";
import type { FileDiagnostics } from "./diagnostics/file-context.ts";
import { classifyRuntimeFailure } from "./diagnostics/runtime-failure.ts";
import {
  getReadingContext,
  readingProperties,
  sanitizeReadingDetails,
} from "./diagnostics/reading.ts";
import { safePublicFile } from "./public-file.ts";

export type ErrorArea = (typeof errorAreas)[number];
export type ErrorStage = (typeof errorStages)[number];
let reporting = false;

function diagnostic(error: unknown, type?: string, message?: string) {
  let code: ErrorCode = "UNEXPECTED_ERROR";
  const runtimeCode = classifyRuntimeFailure(error);
  if (error instanceof AppError && Object.hasOwn(errorDefinitions, error.code)) code = error.code;
  else if (runtimeCode) code = runtimeCode;
  else if (
    ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."].includes(
      message || "",
    )
  )
    code = "NETWORK_FAILED";
  else {
    const nativeCodes: Record<string, ErrorCode> = {
      TypeError: "JS_TYPE_ERROR",
      ReferenceError: "JS_REFERENCE_ERROR",
      RangeError: "JS_RANGE_ERROR",
      SyntaxError: "JS_SYNTAX_ERROR",
      NotReadableError: "FILE_READ_FAILED",
      SecurityError: "FILE_READ_FAILED",
      TimeoutError: "NETWORK_TIMEOUT",
    };
    if (type && Object.hasOwn(nativeCodes, type)) code = nativeCodes[type]!;
  }
  const details = error instanceof AppError ? error.details : undefined;
  const resource = errorResources.find((value) => value === details?.resource);
  const status = details?.httpStatus;
  return {
    code,
    resource,
    publicFile: safePublicFile(details?.publicFile, resource),
    reading: { ...getReadingContext(error), ...sanitizeReadingDetails(details) },
    httpStatus:
      resource &&
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
        ? status
        : undefined,
  };
}

export function reportingStage(label: string): ErrorStage {
  if (
    [
      "Matching the genome and catalogue as they stream…",
      "Reading evidence for matched variants…",
      "Reading catalogue variant identities…",
      "Reading evidence for your matches…",
      "Preparing catalogue identities for this file’s record order…",
    ].includes(label)
  )
    return "reference-entries";
  if (/^Loading the GRCh(?:37|38) catalogue summary…$/.test(label)) return "reference-index";
  return "prepare";
}

/** Build a fresh exception before the SDK sees it; never attach the original cause or message. */
export function prepareErrorReport(
  error: unknown,
  area: ErrorArea,
  stage: ErrorStage = "prepare",
  chapter?: number,
  file?: FileDiagnostics,
) {
  if (error instanceof Error && error.name === "AbortError") return null;
  const { code, resource, publicFile, httpStatus, reading } = diagnostic(
    error,
    error instanceof Error ? error.name : undefined,
    error instanceof Error ? error.message : undefined,
  );
  const safe = new Error(errorDefinitions[code][0]);
  safe.name = code;
  const header = error instanceof Error ? `${error.name}: ${error.message}` : "";
  const stack = error instanceof Error && typeof error.stack === "string" ? error.stack : "";
  // A multiline parser message can resemble an asset URL; it is never a stack frame.
  const trace = header && stack.startsWith(header) ? stack.slice(header.length) : stack;
  const rawFrames = trace
    ? trace.split("\n").flatMap((line) => {
        const match = /(https:\/\/[^\s)]+):(\d+):(\d+)\)?$/.exec(line);
        return match
          ? [{ filename: match[1], lineno: Number(match[2]), colno: Number(match[3]) }]
          : [];
      })
    : [];
  const frames = safeAssetFrames(rawFrames);
  safe.stack =
    `${code}: ${safe.message}` +
    frames
      .map(
        (frame) => `\n    at ${frame["filename"]}:${frame["lineno"] || 1}:${frame["colno"] || 1}`,
      )
      .join("");
  const properties: Record<string, unknown> = {
    ...file,
    error_code: code,
    area,
    stage,
    ...(chapter === undefined ? {} : { chapter }),
    ...(resource ? { resource } : {}),
    ...(publicFile ? { public_file: publicFile } : {}),
    ...(httpStatus === undefined ? {} : { http_status: httpStatus }),
    ...readingProperties(reading),
  };
  return { error: safe, properties };
}

export function initErrorReporting() {
  if (reporting || !initAnalytics()) return;
  reporting = true;
  window.addEventListener("error", (event) => reportError(event.error, "unhandled"));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason, "unhandled"));
}

export function reportError(
  error: unknown,
  area: ErrorArea,
  stage: ErrorStage = "prepare",
  chapter?: number,
  file?: FileDiagnostics,
) {
  if (!reporting) return;
  const report = prepareErrorReport(error, area, stage, chapter, file);
  if (report) captureAppException(report.error, report.properties);
}
