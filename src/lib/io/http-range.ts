import type { ByteSource, Fetcher } from "./types.ts";
import { AppError, type ErrorResource } from "../app-error.ts";
import { fetchPublic, readPublicBytes } from "./fetch-public.ts";

interface RangeOptions {
  size?: number | undefined;
  signal?: AbortSignal | undefined;
  fetcher?: Fetcher;
  resource?: ErrorResource;
}

/** Fetch a single [start, end) range; never silently download an entire large file. */
export async function readByteRange(
  url: string | URL | Request,
  start: number,
  end: number,
  { size, signal, fetcher = fetch, resource = "public-sample" }: RangeOptions = {},
) {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start)
    throw new AppError("RANGE_REQUEST_INVALID", "Invalid byte range", { resource });
  const response = await fetchPublic(
    url,
    resource,
    {
      headers: { Range: `bytes=${start}-${end - 1}` },
      signal: signal ?? null,
    },
    fetcher,
  );
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
  const encoding = response.headers.get("content-encoding");
  if (
    response.status !== 206 ||
    !range ||
    +range[1]! !== start ||
    +range[2]! !== end - 1 ||
    (size != null && +range[3]! !== size) ||
    +range[3]! < end ||
    (encoding && encoding !== "identity")
  ) {
    await response.body?.cancel().catch(() => {});
    throw new AppError(
      "RANGE_RESPONSE_INVALID",
      "The static host must serve unchanged files with HTTP 206 byte-range support.",
      { resource, httpStatus: response.status },
    );
  }
  const bytes = await readPublicBytes(response, resource);
  signal?.throwIfAborted();
  if (bytes.length !== end - start)
    throw new AppError("RANGE_RESPONSE_INCOMPLETE", "The byte-range response was incomplete.", {
      resource,
      httpStatus: response.status,
    });
  return bytes;
}

/** Public sample only. Local genome readers never use this network source. */
export class HttpRangeSource implements ByteSource {
  declare readonly url: string;
  declare readonly size: number;
  declare readonly file: { name: string; size: number };
  declare bytesRead: number;
  private readonly cache: Map<string, Uint8Array>;
  constructor(url: string, name: string, size: number) {
    this.url = url;
    this.size = size;
    this.file = { name, size };
    this.bytesRead = 0;
    this.cache = new Map();
  }
  async slice(start: number, end: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (start === end) return new Uint8Array();
    const key = `${start}:${end}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const bytes = await readByteRange(this.url, start, end, {
      size: this.size,
      signal,
      resource: "public-sample",
    });
    this.bytesRead += bytes.length;
    // Bound memory to four requested chunks; HTTP caching can handle later rereads.
    if (this.cache.size === 4) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, bytes);
    return bytes;
  }
}
