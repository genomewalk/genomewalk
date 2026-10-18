import type { ByteSource } from "../../../lib/io/types.ts";
import type { VcfCounts } from "../types.ts";
import { createVcfRowExamples, collectVcfRowExample } from "./row-diagram.ts";
import { streamVariants } from "./vcf.ts";

export async function scanStats(
  source: ByteSource,
  build: string,
  onProgress: (fraction: number, counts: VcfCounts) => void,
  signal?: AbortSignal,
) {
  const t0 = performance.now();
  const s: VcfCounts = {
    records: 0,
    variants: 0,
    homref: 0,
    homrefBases: 0,
    failed: 0,
    snps: 0,
    indels: 0,
    ti: 0,
    tv: 0,
    het: 0,
    hom: 0,
    withId: 0,
    dpSum: 0,
    dpN: 0,
    chrom: {},
    y: 0,
    xnp: 0,
    xhet: 0,
    rowExamples: createVcfRowExamples(build),
  };
  const TS = new Set(["AG", "GA", "CT", "TC"]);
  // The X chromosome's tips (the pseudoautosomal regions) pair with Y and behave
  // like any other chromosome; only the part between them tells sex. Its
  // bounds differ per build.
  const PAR: Record<string, [number, number]> = {
    GRCh38: [2781479, 155701383],
    GRCh37: [2699520, 154931044],
    "T2T-CHM13": [2394410, 153925834],
  };
  const xBounds = PAR[build];
  await streamVariants(
    source,
    (f) => {
      s.records++;
      collectVcfRowExample(s.rowExamples, f);
      if (f[4] === ".") {
        // hom-ref block: you match the reference
        s.homref++;
        const end = /(?:^|;)END=(\d+)/.exec(f[7]!); // …from POS through END
        s.homrefBases += end ? +end[1]! - +f[1]! + 1 : 1;
        return;
      }
      if (f[6] !== "PASS" && f[6] !== ".") {
        s.failed++;
        return;
      } // skip quality-failed calls
      s.variants++;
      s.chrom[f[0]!] = (s.chrom[f[0]!] || 0) + 1;
      if (f[2] !== ".") s.withId++;
      const alt = f[4]!.split(",")[0];
      if (f[3]!.length === 1 && alt!.length === 1) {
        s.snps++;
        if (TS.has(f[3]! + alt!)) s.ti++;
        else s.tv++;
      } else s.indels++;
      const g = (f[9] || "").split(":")[0],
        a = g!.split(/[/|]/),
        dip = a.length === 2;
      if (dip && a[0] !== a[1]) s.het++;
      else if (dip && a[0] !== "0") s.hom++;
      const fmtCols = f[8] ? f[8].split(":") : [],
        dpi = fmtCols.indexOf("DP");
      if (dpi >= 0) {
        const dp = +f[9]!.split(":")[dpi]!;
        if (dp) {
          s.dpSum += dp;
          s.dpN++;
        }
      }
      if (f[0] === "Y" || f[0] === "chrY") s.y++;
      if (
        xBounds &&
        (f[0] === "X" || f[0] === "chrX") &&
        +f[1]! > xBounds[0] &&
        +f[1]! < xBounds[1]
      ) {
        s.xnp++;
        if (dip && a[0] !== a[1]) s.xhet++;
      }
    },
    (fraction) => onProgress(fraction, s),
    signal,
  );
  return Object.assign(s, { seconds: (performance.now() - t0) / 1000 });
}
