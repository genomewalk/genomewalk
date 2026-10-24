import * as Sentry from "@sentry/react";
import { AppError, errorDefinitions, errorResources, type ErrorCode } from "./app-error.ts";

const areas = [
  "file-open",
  "sample-open",
  "build-choice",
  "chapter",
  "results",
  "page",
  "unhandled",
  "publications",
  "illustration",
] as const;
const stages = ["prepare", "read-file", "reference-index", "reference-entries"] as const;
export type ErrorArea = (typeof areas)[number];
export type ErrorStage = (typeof stages)[number];
const hosts = new Set(["genomewalk.com", "www.genomewalk.com"]);
let reporting = false;

function diagnostic(error: unknown, type?: string, message?: string) {
  let code: ErrorCode = "UNEXPECTED_ERROR";
  if (error instanceof AppError && Object.hasOwn(errorDefinitions, error.code)) code = error.code;
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
  if (label === "Loading matched catalogue entries…") return "reference-entries";
  if (/^Loading the GRCh(?:37|38) catalogue index…$/.test(label)) return "reference-index";
  return "prepare";
}

/** Rebuild from an allowlist: parser exceptions can contain personal file data. */
export function sanitizeErrorEvent(
  event: Sentry.ErrorEvent,
  release: string,
  originalException?: unknown,
): Sentry.ErrorEvent | null {
  if (event.type !== undefined) return null;
  const exception = event.exception?.values?.[0];
  if (
    !exception ||
    exception.type === "AbortError" ||
    (originalException instanceof Error && originalException.name === "AbortError")
  )
    return null;
  const { code, resource, httpStatus } = diagnostic(
    originalException,
    exception.type,
    exception.value,
  );
  const [message, category, level] = errorDefinitions[code];
  const frames = (exception?.stacktrace?.frames || [])
    .flatMap((frame) => {
      try {
        const url = new URL(frame.filename || "");
        if (
          url.protocol !== "https:" ||
          !hosts.has(url.hostname) ||
          !/^\/assets\/[\w.-]+\.m?js$/.test(url.pathname)
        )
          return [];
        return [
          {
            filename: `${url.origin}${url.pathname}`,
            in_app: true,
            ...(Number.isSafeInteger(frame.lineno) && frame.lineno! > 0
              ? { lineno: frame.lineno }
              : {}),
            ...(Number.isSafeInteger(frame.colno) && frame.colno! > 0
              ? { colno: frame.colno }
              : {}),
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(-20);
  const area = areas.find((value) => value === event.tags?.["area"]) || "unhandled";
  const stage = stages.find((value) => value === event.tags?.["stage"]) || "prepare";
  const chapter = event.tags?.["chapter"];
  return {
    type: undefined,
    ...(/^[a-f0-9]{32}$/.test(event.event_id || "") ? { event_id: event.event_id } : {}),
    ...(typeof event.timestamp === "number" &&
    Number.isFinite(event.timestamp) &&
    event.timestamp > 0
      ? { timestamp: event.timestamp }
      : {}),
    level: category === "validation" && area === "sample-open" ? "error" : level,
    platform: "javascript",
    environment: "production",
    release,
    tags: {
      area,
      stage,
      category,
      error_code: code,
      ...(resource ? { resource } : {}),
      ...(httpStatus === undefined ? {} : { http_status: httpStatus }),
      ...(typeof chapter === "number" && Number.isInteger(chapter) && chapter >= 1 && chapter <= 9
        ? { chapter }
        : {}),
    },
    fingerprint:
      code === "UNEXPECTED_ERROR" || code.startsWith("JS_")
        ? ["{{ default }}", area]
        : ["genomewalk", code, area, resource || "none"],
    exception: {
      values: [
        {
          type: code,
          value: message,
          ...(frames.length ? { stacktrace: { frames } } : {}),
        },
      ],
    },
  };
}

export function initErrorReporting() {
  if (
    reporting ||
    !import.meta.env?.PROD ||
    typeof location === "undefined" ||
    !hosts.has(location.hostname)
  )
    return;
  let errorsSent = 0;
  const warnings = new Set<string>();
  Sentry.init({
    // Public browser project identifier, not an authentication secret.
    dsn: "https://2a88ff1fb2ddca549089bf2ee4fa5ccd@o517554.ingest.us.sentry.io/4512309671886848",
    defaultIntegrations: false,
    integrations: [Sentry.globalHandlersIntegration()],
    maxBreadcrumbs: 0,
    sendClientReports: false,
    tracePropagationTargets: [],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      frameContextLines: 0,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
    },
    beforeSend(event, hint) {
      hint.attachments = [];
      const clean = sanitizeErrorEvent(
        event,
        import.meta.env["VITE_APP_RELEASE"],
        hint.originalException,
      );
      if (!clean) return null;
      // Repeated invalid files must not use up the budget for actual failures.
      if (clean.level === "warning") {
        const key = clean.fingerprint!.join(":");
        if (warnings.has(key) || warnings.size >= 3) return null;
        warnings.add(key);
        return clean;
      }
      return errorsSent++ < 10 ? clean : null;
    },
    beforeBreadcrumb: () => null,
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    transportOptions: { fetchOptions: { credentials: "omit", referrerPolicy: "no-referrer" } },
  });
  reporting = true;
}

export function reportError(
  error: unknown,
  area: ErrorArea,
  stage: ErrorStage = "prepare",
  chapter?: number,
) {
  if (!reporting || (error instanceof Error && error.name === "AbortError")) return;
  Sentry.captureException(error, {
    tags: { area, stage, ...(chapter === undefined ? {} : { chapter }) },
  });
}
