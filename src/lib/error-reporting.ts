import * as Sentry from "@sentry/react";

const areas = [
  "file-open",
  "sample-open",
  "build-choice",
  "chapter",
  "results",
  "page",
  "unhandled",
] as const;
const stages = ["prepare", "read-file", "reference-index", "reference-entries"] as const;
export type ErrorArea = (typeof areas)[number];
export type ErrorStage = (typeof stages)[number];
const hosts = new Set(["genomewalk.com", "www.genomewalk.com"]);
let reporting = false;

export function reportingStage(label: string): ErrorStage {
  if (label === "Loading matched catalogue entries…") return "reference-entries";
  if (/^Loading the GRCh(?:37|38) catalogue index…$/.test(label)) return "reference-index";
  return "prepare";
}

/** Rebuild from an allowlist: parser exceptions can contain personal file data. */
export function sanitizeErrorEvent(
  event: Sentry.ErrorEvent,
  release: string,
): Sentry.ErrorEvent | null {
  if (event.type !== undefined) return null;
  const exception = event.exception?.values?.[0];
  if (!exception || exception.type === "AbortError") return null;
  const network = [
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
  ].includes(exception?.value || "");
  const range =
    exception?.value ===
    "The static host must serve unchanged files with HTTP 206 byte-range support.";
  const category = network ? "network" : range ? "range-response" : "application";
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
  return {
    type: undefined,
    ...(/^[a-f0-9]{32}$/.test(event.event_id || "") ? { event_id: event.event_id } : {}),
    ...(typeof event.timestamp === "number" &&
    Number.isFinite(event.timestamp) &&
    event.timestamp > 0
      ? { timestamp: event.timestamp }
      : {}),
    level: "error",
    platform: "javascript",
    environment: "production",
    release,
    tags: { area, stage, category },
    exception: {
      values: [
        {
          type: "GenomewalkError",
          value: network
            ? "Network request failed"
            : range
              ? "Invalid byte-range response"
              : "Application operation failed",
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
  let sent = 0;
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
      const clean = sanitizeErrorEvent(event, import.meta.env["VITE_APP_RELEASE"]);
      // Bound noisy failures without a persistent user/session identifier.
      return clean && sent++ < 10 ? clean : null;
    },
    beforeBreadcrumb: () => null,
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    transportOptions: { fetchOptions: { credentials: "omit", referrerPolicy: "no-referrer" } },
  });
  reporting = true;
}

export function reportError(error: unknown, area: ErrorArea, stage: ErrorStage = "prepare") {
  if (!reporting || (error instanceof Error && error.name === "AbortError")) return;
  Sentry.captureException(error, { tags: { area, stage } });
}
