#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT } from "./lib/config.ts";
import { inspectDeployment } from "./lib/deployment.ts";
import { CHAPTER_COUNT } from "../src/lib/navigation/journey.ts";

try {
  const { values } = parseArgs({ options: { "max-asset-mib": { type: "string" } }, strict: true });
  const limit = values["max-asset-mib"] == null ? null : Number(values["max-asset-mib"]);
  if (limit != null && (!Number.isFinite(limit) || limit <= 0))
    throw new Error("--max-asset-mib must be a positive number");
  const result = inspectDeployment(path.join(ROOT, "dist/client"), {
    maxAssetBytes: limit == null ? null : limit * 1024 * 1024,
  });
  console.log(
    `Static site: ${result.publicDir} (${result.files} files, ${(result.bytes / 1024 / 1024).toFixed(1)} MiB)`,
  );
  if (result.oversized.length) {
    for (const { file, bytes } of result.oversized)
      console.error(`  ${file}: ${(bytes / 1024 / 1024).toFixed(2)} MiB exceeds ${limit} MiB`);
    process.exitCode = 1;
  } else
    console.log(
      `All ${CHAPTER_COUNT + 3} HTML pages exist. Serve this folder with HTTP byte-range support; no application server is needed.`,
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
