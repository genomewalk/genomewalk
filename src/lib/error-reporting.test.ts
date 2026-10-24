import assert from "node:assert/strict";
import test from "node:test";
import type { ErrorEvent, Event, StackFrame } from "@sentry/react";
import { reportingStage, sanitizeErrorEvent } from "./error-reporting.ts";
import { AppError, type ErrorCode, type ErrorDetails } from "./app-error.ts";
import type { ClientEnvironment } from "./diagnostics/client-environment.ts";
import { getFileDiagnostics } from "./diagnostics/file-context.ts";

const filename = "SYNTHETIC_PRIVATE_GENOME.vcf.gz";
const dna = "GATTACAGATTACAGATTACA";
const privateText = `${filename}:${dna}`;
const release = "genomewalk@test-release";
const eventId = "0123456789abcdef0123456789abcdef";

test("coarse device and file diagnostics survive without raw identifiers or exact values", () => {
  const clean = sanitizeErrorEvent(
    errorEvent(privateText, {
      tags: {
        ...getFileDiagnostics({ name: `${filename}.vcf.gz`, size: 9_123_456_789 }, "VCF"),
        file_name: filename,
        file_size: 9_123_456_789,
        user_agent: privateText,
        device_id: privateText,
        browser_name: privateText,
      },
    }),
    release,
    undefined,
    { browser_name: "Safari", browser_major: "18", os_name: "iOS", device_type: "tablet" },
  );
  assert.deepEqual(clean?.tags, {
    area: "unhandled",
    stage: "prepare",
    category: "application",
    error_code: "UNEXPECTED_ERROR",
    browser_name: "Safari",
    browser_major: "18",
    os_name: "iOS",
    device_type: "tablet",
    file_extension: ".vcf.gz",
    file_format: "VCF",
    file_size_band: "1-GB-or-more",
  });
  for (const secret of [filename, dna, "9123456789", "user_agent", "device_id"])
    assert.ok(!JSON.stringify(clean).includes(secret));
});

test("diagnostic metadata is revalidated at the final privacy boundary", () => {
  const clean = sanitizeErrorEvent(
    errorEvent(privateText, {
      tags: {
        file_extension: filename,
        file_format: dna,
        file_size_band: 123456,
        browser_name: "Chrome",
        browser_major: "143",
        os_name: "Windows",
        device_type: "desktop",
      },
    }),
    release,
    undefined,
    {
      browser_name: filename,
      browser_major: privateText,
      os_name: dna,
      device_type: privateText,
    } as unknown as ClientEnvironment,
  );
  assert.deepEqual(clean?.tags, {
    area: "unhandled",
    stage: "prepare",
    category: "application",
    error_code: "UNEXPECTED_ERROR",
  });
  for (const major of ["0", "01", "1000", "143.1.2", "143\n", privateText, 143]) {
    const result = sanitizeErrorEvent(errorEvent(), release, undefined, {
      browser_name: "Chrome",
      browser_major: major,
      os_name: "Linux",
      device_type: "desktop",
    } as ClientEnvironment);
    assert.equal(result?.tags?.["browser_major"], undefined);
  }
  for (const browser of ["Other", "Unknown"] as const) {
    const result = sanitizeErrorEvent(errorEvent(), release, undefined, {
      browser_name: browser,
      browser_major: "143",
      os_name: "Other",
      device_type: "unknown",
    });
    assert.equal(result?.tags?.["browser_major"], undefined);
  }
});

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
    "fingerprint",
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
    error_code: "UNEXPECTED_ERROR",
  });
  assert.deepEqual(clean.exception?.values, [
    {
      type: "UNEXPECTED_ERROR",
      value: "Unexpected application failure",
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
  assert.deepEqual(clean.fingerprint, ["{{ default }}", "results"]);
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
  assert.equal(
    sanitizeErrorEvent(errorEvent(), release, new DOMException(privateText, "AbortError")),
    null,
  );
});

test("known network and range failures use fixed categories instead of original messages", () => {
  for (const value of [
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
  ]) {
    const clean = sanitizeErrorEvent(errorEvent(value), release);
    assert.equal(clean?.tags?.["category"], "network");
    assert.equal(clean?.tags?.["error_code"], "NETWORK_FAILED");
    assert.equal(
      clean?.exception?.values?.[0]?.value,
      "Public data download failed: network request failed",
    );
  }
  const range = sanitizeErrorEvent(
    errorEvent("The static host must serve unchanged files with HTTP 206 byte-range support."),
    release,
    new AppError("RANGE_RESPONSE_INVALID", privateText, {
      resource: "catalogue-entries",
      httpStatus: 200,
    }),
  );
  assert.equal(range?.tags?.["category"], "range-response");
  assert.equal(range?.exception?.values?.[0]?.type, "RANGE_RESPONSE_INVALID");
  assert.equal(
    range?.exception?.values?.[0]?.value,
    "Host returned an invalid byte-range response",
  );
  assert.equal(range?.tags?.["resource"], "catalogue-entries");
  assert.equal(range?.tags?.["http_status"], 200);
  const unrecognized = sanitizeErrorEvent(errorEvent(`Failed to fetch ${privateText}`), release);
  assert.equal(unrecognized?.tags?.["category"], "application");
  assert.ok(!JSON.stringify(unrecognized).includes(privateText));
});

test("typed validation reports explain the problem without sending the local error message", () => {
  const original = Object.assign(new AppError("DNA_HEADER_MISSING", privateText), {
    cause: new Error(privateText),
    filename,
    contents: dna,
  });
  const clean = sanitizeErrorEvent(
    errorEvent(privateText, {
      tags: { area: "file-open", stage: "read-file", error_code: privateText, resource: filename },
    }),
    release,
    original,
  );
  assert.equal(clean?.level, "warning");
  assert.deepEqual(clean?.exception?.values, [
    {
      type: "DNA_HEADER_MISSING",
      value: "Unsupported DNA file: expected header missing",
    },
  ]);
  assert.deepEqual(clean?.tags, {
    area: "file-open",
    stage: "read-file",
    category: "validation",
    error_code: "DNA_HEADER_MISSING",
  });
  assert.deepEqual(clean?.fingerprint, ["genomewalk", "DNA_HEADER_MISSING", "file-open", "none"]);
  assert.ok(!JSON.stringify(clean).includes(filename));
  assert.ok(!JSON.stringify(clean).includes(dna));
});

test("download reports retain only reviewed resource names and numeric HTTP status", () => {
  const original = new AppError("HTTP_ERROR", privateText, {
    resource: "catalogue-entries",
    httpStatus: 503,
    url: `https://genomewalk.com/ref/private?${privateText}`,
    range: "bytes=123-456",
    body: privateText,
    headers: { "X-Private": privateText },
  } as ErrorDetails);
  const clean = sanitizeErrorEvent(
    errorEvent(privateText, {
      tags: { area: "results", stage: "reference-entries", chapter: 9, http_status: privateText },
    }),
    release,
    original,
  );
  assert.equal(clean?.level, "error");
  assert.deepEqual(clean?.exception?.values, [
    {
      type: "HTTP_ERROR",
      value: "Public data download returned an HTTP error",
    },
  ]);
  assert.deepEqual(clean?.tags, {
    area: "results",
    stage: "reference-entries",
    category: "network",
    error_code: "HTTP_ERROR",
    resource: "catalogue-entries",
    http_status: 503,
    chapter: 9,
  });
  assert.deepEqual(clean?.fingerprint, [
    "genomewalk",
    "HTTP_ERROR",
    "results",
    "catalogue-entries",
  ]);
  for (const secret of [filename, dna, "bytes=123-456", "X-Private"])
    assert.ok(!JSON.stringify(clean).includes(secret));
});

test("event tags and lookalike errors cannot supply diagnostic codes or download metadata", () => {
  const event = errorEvent(privateText, {
    tags: {
      area: "chapter",
      stage: "prepare",
      error_code: "DNA_HEADER_MISSING",
      resource: "markers",
      http_status: 404,
    },
  });
  const lookalike = Object.assign(new Error(privateText), {
    code: "DNA_HEADER_MISSING",
    details: { resource: "markers", httpStatus: 404 },
  });
  for (const original of [
    undefined,
    lookalike,
    { code: "HTTP_ERROR", details: lookalike.details },
  ]) {
    const clean = sanitizeErrorEvent(event, release, original);
    assert.deepEqual(clean?.tags, {
      area: "chapter",
      stage: "prepare",
      category: "application",
      error_code: "UNEXPECTED_ERROR",
    });
  }
  for (const code of [privateText, "__proto__", "constructor", "toString", ""]) {
    const clean = sanitizeErrorEvent(event, release, new AppError(code as ErrorCode, privateText));
    assert.equal(clean?.tags?.["error_code"], "UNEXPECTED_ERROR");
    assert.ok(!JSON.stringify(clean).includes(privateText));
  }
});

test("malformed HTTP metadata and chapter values cannot enter reports", () => {
  for (const resource of [privateText, "__proto__", 503, null, undefined, ["markers"]]) {
    const clean = sanitizeErrorEvent(
      errorEvent(),
      release,
      new AppError("HTTP_ERROR", privateText, {
        resource,
        httpStatus: 503,
      } as unknown as ErrorDetails),
    );
    assert.equal(clean?.tags?.["resource"], undefined);
    assert.equal(clean?.tags?.["http_status"], undefined);
  }
  for (const httpStatus of [privateText, "503", 99, 600, 503.1, NaN, Infinity, null, [503]]) {
    const clean = sanitizeErrorEvent(
      errorEvent(),
      release,
      new AppError("HTTP_ERROR", privateText, {
        resource: "public-sample",
        httpStatus,
      } as unknown as ErrorDetails),
    );
    assert.equal(clean?.tags?.["resource"], "public-sample");
    assert.equal(clean?.tags?.["http_status"], undefined);
  }
  for (const httpStatus of [100, 206, 404, 503, 599]) {
    const clean = sanitizeErrorEvent(
      errorEvent(),
      release,
      new AppError("HTTP_ERROR", privateText, {
        resource: "public-sample",
        httpStatus,
      }),
    );
    assert.equal(clean?.tags?.["http_status"], httpStatus);
  }
  for (const chapter of [privateText, "9", 0, 10, 1.5, NaN, Infinity]) {
    const clean = sanitizeErrorEvent(errorEvent(privateText, { tags: { chapter } }), release);
    assert.equal(clean?.tags?.["chapter"], undefined);
  }
  for (const chapter of [1, 5, 9]) {
    const clean = sanitizeErrorEvent(errorEvent(privateText, { tags: { chapter } }), release);
    assert.equal(clean?.tags?.["chapter"], chapter);
  }
});

test("unexpected JavaScript and file-access failures keep safe types rather than messages", () => {
  for (const [type, code] of [
    ["TypeError", "JS_TYPE_ERROR"],
    ["ReferenceError", "JS_REFERENCE_ERROR"],
    ["RangeError", "JS_RANGE_ERROR"],
    ["SyntaxError", "JS_SYNTAX_ERROR"],
    ["NotReadableError", "FILE_READ_FAILED"],
    ["SecurityError", "FILE_READ_FAILED"],
  ] as const) {
    const clean = sanitizeErrorEvent(
      errorEvent(privateText, {
        exception: { values: [{ type, value: privateText }] },
      }),
      release,
    );
    assert.equal(clean?.tags?.["error_code"], code);
    assert.equal(clean?.exception?.values?.[0]?.type, code);
    assert.ok(!JSON.stringify(clean).includes(privateText));
    if (code?.startsWith("JS_"))
      assert.deepEqual(clean?.fingerprint, ["{{ default }}", "unhandled"]);
  }
});

test("invalid public samples are errors while invalid personal files are warnings", () => {
  const error = new AppError("DNA_HEADER_MISSING", privateText);
  for (const [area, level] of [
    ["file-open", "warning"],
    ["sample-open", "error"],
  ] as const) {
    const clean = sanitizeErrorEvent(errorEvent(privateText, { tags: { area } }), release, error);
    assert.equal(clean?.level, level);
    assert.equal(clean?.tags?.["error_code"], "DNA_HEADER_MISSING");
    assert.ok(!JSON.stringify(clean).includes(privateText));
  }
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
  assert.deepEqual(unknown?.tags, {
    area: "unhandled",
    stage: "prepare",
    category: "application",
    error_code: "UNEXPECTED_ERROR",
  });
  const known = sanitizeErrorEvent(
    errorEvent(privateText, { tags: { area: "file-open", stage: "read-file" } }),
    release,
  );
  assert.deepEqual(known?.tags, {
    area: "file-open",
    stage: "read-file",
    category: "application",
    error_code: "UNEXPECTED_ERROR",
  });
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
