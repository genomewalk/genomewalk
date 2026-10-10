import type { Fetcher } from "./types.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readByteRange, HttpRangeSource } from "./http-range.ts";

test("range reads request exactly the selected bytes and reject whole-file fallback", async () => {
  const fetcher: Fetcher = async (url, options) => {
    assert.equal(url, "/public.bgz");
    assert.equal(new Headers(options?.headers).get("Range"), "bytes=10-12");
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 206,
      headers: { "Content-Range": "bytes 10-12/20" },
    });
  };
  assert.deepEqual(
    await readByteRange("/public.bgz", 10, 13, { size: 20, fetcher }),
    new Uint8Array([1, 2, 3]),
  );
  for (const response of [
    new Response(new Uint8Array(20)),
    new Response(new Uint8Array(3), {
      status: 206,
      headers: { "Content-Range": "bytes 11-13/20" },
    }),
    new Response(new Uint8Array(3), {
      status: 206,
      headers: { "Content-Range": "bytes 10-12/21" },
    }),
    new Response(new Uint8Array(3), {
      status: 206,
      headers: { "Content-Range": "bytes 10-12/20", "Content-Encoding": "gzip" },
    }),
  ])
    await assert.rejects(
      readByteRange("/public.bgz", 10, 13, { size: 20, fetcher: async () => response }),
      /206/,
    );
  await assert.rejects(
    readByteRange("/public.bgz", 10, 13, {
      size: 20,
      fetcher: async () =>
        new Response(new Uint8Array(2), {
          status: 206,
          headers: { "Content-Range": "bytes 10-12/20" },
        }),
    }),
    /incomplete/,
  );
});

test("aborted public reads do not fetch or return cached bytes", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readByteRange("/public.bgz", 0, 1, {
      signal: controller.signal,
      fetcher: () => assert.fail("must not fetch"),
    }),
    /abort/i,
  );
  const source = new HttpRangeSource("/public.bgz", "sample.vcf.gz", 10);
  (source as unknown as { cache: Map<string, Uint8Array> }).cache.set("0:1", new Uint8Array([1]));
  await assert.rejects(source.slice(0, 1, controller.signal), /abort/i);
});
