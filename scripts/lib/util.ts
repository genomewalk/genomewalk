// Small public API for pipeline utilities; each responsibility lives in its own module.
import fs from "node:fs";
export { atomicWriter, writeAtomic } from "./io/atomic.ts";
export { textLines, readLines } from "./io/lines.ts";
export { bgzfWriter, bgzfWrite } from "./io/bgzf.ts";
export { retry, download } from "./network.ts";
export { ensureTool } from "./tool.ts";
export { log, mb } from "./log.ts";

export function requireFiles(...files: string[]) {
  for (const file of files)
    if (!fs.existsSync(file))
      throw new Error(`Missing ${file}. See npm run data:build -- --help and scripts/README.md.`);
}
