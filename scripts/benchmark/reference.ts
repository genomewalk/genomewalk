import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import type { ByteSource } from "../../src/lib/io/types.ts";
import type { VcfMatch } from "../../src/experiences/vcf/types.ts";
import { streamVariants } from "../../src/experiences/vcf/engine/vcf.ts";
import { gtIdx, varKey } from "../../src/experiences/vcf/engine/identity.ts";
import { addUniqueMatch } from "../../src/experiences/vcf/engine/match-identity.ts";
import { parseCatalogEntry } from "../../src/lib/results/evidence.ts";
import { compareReviewPriority } from "../../src/lib/results/priority.ts";

/**
 * Test-only expected answers from a straightforward local lookup.
 * This deliberately does not use the production streaming matcher or its catalogue reader.
 * Shared VCF parsing and result interpretation are covered by their own fixture tests.
 */
export async function expectedMatches(catalogueFile: string, source: ByteSource) {
  const rows = new Map<string, string>();
  const decoded = createReadStream(catalogueFile).compose(createGunzip());
  const lines = createInterface({ input: decoded, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line || line.startsWith("#")) continue;
      const key = line.split("\t", 4).join(":");
      if (rows.has(key)) throw new Error("Reference catalogue contains a duplicate allele key");
      rows.set(key, line);
    }
  } finally {
    lines.close();
    decoded.destroy();
  }

  const unique = new Map<string, VcfMatch>();
  await streamVariants(source, (f) => {
    if (f[4] === "." || (f[6] !== "PASS" && f[6] !== ".")) return;
    const alts = f[4]!.split(",");
    const idx = gtIdx(f);
    const gt = (f[9] || "").split(":")[0]!;
    alts.forEach((alt, i) => {
      const row = rows.get(varKey(f[0]!, f[1]!, f[3]!, alt));
      const copies = idx.filter((x) => x === i + 1).length;
      if (!row || !copies) return;
      addUniqueMatch(unique, {
        ...parseCatalogEntry(row),
        copies,
        ploidy: gt.split(/[/|]/).length,
        gt,
        partialCall: !/^\d+(?:[/|]\d+)*$/.test(gt) || idx.some((i) => i > alts.length),
        f,
      });
    });
  });
  return [...unique.values()].sort(compareReviewPriority);
}
