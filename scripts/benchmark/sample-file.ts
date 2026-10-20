import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { download } from "../lib/network.ts";
import type { BenchmarkSample } from "./samples.ts";

async function verifySample(sample: BenchmarkSample, file: string) {
  if ((await fs.stat(file)).size !== sample.bytes) throw new Error("Sample size mismatch");
  if (sample.md5) {
    const hash = createHash("md5");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest("hex") !== sample.md5) throw new Error("Published sample MD5 mismatch");
  }
}

/** Own only downloaded temporary files; the bundled teaching sample is never removed. */
export async function withSampleFile<T>(
  sample: BenchmarkSample,
  publicDirectory: string,
  run: (file: string) => Promise<T>,
) {
  if (sample.localPath) {
    const file = path.join(publicDirectory, sample.localPath);
    await verifySample(sample, file);
    return run(file);
  }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "genomewalk-benchmark-"));
  try {
    const file = path.join(temporary, sample.name);
    await download(sample.url, file);
    await verifySample(sample, file);
    return await run(file);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
    console.log(`${sample.id}: temporary download removed`);
  }
}
