import fs from "node:fs";
import path from "node:path";
import { CHAPTER_COUNT } from "../../src/lib/navigation/journey.ts";

/** Inspect the uploadable static directory; host size limits are optional and explicit. */
export function inspectDeployment(
  publicDir: string,
  { maxAssetBytes = null }: { maxAssetBytes?: number | null } = {},
) {
  const required = [
    "index.html",
    "privacy/index.html",
    "terms/index.html",
    ...Array.from({ length: CHAPTER_COUNT }, (_, i) => `chapter/${i + 1}/index.html`),
  ];
  for (const file of required)
    if (!fs.existsSync(path.join(publicDir, file)))
      throw new Error(`Run npm run build first; static page ${file} is missing from ${publicDir}.`);
  const oversized: { file: string; bytes: number }[] = [];
  let files = 0,
    bytes = 0;
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        const size = fs.statSync(file).size;
        files++;
        bytes += size;
        if (maxAssetBytes != null && size > maxAssetBytes)
          oversized.push({ file: path.relative(publicDir, file), bytes: size });
      }
    }
  };
  walk(publicDir);
  return { publicDir, files, bytes, oversized };
}
