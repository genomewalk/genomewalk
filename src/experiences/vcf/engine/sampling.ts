import type { ByteSource } from "../../../lib/io/types.ts";
import { streamVariants } from "./vcf.ts";

export async function firstVariant(
  source: ByteSource,
  maxLines = 200000,
): Promise<string[] | null> {
  let found: string[] | null = null,
    fallback: string[] | null = null,
    seen = 0;
  try {
    await streamVariants(source, (f: string[]) => {
      fallback ||= f;
      seen++;
      if (f[4] !== ".") {
        found = f;
        throw { stop: true };
      }
      if (seen >= maxLines) throw { stop: true };
    });
  } catch (e) {
    if (!e || typeof e !== "object" || !("stop" in e) || !e.stop) throw e;
  }
  return found || fallback;
}

export async function firstLines(
  source: ByteSource,
  n: number,
  onLine: (fields: string[]) => void,
) {
  let got = 0;
  try {
    await streamVariants(source, (f) => {
      if (got < n) {
        onLine(f);
        got++;
      }
      if (got >= n) throw { stop: true };
    });
  } catch (e) {
    if (!e || typeof e !== "object" || !("stop" in e) || !e.stop) throw e;
  }
}
