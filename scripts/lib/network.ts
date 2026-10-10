import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { writeAtomic } from "./io/atomic.ts";
import { log, mb } from "./log.ts";

export async function retry<T>(action: () => Promise<T>, attempts = 3, delay = 500) {
  for (let i = 1; ; i++) {
    try {
      return await action();
    } catch (error) {
      if (i === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * i));
    }
  }
}

// Downloads use Node's HTTP client; curl is not a build prerequisite.
export async function download(
  url: string | URL | Request,
  destination: string,
  {
    fresh = false,
    headersFile,
    fetcher = fetch,
    timeoutMs = 300_000,
  }: {
    fresh?: boolean | undefined;
    headersFile?: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  } = {},
) {
  if (!fresh && fs.existsSync(destination) && (!headersFile || fs.existsSync(headersFile))) {
    log(`Have ${destination} — reuse (use --fresh to download again)`);
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await retry(async () => {
    const temporary = `${destination}.${randomUUID()}.part`;
    try {
      log(`Downloading ${url}`);
      const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      if (!response.body) throw new Error(`${url}: empty response`);
      await pipeline(
        Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>),
        fs.createWriteStream(temporary, { flags: "wx" }),
      );
      if (!fs.statSync(temporary).size) throw new Error(`${url}: empty download`);
      if (headersFile)
        writeAtomic(
          headersFile,
          [...response.headers].map(([key, value]) => `${key}: ${value}`).join("\n") + "\n",
        );
      fs.renameSync(temporary, destination);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  });
  log(`Saved ${destination} (${mb(fs.statSync(destination).size)})`);
}
