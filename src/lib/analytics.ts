import posthog, { type CaptureResult } from "posthog-js/dist/module.no-external.js";
import { errorDefinitions, errorResources, type ErrorCode } from "./app-error.ts";
import {
  getClientEnvironment,
  browserNames,
  osNames,
  deviceTypes,
  type ClientEnvironment,
} from "./diagnostics/client-environment.ts";
import { fileExtensions, fileFormats, fileSizeBands } from "./diagnostics/file-context.ts";
import { safePublicFile } from "./public-file.ts";
import { sanitizeReadingProperties } from "./diagnostics/reading.ts";

// Public ingestion identifiers, not authentication secrets. Kept in the static build.
const projectToken = "phc_utRMfZS8cjErMnW89GxrJMEx7rHfCZA9XciPXV4aGh7M";
const apiHost = "https://us.i.posthog.com";
export const telemetryHosts = new Set(["genomewalk.com", "www.genomewalk.com"]);
export const errorAreas = [
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
export const errorStages = [
  "prepare",
  "read-file",
  "reference-index",
  "reference-entries",
] as const;
export const usageEvents = [
  "genome_open_started",
  "genome_opened",
  "genome_open_failed",
  "genome_ready",
  "build_choice_shown",
  "build_choice_confirmed",
  "build_choice_cancelled",
  "chapter_run_started",
  "chapter_run_completed",
  "chapter_run_failed",
  "results_started",
  "results_completed",
  "results_failed",
  "explanation_opened",
] as const;
export type UsageEvent = (typeof usageEvents)[number];
export interface UsageProperties {
  source?: "upload" | "sample";
  chapter?: number;
}
type Properties = Record<string, unknown>;
let initialized = false;
let previousPage: string | undefined;

export function canonicalPage(path: unknown): string | undefined {
  if (typeof path !== "string") return;
  const pathname = path.split(/[?#]/)[0];
  if (
    pathname === "/" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    /^\/chapter\/[1-9]$/.test(pathname || "")
  )
    return pathname;
  return undefined;
}

function chapterProperty(value: unknown): Properties {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9
    ? { chapter: value }
    : {};
}

export function safeAssetFrames(input: unknown): Properties[] {
  if (!Array.isArray(input)) return [];
  return input["flatMap"]((frame: unknown) => {
    if (!frame || typeof frame !== "object") return [];
    const value = frame as Properties;
    try {
      if (typeof value["filename"] !== "string") return [];
      const url = new URL(value["filename"]);
      if (
        url.protocol !== "https:" ||
        !telemetryHosts.has(url.hostname) ||
        url.port !== "" ||
        !/^\/assets\/[\w.-]+\.m?js$/.test(url.pathname)
      )
        return [];
      const line = value["lineno"];
      const column = value["colno"];
      // PostHog's RawJSFrame requires a function; never preserve the original name.
      // Its optional FrameLocation contains a complete pair of unsigned 32-bit values.
      const hasLocation =
        typeof line === "number" &&
        Number.isInteger(line) &&
        line > 0 &&
        line <= 0xffffffff &&
        typeof column === "number" &&
        Number.isInteger(column) &&
        column >= 0 &&
        column <= 0xffffffff;
      return [
        {
          platform: "web:javascript",
          function: "<anonymous>",
          filename: `${url.origin}${url.pathname}`,
          in_app: true,
          ...(hasLocation ? { lineno: line, colno: column } : {}),
        },
      ];
    } catch {
      return [];
    }
  }).slice(-20);
}

/** Final outbound boundary: never forward SDK-enriched properties or raw exceptions. */
export function sanitizeAnalyticsEvent(
  event: CaptureResult,
  visitId: string,
  release: string,
  environment: ClientEnvironment,
): CaptureResult | null {
  const input: Properties = event.properties || {};
  const browser = browserNames.find((value) => value === environment.browser_name);
  const os = osNames.find((value) => value === environment.os_name);
  const device = deviceTypes.find((value) => value === environment.device_type);
  const major = environment.browser_major;
  const properties: Properties = {
    token: projectToken,
    distinct_id: visitId,
    $session_id: visitId,
    $process_person_profile: false,
    $geoip_disable: true,
    environment: "production",
    release,
    ...(browser ? { browser_name: browser } : {}),
    ...(browser &&
    browser !== "Other" &&
    browser !== "Unknown" &&
    typeof major === "string" &&
    /^[1-9]\d{0,2}$/.test(major)
      ? { browser_major: major }
      : {}),
    ...(os ? { os_name: os } : {}),
    ...(device ? { device_type: device } : {}),
  };
  if (event.event === "$exception") {
    const code =
      typeof input["error_code"] === "string" &&
      Object.hasOwn(errorDefinitions, input["error_code"])
        ? (input["error_code"] as ErrorCode)
        : undefined;
    if (!code) return null;
    const [message, category, level] = errorDefinitions[code];
    const area = errorAreas.find((value) => value === input["area"]) || "unhandled";
    const stage = errorStages.find((value) => value === input["stage"]) || "prepare";
    const resource = errorResources.find((value) => value === input["resource"]);
    const publicFile = safePublicFile(
      typeof input["public_file"] === "string" ? input["public_file"] : undefined,
      resource,
    );
    const extension = fileExtensions.find((value) => value === input["file_extension"]);
    const format = fileFormats.find((value) => value === input["file_format"]);
    const size = fileSizeBands.find((value) => value === input["file_size_band"]);
    const exception = Array.isArray(input["$exception_list"])
      ? input["$exception_list"][0]
      : undefined;
    const frames = safeAssetFrames(exception?.stacktrace?.frames);
    const status = input["http_status"];
    const fingerprint = ["genomewalk", code, area, resource || "none"];
    if ((code === "UNEXPECTED_ERROR" || code.startsWith("JS_")) && frames[0])
      fingerprint.push(
        `${frames[0]["filename"]}:${frames[0]["lineno"] || 0}:${frames[0]["colno"] || 0}`,
      );
    Object.assign(properties, {
      error_code: code,
      category,
      area,
      stage,
      $exception_level: category === "validation" && area === "sample-open" ? "error" : level,
      $exception_fingerprint: fingerprint.join(":"),
      $exception_list: [
        {
          type: code,
          value: message,
          mechanism: { type: "generic", handled: area !== "unhandled" },
          ...(frames.length ? { stacktrace: { type: "raw", frames } } : {}),
        },
      ],
      ...chapterProperty(input["chapter"]),
      ...(resource ? { resource } : {}),
      ...(publicFile ? { public_file: publicFile } : {}),
      ...(resource &&
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
        ? { http_status: status }
        : {}),
      ...(extension ? { file_extension: extension } : {}),
      ...(format ? { file_format: format } : {}),
      ...(size ? { file_size_band: size } : {}),
      ...sanitizeReadingProperties(input),
    });
  } else if (event.event === "$pageview") {
    const path = canonicalPage(input["$pathname"]);
    if (!path) return null;
    properties["$pathname"] = path;
    properties["$current_url"] = `https://genomewalk.com${path}`;
  } else if ((usageEvents as readonly string[]).includes(event.event)) {
    Object.assign(
      properties,
      chapterProperty(input["chapter"]),
      input["source"] === "upload" || input["source"] === "sample"
        ? { source: input["source"] }
        : {},
    );
  } else return null;
  return {
    uuid: event.uuid,
    event: event.event,
    properties,
    ...(event.timestamp instanceof Date && Number.isFinite(event.timestamp.getTime())
      ? { timestamp: event.timestamp }
      : {}),
  };
}

export function initAnalytics(): boolean {
  if (initialized) return true;
  if (
    !import.meta.env?.PROD ||
    typeof location === "undefined" ||
    !telemetryHosts.has(location.hostname)
  )
    return false;
  try {
    const visitId = crypto.randomUUID();
    const environment = getClientEnvironment();
    const release = import.meta.env["VITE_APP_RELEASE"];
    const warnings = new Set<string>();
    let errorsSent = 0;
    // The pinned SDK spreads these RequestInit fields into fetch requests.
    const fetchOptions: RequestInit & { cache: RequestCache } = {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    };
    posthog.init(projectToken, {
      api_host: apiHost,
      ui_host: "https://us.posthog.com",
      persistence: "memory",
      bootstrap: { distinctID: visitId, isIdentifiedID: false },
      person_profiles: "never",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      capture_performance: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_webmcp: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_surveys_automatic_display: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      advanced_disable_feature_flags: true,
      advanced_disable_feature_flags_on_first_load: true,
      advanced_disable_toolbar_metrics: true,
      remote_config_refresh_interval_ms: 0,
      save_referrer: false,
      save_campaign_params: false,
      disable_capture_url_hashes: true,
      disable_scroll_properties: true,
      internal_or_test_user_hostname: null,
      request_batching: false,
      disable_compression: true,
      api_transport: "fetch",
      // A header also prevents the SDK switching to sendBeacon during pagehide.
      request_headers: { "Content-Type": "application/json" },
      fetch_options: fetchOptions,
      __preview_disable_xhr_credentials: true,
      before_send(event) {
        const clean = sanitizeAnalyticsEvent(event, visitId, release, environment);
        if (!clean) return null;
        if (clean.event === "$exception") {
          if (clean.properties["$exception_level"] === "warning") {
            const key = JSON.stringify([
              clean.properties["$exception_fingerprint"],
              clean.properties["header_provider"],
              clean.properties["failure_reason"],
              clean.properties["format_reason"],
            ]);
            if (warnings.has(key) || warnings.size >= 3) return null;
            warnings.add(key);
          } else if (errorsSent++ >= 10) return null;
        }
        return clean;
      },
    });
    initialized = true;
  } catch {
    /* Telemetry must never prevent opening or reading a genome. */
  }
  return initialized;
}

export function trackEvent(name: UsageEvent, properties: UsageProperties = {}) {
  if (!initialized) return;
  try {
    posthog.capture(name, properties, { transport: "fetch" });
  } catch {
    /* Best effort. */
  }
}

export function trackPageview(path: string) {
  if (!initialized) return;
  const page = canonicalPage(path);
  if (!page || page === previousPage) return;
  previousPage = page;
  try {
    posthog.capture("$pageview", { $pathname: page }, { transport: "fetch" });
  } catch {
    /* Best effort. */
  }
}

export function captureAppException(error: Error, properties: Properties) {
  if (!initialized) return;
  try {
    posthog.captureException(error, properties);
  } catch {
    /* Best effort. */
  }
}
