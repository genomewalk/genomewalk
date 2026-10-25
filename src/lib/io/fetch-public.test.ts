import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../app-error.ts";
import { fetchPublic, readPublicBytes, decodePublicJson } from "./fetch-public.ts";
import { readByteRange } from "./http-range.ts";

const secret = "PRIVATE_PERSON_GENOME_chr1_12345_A_G";
const privateUrl = `https://example.invalid/${secret}?token=${secret}`;

function diagnostic(code: string, details: Record<string, string | number>) {
  return (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.deepEqual(error.details, details);
    assert.ok(!JSON.stringify(error).includes(secret));
    assert.ok(!error.message.includes(secret));
    assert.ok(!error.stack?.includes(secret));
    assert.ok(!("cause" in error), "must not retain a raw failure as a cause");
    return true;
  };
}

test("public downloads retain HTTP status and resource without URL, headers or response body", async () => {
  let canceled = false;
  await assert.rejects(
    fetchPublic(
      privateUrl,
      "catalogue-index",
      { headers: { "X-Private": secret } },
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(secret));
            },
            cancel() {
              canceled = true;
            },
          }),
          { status: 503, headers: { "X-Private": secret } },
        ),
    ),
    diagnostic("HTTP_ERROR", { resource: "catalogue-index", httpStatus: 503 }),
  );
  assert.equal(canceled, true, "discard error response bodies without reading their data");
});

test("network errors and interrupted response bodies never retain raw exception text", async () => {
  await assert.rejects(
    fetchPublic(privateUrl, "public-sample", undefined, async () => {
      throw new TypeError(secret);
    }),
    diagnostic("NETWORK_FAILED", { resource: "public-sample" }),
  );
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new TypeError(secret));
      },
    }),
    { status: 206 },
  );
  await assert.rejects(
    readPublicBytes(response, "catalogue-entries"),
    diagnostic("NETWORK_FAILED", { resource: "catalogue-entries", httpStatus: 206 }),
  );
});

test("public fetch and body capacity failures retain safe public download context", async () => {
  const publicFile = "/ref/GRCh38/catalog.index.json.gz";
  for (const [failure, code] of [
    [
      new RangeError("Array buffer allocation failed", { cause: new Error(secret) }),
      "BROWSER_ALLOCATION_FAILED",
    ],
    [new RangeError("Invalid string length", { cause: new Error(secret) }), "BROWSER_DATA_LIMIT"],
    ["out of memory", "BROWSER_ALLOCATION_FAILED"],
    [
      new AppError("BROWSER_ALLOCATION_FAILED", secret, { publicFile: privateUrl }),
      "BROWSER_ALLOCATION_FAILED",
    ],
    [new RangeError("Invalid array length"), "NETWORK_FAILED"],
  ] as const) {
    await assert.rejects(
      fetchPublic(`${publicFile}?token=${secret}`, "catalogue-index", undefined, async () => {
        throw failure;
      }),
      diagnostic(code, { resource: "catalogue-index", publicFile }),
    );
    const response = await fetchPublic(
      `${publicFile}?token=${secret}`,
      "catalogue-index",
      undefined,
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(failure);
            },
          }),
          { status: 200 },
        ),
    );
    await assert.rejects(
      readPublicBytes(response, "catalogue-index"),
      diagnostic(code, { resource: "catalogue-index", publicFile, httpStatus: 200 }),
    );
  }
});

test("public JSON decoding distinguishes native capacity failures from ordinary decode errors", (t) => {
  const bytes = new TextEncoder().encode("{}");
  for (const [failure, code] of [
    [
      new RangeError("Array buffer allocation failed", { cause: new Error(secret) }),
      "BROWSER_ALLOCATION_FAILED",
    ],
    [new RangeError("Invalid string length", { cause: new Error(secret) }), "BROWSER_DATA_LIMIT"],
    ["out of memory", "BROWSER_ALLOCATION_FAILED"],
    [new AppError("BROWSER_DATA_LIMIT", secret, { publicFile: privateUrl }), "BROWSER_DATA_LIMIT"],
    [new RangeError("Invalid array length"), "REFERENCE_DECODE_FAILED"],
  ] as const) {
    const decoder = t.mock.method(TextDecoder.prototype, "decode", () => {
      throw failure;
    });
    try {
      assert.throws(
        () => decodePublicJson(bytes, "catalogue-index"),
        diagnostic(code, { resource: "catalogue-index" }),
      );
    } finally {
      decoder.mock.restore();
    }
  }
});

test("cancellation stays unreported while timeouts have a separate diagnostic", async () => {
  const cancel = new DOMException(secret, "AbortError");
  await assert.rejects(
    fetchPublic(privateUrl, "public-sample", undefined, async () => {
      throw cancel;
    }),
    (error) => error === cancel,
  );
  const custom = new Error(secret);
  await assert.rejects(
    fetchPublic(privateUrl, "markers", { signal: AbortSignal.abort(custom) }, () =>
      assert.fail("must not fetch"),
    ),
    (error) => error === custom,
  );
  const timeout = new DOMException(secret, "TimeoutError");
  await assert.rejects(
    fetchPublic(privateUrl, "markers", { signal: AbortSignal.abort(timeout) }, () =>
      assert.fail("must not fetch"),
    ),
    diagnostic("NETWORK_TIMEOUT", { resource: "markers" }),
  );
});

test("range diagnostics distinguish HTTP errors, host range errors and incomplete data", async () => {
  const cases = [
    [new Response(secret, { status: 503 }), "HTTP_ERROR", 503],
    [new Response(secret), "RANGE_RESPONSE_INVALID", 200],
    [
      new Response(new Uint8Array(2), {
        status: 206,
        headers: { "Content-Range": "bytes 10-12/20" },
      }),
      "RANGE_RESPONSE_INCOMPLETE",
      206,
    ],
  ] as const;
  for (const [response, code, httpStatus] of cases) {
    await assert.rejects(
      readByteRange(privateUrl, 10, 13, {
        size: 20,
        resource: "catalogue-entries",
        fetcher: async () => response,
      }),
      diagnostic(code, { resource: "catalogue-entries", httpStatus }),
    );
  }
});

test("invalid public JSON and gzip expose only a fixed reference decoding diagnostic", () => {
  for (const bytes of [new TextEncoder().encode(`{"${secret}":`), new Uint8Array([31, 139, 0, 0])])
    assert.throws(
      () => decodePublicJson(bytes, "consumer-lookup"),
      diagnostic("REFERENCE_DECODE_FAILED", { resource: "consumer-lookup" }),
    );
});

test("failed public downloads identify the requested file without request parameters", async () => {
  const publicFile = "/ref/GRCh38/catalog.index.json.gz";
  for (const [fetcher, code, extra] of [
    [
      async () => {
        throw new TypeError(secret);
      },
      "NETWORK_FAILED",
      {},
    ],
    [
      async () => {
        throw new DOMException(secret, "TimeoutError");
      },
      "NETWORK_TIMEOUT",
      {},
    ],
    [async () => new Response(secret, { status: 503 }), "HTTP_ERROR", { httpStatus: 503 }],
  ] as const)
    await assert.rejects(
      fetchPublic(
        `https://genomewalk.com${publicFile}?token=${secret}`,
        "catalogue-index",
        {
          headers: { "X-Private": secret },
        },
        fetcher,
      ),
      diagnostic(code, { resource: "catalogue-index", publicFile, ...extra }),
    );
});

test("interrupted bodies retain the original safe request path even without a response URL", async () => {
  const publicFile = "/ref/GRCh37/catalog.tsv.gz";
  const response = await fetchPublic(
    `${publicFile}?v=${secret}`,
    "catalogue-entries",
    undefined,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError(secret));
          },
        }),
        { status: 206 },
      ),
  );
  assert.equal(response.url, "");
  await assert.rejects(
    readPublicBytes(response, "catalogue-entries"),
    diagnostic("NETWORK_FAILED", {
      resource: "catalogue-entries",
      publicFile,
      httpStatus: 206,
    }),
  );
});

test("public range failures identify the file without exposing selected byte offsets", async () => {
  const publicFile = "/ref/GRCh38/catalog.tsv.gz";
  for (const [response, code, httpStatus] of [
    [new Response(secret), "RANGE_RESPONSE_INVALID", 200],
    [
      new Response(new Uint8Array(2), {
        status: 206,
        headers: { "Content-Range": "bytes 10-12/20" },
      }),
      "RANGE_RESPONSE_INCOMPLETE",
      206,
    ],
  ] as const)
    await assert.rejects(
      readByteRange(`${publicFile}?v=${secret}`, 10, 13, {
        size: 20,
        resource: "catalogue-entries",
        fetcher: async () => response,
      }),
      diagnostic(code, { resource: "catalogue-entries", publicFile, httpStatus }),
    );
  await assert.rejects(
    readByteRange(publicFile, -1, 0, { resource: "catalogue-entries" }),
    diagnostic("RANGE_REQUEST_INVALID", { resource: "catalogue-entries", publicFile }),
  );
});
