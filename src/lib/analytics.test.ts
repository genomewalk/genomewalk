import assert from "node:assert/strict";
import test from "node:test";
import type { CaptureResult } from "posthog-js";
import {
  canonicalPage,
  safeAssetFrames,
  sanitizeAnalyticsEvent,
  usageEvents,
  initAnalytics,
} from "./analytics.ts";
import { AppError, errorDefinitions } from "./app-error.ts";
import { prepareErrorReport } from "./error-reporting.ts";
import { withReadingContext } from "./diagnostics/reading.ts";
import type { ClientEnvironment } from "./diagnostics/client-environment.ts";

const privateText = "SYNTHETIC_PRIVATE_GENOME.vcf.gz GATTACAGATTACA";
const visit = "019baabb-1122-7333-8444-555566667777";
const release = "genomewalk@test-release";
const environment: ClientEnvironment = {
  browser_name: "Chrome",
  browser_major: "155",
  os_name: "macOS",
  device_type: "desktop",
};
function event(name: string, properties: Record<string, unknown> = {}): CaptureResult {
  return {
    uuid: "019baabb-1122-7333-8444-555566667778",
    event: name,
    properties,
    timestamp: new Date("2026-10-24T00:00:00Z"),
  };
}
function sanitize(input: CaptureResult, env = environment) {
  return sanitizeAnalyticsEvent(input, visit, release, env);
}

test("reviewed header diagnostics survive error preparation and the outbound boundary", () => {
  for (const details of [
    {
      headerProvider: "unrecognized",
      headerLayout: "genotype",
      formatReason: "provider-unrecognized",
    },
    { headerProvider: "23andMe", headerLayout: "allele-pair", formatReason: "columns-mismatch" },
    { headerProvider: "AncestryDNA", headerLayout: "other", formatReason: "columns-mismatch" },
  ] as const) {
    const report = prepareErrorReport(
      new AppError("DNA_FORMAT_UNSUPPORTED", privateText, details),
      "file-open",
      "read-file",
    )!;
    const clean = sanitize(
      event("$exception", {
        ...report.properties,
        filename: privateText,
        header: privateText,
        $exception_list: [{ type: privateText, value: privateText }],
      }),
    )!;
    assert.equal(clean.properties["header_provider"], details.headerProvider);
    assert.equal(clean.properties["header_layout"], details.headerLayout);
    assert.equal(clean.properties["format_reason"], details.formatReason);
    assert.equal(
      clean.properties["$exception_fingerprint"],
      "genomewalk:DNA_FORMAT_UNSUPPORTED:file-open:none",
    );
    assert.equal(JSON.stringify(clean).includes(privateText), false);
  }
});

test("outbound reading metadata cannot leak arbitrary values or attach to other event types", () => {
  const keys = [
    "reader_kind",
    "reading_step",
    "input_container",
    "text_encoding",
    "header_provider",
    "header_layout",
    "format_reason",
    "failure_reason",
  ];
  for (const value of [privateText, { value: privateText }, 4, null]) {
    const clean = sanitize(
      event("$exception", {
        error_code: "DNA_FORMAT_UNSUPPORTED",
        ...Object.fromEntries(keys.map((key) => [key, value])),
      }),
    )!;
    for (const key of keys) assert.equal(clean.properties[key], undefined);
    assert.equal(JSON.stringify(clean).includes(privateText), false);
  }
  for (const input of [
    ...usageEvents.map((name) => event(name)),
    event("$pageview", { $pathname: "/" }),
  ]) {
    Object.assign(input.properties, {
      header_provider: "23andMe",
      header_layout: "genotype",
      format_reason: "columns-mismatch",
      reader_kind: "consumer-dna",
      reading_step: "header",
      input_container: "plain",
      text_encoding: "utf8-bom",
      failure_reason: "data-before-columns",
    });
    const clean = sanitize(input)!;
    for (const key of keys) assert.equal(clean.properties[key], undefined);
  }
});

test("reading context survives the outbound boundary for archive, record and native failures", () => {
  for (const [original, code, details] of [
    [
      new AppError("ARCHIVE_NO_DNA", privateText),
      "ARCHIVE_NO_DNA",
      {
        readerKind: "consumer-dna",
        readingStep: "select-payload",
        inputContainer: "zip",
        headerProvider: "unrecognized",
        headerLayout: "genotype",
        formatReason: "provider-unrecognized",
      },
    ],
    [
      new AppError("DNA_COLUMNS_INVALID", privateText),
      "DNA_COLUMNS_INVALID",
      {
        readerKind: "consumer-dna",
        readingStep: "records",
        inputContainer: "plain",
        headerProvider: "AncestryDNA",
        headerLayout: "allele-pair",
        textEncoding: "utf8-bom",
        failureReason: "row-columns-too-few",
      },
    ],
    [
      new RangeError("Array buffer allocation failed"),
      "BROWSER_ALLOCATION_FAILED",
      {
        readerKind: "vcf",
        readingStep: "decompress",
        inputContainer: "bgzf",
      },
    ],
    [
      new DOMException(privateText, "NotReadableError"),
      "FILE_READ_FAILED",
      {
        readerKind: "vcf",
        readingStep: "read-bytes",
        inputContainer: "bgzf",
      },
    ],
  ] as const) {
    const report = prepareErrorReport(
      withReadingContext(original, details),
      "file-open",
      "read-file",
    )!;
    const clean = sanitize(
      event("$exception", {
        ...report.properties,
        filename: privateText,
        row_number: 123456,
        genotype: privateText,
        $exception_list: [{ type: privateText, value: privateText }],
      }),
    )!;
    assert.equal(clean.properties["error_code"], code);
    assert.equal(clean.properties["reader_kind"], details.readerKind);
    assert.equal(clean.properties["reading_step"], details.readingStep);
    assert.equal(clean.properties["input_container"], details.inputContainer);
    for (const key of [
      "header_provider",
      "header_layout",
      "format_reason",
      "text_encoding",
      "failure_reason",
    ])
      assert.equal(clean.properties[key], report.properties[key]);
    assert.equal(clean.properties["row_number"], undefined);
    assert.equal(JSON.stringify(clean).includes(privateText), false);
  }
});

test("usage boundary reconstructs properties and strips SDK identities and private extras", () => {
  const original = {
    ...event("genome_open_started", {
      source: "upload",
      chapter: 2,
      filename: privateText,
      result: privateText,
      distinct_id: privateText,
      $device_id: privateText,
      $session_id: privateText,
      $current_url: privateText,
      $referrer: privateText,
      $set: { email: privateText },
      $exception_list: [{ value: privateText }],
    }),
    $set: { name: privateText },
    $set_once: { email: privateText },
    $unset: [privateText],
  };
  const clean = sanitize(original)!;
  assert.deepEqual(Object.keys(clean).sort(), ["event", "properties", "timestamp", "uuid"]);
  assert.equal(clean.properties["distinct_id"], visit);
  assert.equal(clean.properties["$session_id"], visit);
  assert.equal(clean.properties["$process_person_profile"], false);
  assert.equal(clean.properties["$geoip_disable"], true);
  assert.equal(clean.properties["browser_name"], "Chrome");
  assert.equal(clean.properties["browser_major"], "155");
  assert.equal(clean.properties["source"], "upload");
  assert.equal(clean.properties["chapter"], 2);
  assert.equal(JSON.stringify(clean).includes(privateText), false);
  assert.equal(original.properties["filename"], privateText);
});

test("only explicit learning events and canonical pages leave the app", () => {
  for (const name of usageEvents) assert.equal(sanitize(event(name))?.event, name);
  for (const name of [
    "$autocapture",
    "$snapshot",
    "$set",
    "$identify",
    "$pageleave",
    "$feature_flag_called",
    privateText,
  ])
    assert.equal(sanitize(event(name)), null);
  for (const path of [
    "/",
    "/privacy",
    "/terms",
    ...Array.from({ length: 9 }, (_, index) => `/chapter/${index + 1}`),
  ]) {
    assert.equal(canonicalPage(`${path}?file=${privateText}#private`), path);
    const clean = sanitize(
      event("$pageview", { $pathname: `${path}?secret`, $current_url: privateText }),
    )!;
    assert.equal(clean.properties["$current_url"], `https://genomewalk.com${path}`);
    assert.equal(JSON.stringify(clean).includes(privateText), false);
  }
  for (const path of [
    "/chapter/0",
    "/chapter/10",
    "/user/private",
    "https://private.example/",
    undefined,
  ]) {
    assert.equal(canonicalPage(path), undefined);
    assert.equal(sanitize(event("$pageview", { $pathname: path })), null);
  }
});

test("invalid coarse metadata cannot bypass the property allowlist", () => {
  const invalid = {
    browser_name: privateText,
    browser_major: privateText,
    os_name: privateText,
    device_type: privateText,
  } as unknown as ClientEnvironment;
  const clean = sanitize(
    event("genome_opened", { source: privateText, chapter: privateText }),
    invalid,
  )!;
  for (const key of [
    "source",
    "chapter",
    "browser_name",
    "browser_major",
    "os_name",
    "device_type",
  ])
    assert.equal(clean.properties[key], undefined);
  assert.equal(JSON.stringify(clean).includes(privateText), false);
  for (const chapter of [0, 10, 1.5, NaN, Infinity, "1"])
    assert.equal(
      sanitize(event("explanation_opened", { chapter }))?.properties["chapter"],
      undefined,
    );
  assert.equal(
    sanitize(event("genome_opened"), { ...environment, browser_major: "155.1" })?.properties[
      "browser_major"
    ],
    undefined,
  );
});

test("exception events retain useful reviewed diagnostics and rebuild exceptions", () => {
  const clean = sanitize(
    event("$exception", {
      error_code: "HTTP_ERROR",
      area: "results",
      stage: "reference-index",
      resource: "catalogue-index",
      public_file: `https://genomewalk.com/ref/GRCh38/catalog.meta.json?secret=${privateText}`,
      http_status: 503,
      chapter: 7,
      file_extension: ".vcf.gz",
      file_format: "VCF",
      file_size_band: "1-GB-or-more",
      filename: privateText,
      $exception_list: [
        {
          type: privateText,
          value: privateText,
          mechanism: { source: privateText },
          stacktrace: {
            frames: [
              {
                filename: "https://genomewalk.com/assets/app-abc.js?token=secret",
                lineno: 7,
                colno: 9,
                vars: { dna: privateText },
                function: privateText,
              },
            ],
          },
        },
        { value: privateText },
      ],
      $exception_steps: [privateText],
      $exception_fingerprint: privateText,
    }),
  )!;
  assert.equal(clean.properties["error_code"], "HTTP_ERROR");
  assert.equal(clean.properties["http_status"], 503);
  assert.equal(clean.properties["public_file"], "/ref/GRCh38/catalog.meta.json");
  assert.equal(clean.properties["file_size_band"], "1-GB-or-more");
  assert.equal(clean.properties["$exception_level"], "error");
  assert.equal(
    clean.properties["$exception_fingerprint"],
    "genomewalk:HTTP_ERROR:results:catalogue-index",
  );
  assert.deepEqual(clean.properties["$exception_list"], [
    {
      type: "HTTP_ERROR",
      value: errorDefinitions.HTTP_ERROR[0],
      mechanism: { type: "generic", handled: true },
      stacktrace: {
        type: "raw",
        frames: [
          {
            platform: "web:javascript",
            function: "<anonymous>",
            filename: "https://genomewalk.com/assets/app-abc.js",
            in_app: true,
            lineno: 7,
            colno: 9,
          },
        ],
      },
    },
  ]);
  assert.equal(JSON.stringify(clean).includes(privateText), false);
  assert.equal(JSON.stringify(clean).includes("token=secret"), false);
});

test("exception boundary revalidates server files without exposing private request details", () => {
  const failures = [
    privateText,
    `https://private.example/ref/GRCh38/catalog.meta.json?${privateText}`,
    `/ref/GRCh38/${privateText}`,
    "/samples/HG002_GRCh38.vcf.gz",
    { path: "/ref/GRCh38/catalog.meta.json" },
  ];
  for (const publicFile of failures) {
    const clean = sanitize(
      event("$exception", {
        error_code: "NETWORK_FAILED",
        resource: "catalogue-index",
        public_file: publicFile,
      }),
    )!;
    assert.equal(clean.properties["public_file"], undefined);
    assert.equal(JSON.stringify(clean).includes(privateText), false);
  }
  assert.equal(
    sanitize(
      event("$exception", {
        error_code: "NETWORK_FAILED",
        public_file: "/ref/GRCh38/catalog.meta.json",
      }),
    )?.properties["public_file"],
    undefined,
  );
  const clean = sanitize(
    event("$exception", {
      error_code: "NETWORK_FAILED",
      resource: "publication-labels",
      public_file: "/ref/publications/[shard].json.gz",
      range: "bytes=12345-23456",
      headers: { Range: "bytes=12345-23456" },
      response_body: privateText,
    }),
  )!;
  assert.equal(clean.properties["public_file"], "/ref/publications/[shard].json.gz");
  assert.equal(JSON.stringify(clean).includes("12345"), false);
  assert.equal(JSON.stringify(clean).includes(privateText), false);
  assert.equal(
    sanitize(event("genome_open_started", { public_file: "/samples/HG002_GRCh38.vcf.gz" }))
      ?.properties["public_file"],
    undefined,
  );
});

test("exception boundary rejects unknown codes and invalid resource, status or file metadata", () => {
  for (const code of ["__proto__", "constructor", privateText, undefined])
    assert.equal(sanitize(event("$exception", { error_code: code })), null);
  const clean = sanitize(
    event("$exception", {
      error_code: "DNA_HEADER_MISSING",
      area: privateText,
      stage: privateText,
      resource: privateText,
      http_status: 200,
      file_extension: privateText,
      file_format: privateText,
      file_size_band: privateText,
    }),
  )!;
  assert.equal(clean.properties["area"], "unhandled");
  assert.equal(clean.properties["stage"], "prepare");
  assert.equal(clean.properties["$exception_level"], "warning");
  for (const key of ["resource", "http_status", "file_extension", "file_format", "file_size_band"])
    assert.equal(clean.properties[key], undefined);
  assert.equal(
    sanitize(event("$exception", { error_code: "DNA_HEADER_MISSING", area: "sample-open" }))
      ?.properties["$exception_level"],
    "error",
  );
  for (const status of [99, 600, 200.5, "503", NaN])
    assert.equal(
      sanitize(
        event("$exception", {
          error_code: "HTTP_ERROR",
          resource: "catalogue-index",
          http_status: status,
        }),
      )?.properties["http_status"],
      undefined,
    );
});

test("stack allowlist excludes personal, extension, alternate-port and external locations", () => {
  const files = [
    "file:///Users/person/private.js",
    "https://private.example/assets/app.js",
    "https://genomewalk.com/private.js",
    "http://genomewalk.com/assets/app.js",
    "https://genomewalk.com:444/assets/app.js",
    "chrome-extension://private/assets/app.js",
  ];
  assert.deepEqual(
    safeAssetFrames(files.map((filename) => ({ filename, lineno: 1, colno: 1 }))),
    [],
  );
  assert.equal(
    safeAssetFrames(
      Array.from({ length: 30 }, (_, lineno) => ({
        filename: "https://www.genomewalk.com/assets/app.js",
        lineno: lineno + 1,
      })),
    ).length,
    20,
  );
  assert.deepEqual(
    safeAssetFrames([{ filename: "https://genomewalk.com/assets/app.js", lineno: -1, colno: NaN }]),
    [
      {
        platform: "web:javascript",
        function: "<anonymous>",
        filename: "https://genomewalk.com/assets/app.js",
        in_app: true,
      },
    ],
  );
});

test("analytics stays inactive in non-production Node contexts", () => {
  assert.equal(initAnalytics(), false);
});

test("raw JavaScript frames meet ingestion requirements without exposing function names", () => {
  const filename = "https://genomewalk.com/assets/app.js";
  const base = { platform: "web:javascript", function: "<anonymous>", filename, in_app: true };
  for (const position of [
    { lineno: 1 },
    { colno: 1 },
    { lineno: 0, colno: 1 },
    { lineno: 0x100000000, colno: 1 },
    { lineno: 1, colno: 0x100000000 },
    { lineno: 1, colno: -1 },
    { lineno: 1.5, colno: 1 },
  ]) {
    assert.deepEqual(safeAssetFrames([{ filename, function: privateText, ...position }]), [base]);
  }
  for (const position of [
    { lineno: 1, colno: 0 },
    { lineno: 0xffffffff, colno: 0xffffffff },
  ]) {
    assert.deepEqual(safeAssetFrames([{ filename, function: privateText, ...position }]), [
      { ...base, ...position },
    ]);
  }
});
