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
