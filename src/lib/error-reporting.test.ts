import assert from "node:assert/strict";
import test from "node:test";
import type { ErrorEvent, Event, StackFrame } from "@sentry/react";
import { reportingStage, sanitizeErrorEvent } from "./error-reporting.ts";

const filename = "SYNTHETIC_PRIVATE_GENOME.vcf.gz";
const dna = "GATTACAGATTACAGATTACA";
const privateText = `${filename}:${dna}`;
const release = "genomewalk@test-release";
const eventId = "0123456789abcdef0123456789abcdef";

function errorEvent(value = privateText, extra: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, exception: { values: [{ type: "Error", value }] }, ...extra };
}

test("error reports discard private event fields, exception details and stack context", () => {
  const rich = errorEvent(privateText, {
    event_id: eventId,
    timestamp: 1_792_800_000,
    message: privateText,
    logentry: { message: privateText, params: [privateText] },
    level: "fatal",
    platform: privateText,
    logger: privateText,
    server_name: filename,
    release: privateText,
    dist: privateText,
    environment: privateText,
    sdk: { name: privateText, version: privateText },
    request: {
      url: `https://genomewalk.com/chapter/9?file=${filename}#${dna}`,
      headers: { Range: "bytes=123-456", "X-Private": privateText },
      data: privateText,
      cookies: { selected: privateText },
    },
    transaction: privateText,
    modules: { [filename]: dna },
    fingerprint: [privateText],
    breadcrumbs: [{ message: privateText, data: { selected: privateText } }],
    contexts: { genome: { filename, dna } },
    tags: { area: "results", stage: "reference-entries", filename, dna },
    extra: { filename, dna },
    user: { id: filename, email: `${dna}@example.invalid`, ip_address: "192.0.2.1" },
    sdkProcessingMetadata: { dynamicSamplingContext: { transaction: privateText } },
    exception: {
      values: [
        {
          type: privateText,
          value: privateText,
          module: privateText,
          mechanism: { type: privateText, data: { filename, dna } },
          stacktrace: {
            frames: [
              {
                filename: `https://genomewalk.com/assets/app-a1b2c3d4.js?file=${filename}#${dna}`,
                function: privateText,
                module: privateText,
                abs_path: `/Users/example/${filename}`,
                context_line: dna,
                pre_context: [privateText],
                post_context: [privateText],
                vars: { filename, dna },
                module_metadata: { filename, dna },
                debug_id: privateText,
                lineno: 42,
                colno: 17,
                in_app: false,
              },
            ],
          },
        },
        { type: "PrivateCause", value: privateText },
      ],
    },
  });
  const original = JSON.stringify(rich);
  const clean = sanitizeErrorEvent(rich, release);
  assert.ok(clean);
  assert.equal(JSON.stringify(rich), original, "sanitizing must not mutate the original error");
  const serialized = JSON.stringify(clean);
  for (const secret of [filename, dna, "192.0.2.1", "bytes=123-456", "PrivateCause"])
    assert.ok(!serialized.includes(secret), `report contains ${secret}`);
  const allowed = new Set([
    "type",
    "event_id",
    "timestamp",
    "level",
    "platform",
    "environment",
    "release",
    "tags",
    "exception",
  ]);
  assert.ok(Object.keys(clean).every((key) => allowed.has(key)));
  assert.equal(clean.release, release);
  assert.equal(clean.timestamp, rich.timestamp);
  assert.equal(clean.environment, "production");
  assert.equal(clean.level, "error");
  assert.equal(clean.platform, "javascript");
  assert.deepEqual(clean.tags, {
    area: "results",
    stage: "reference-entries",
    category: "application",
  });
  assert.deepEqual(clean.exception?.values, [
    {
      type: "GenomewalkError",
      value: "Application operation failed",
      stacktrace: {
        frames: [
          {
            filename: "https://genomewalk.com/assets/app-a1b2c3d4.js",
            in_app: true,
            lineno: 42,
            colno: 17,
          },
        ],
      },
    },
  ]);
});

test("error reports drop cancelled operations and non-error event types", () => {
  assert.equal(
    sanitizeErrorEvent(
      errorEvent(privateText, {
        exception: { values: [{ type: "AbortError", value: privateText }] },
      }),
      release,
    ),
    null,
  );
  for (const type of ["transaction", "profile", "replay_event", "feedback"] as const) {
    const event: Event = { ...errorEvent(), type };
    assert.equal(sanitizeErrorEvent(event as ErrorEvent, release), null);
  }
  assert.equal(sanitizeErrorEvent({ type: undefined, message: privateText }, release), null);
  assert.equal(sanitizeErrorEvent({ type: undefined, exception: { values: [] } }, release), null);
});

test("known network and range failures use fixed categories instead of original messages", () => {
  for (const value of [
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
  ]) {
    const clean = sanitizeErrorEvent(errorEvent(value), release);
    assert.equal(clean?.tags?.["category"], "network");
    assert.equal(clean?.exception?.values?.[0]?.value, "Network request failed");
  }
  const range = sanitizeErrorEvent(
    errorEvent("The static host must serve unchanged files with HTTP 206 byte-range support."),
    release,
  );
  assert.equal(range?.tags?.["category"], "range-response");
  assert.equal(range?.exception?.values?.[0]?.value, "Invalid byte-range response");
  const unrecognized = sanitizeErrorEvent(errorEvent(`Failed to fetch ${privateText}`), release);
  assert.equal(unrecognized?.tags?.["category"], "application");
  assert.ok(!JSON.stringify(unrecognized).includes(privateText));
});

test("stack locations retain only HTTPS application assets and valid numeric coordinates", () => {
  const rejected = [
    "not a URL",
    "/assets/app.js",
    `file:///Users/example/${filename}`,
    `data:text/plain,${dna}`,
    "blob:https://genomewalk.com/01234",
    "javascript:alert(1)",
    "https://example.invalid/assets/app.js",
    "https://genomewalk.com.example.invalid/assets/app.js",
    "https://other.genomewalk.com/assets/app.js",
    "http://genomewalk.com/assets/app.js",
    `https://genomewalk.com/ref/${filename}`,
    "https://genomewalk.com/assets/nested/app.js",
    "https://genomewalk.com/assets/app.ts",
    "https://genomewalk.com/assets/app%20private.js",
  ];
  const frames: StackFrame[] = rejected.map((url) => ({ filename: url, lineno: 1, colno: 1 }));
  frames.push(
    {
      filename: `https://${dna}:${dna}@genomewalk.com/assets/app-123.js?${filename}#${dna}`,
      lineno: 2,
      colno: 3,
    },
    { filename: "https://www.genomewalk.com/assets/chapter-456.mjs", lineno: -1, colno: Infinity },
    { filename: "https://genomewalk.com/assets/reader-789.js", lineno: NaN, colno: 0 },
    {
      filename: "https://genomewalk.com/assets/reader-789.js",
      lineno: 1.5,
      colno: Number.MAX_SAFE_INTEGER + 1,
    },
  );
  const clean = sanitizeErrorEvent(
    errorEvent(privateText, {
      exception: { values: [{ type: "Error", value: privateText, stacktrace: { frames } }] },
    }),
    release,
  );
  assert.deepEqual(clean?.exception?.values?.[0]?.stacktrace?.frames, [
    { filename: "https://genomewalk.com/assets/app-123.js", in_app: true, lineno: 2, colno: 3 },
    { filename: "https://www.genomewalk.com/assets/chapter-456.mjs", in_app: true },
    { filename: "https://genomewalk.com/assets/reader-789.js", in_app: true },
    { filename: "https://genomewalk.com/assets/reader-789.js", in_app: true },
  ]);
});

test("error tags and status labels are restricted to fixed application values", () => {
  const unknown = sanitizeErrorEvent(
    errorEvent(privateText, {
      tags: { area: filename, stage: dna, category: privateText, extra: privateText },
    }),
    release,
  );
  assert.deepEqual(unknown?.tags, { area: "unhandled", stage: "prepare", category: "application" });
  const known = sanitizeErrorEvent(
    errorEvent(privateText, { tags: { area: "file-open", stage: "read-file" } }),
    release,
  );
  assert.deepEqual(known?.tags, { area: "file-open", stage: "read-file", category: "application" });
  assert.equal(reportingStage("Loading matched catalogue entries…"), "reference-entries");
  assert.equal(reportingStage("Loading the GRCh37 catalogue index…"), "reference-index");
  assert.equal(reportingStage("Loading the GRCh38 catalogue index…"), "reference-index");
  assert.equal(reportingStage(`Loading ${privateText}`), "prepare");
});

test("reports preserve SDK event IDs but reject arbitrary identifier strings", () => {
  assert.equal(
    sanitizeErrorEvent(errorEvent(privateText, { event_id: eventId }), release)?.event_id,
    eventId,
  );
  for (const invalid of [filename, dna, "", "f".repeat(31), "g".repeat(32), "f".repeat(33)])
    assert.equal(
      sanitizeErrorEvent(errorEvent(privateText, { event_id: invalid }), release)?.event_id,
      undefined,
    );
});

test("reports reject invalid event timestamps", () => {
  for (const invalid of [0, -1, NaN, Infinity, -Infinity])
    assert.equal(
      sanitizeErrorEvent(errorEvent(privateText, { timestamp: invalid }), release)?.timestamp,
      undefined,
    );
});

test("error stacks are bounded without retaining caller metadata", () => {
  const frames = Array.from({ length: 40 }, (_, index): StackFrame => ({
    filename: "https://genomewalk.com/assets/app-123.js",
    lineno: index + 1,
    function: privateText,
    vars: { genome: dna },
  }));
  const clean = sanitizeErrorEvent(
    errorEvent(privateText, {
      exception: { values: [{ type: "Error", stacktrace: { frames } }] },
    }),
    release,
  );
  const sanitized = clean?.exception?.values?.[0]?.stacktrace?.frames;
  assert.equal(sanitized?.length, 20);
  assert.equal(sanitized?.[0]?.lineno, 21);
  assert.equal(sanitized?.at(-1)?.lineno, 40);
  assert.ok(!JSON.stringify(clean).includes(dna));
});
