import type { ByteSource, Fetcher } from "./types.ts";

interface RangeOptions {
  size?: number | undefined;
  signal?: AbortSignal | undefined;
  fetcher?: Fetcher;
}

/** Fetch a single [start, end) range; never silently download an entire large file. */
export async function readByteRange(
  url: string | URL | Request,
  start: number,
  end: number,
  { size, signal, fetcher = fetch }: RangeOptions = {},
) {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start)
    throw new Error("Invalid byte range");
  const response = await fetcher(url, {
    headers: { Range: `bytes=${start}-${end - 1}` },
    signal: signal ?? null,
  });
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
    await response.body?.cancel();
    throw new Error("The static host must serve unchanged files with HTTP 206 byte-range support.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  signal?.throwIfAborted();
  if (bytes.length !== end - start) throw new Error("The byte-range response was incomplete.");
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
    const bytes = await readByteRange(this.url, start, end, { size: this.size, signal });
    this.bytesRead += bytes.length;
    // Bound memory to four requested chunks; HTTP caching can handle later rereads.
    if (this.cache.size === 4) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, bytes);
    return bytes;
  }
}
