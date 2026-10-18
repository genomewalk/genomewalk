import { TabixIndexedFile } from "@gmod/tabix";
import { RemoteFileWithRangeCache } from "@gmod/range-cache-filehandle";
import { SOURCES } from "../config.ts";

export const POPULATIONS: Record<string, string> = {
  afr: "African",
  amr: "Latino/Admixed American",
  asj: "Ashkenazi Jewish",
  eas: "East Asian",
  fin: "Finnish",
  mid: "Middle Eastern",
  nfe: "European (non-Finnish)",
  sas: "South Asian",
};
export interface JointFrequency {
  key: string;
  af: string;
  grp: string;
  afmax: string;
  an: number;
  ac: number;
  filter: string;
  discordanceP: string;
  pops: Record<string, number>;
}
export interface FrequencyRegion {
  chrom: string;
  start: number;
  end: number;
  keys: Set<string>;
}

function fraction(value: string | undefined, name: string) {
  if (value === undefined || value === ".") return ".";
  if (!value || !Number.isFinite(+value) || +value < 0 || +value > 1)
    throw new Error(`Invalid gnomAD ${name}`);
  return value;
}
function count(value: string | undefined, name: string) {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(+value))
    throw new Error(`Invalid gnomAD ${name}`);
  return +value;
}

/** Keep the published joint fields; never sum datasets or substitute filtering AF. */
export function parseJointFrequency(line: string, region: FrequencyRegion): JointFrequency | null {
  const f = line.split("\t");
  if (f.length !== 8) throw new Error("Unexpected gnomAD sites VCF schema");
  const key = `${f[1]}:${f[3]}:${f[4]}`;
  if (f[0] !== `chr${region.chrom}` || !region.keys.has(key)) return null;
  const info = Object.fromEntries(
    f[7]!.split(";").map((field) => {
      const at = field.indexOf("=");
      return at < 0 ? [field, ""] : [field.slice(0, at), field.slice(at + 1)];
    }),
  );
  const an = count(info["AN_joint"], "AN_joint");
  const ac = count(info["AC_joint"], "AC_joint");
  const af = fraction(info["AF_joint"], "AF_joint");
  if (ac > an) throw new Error("gnomAD AC_joint exceeds AN_joint");
  if (!an) return null;
  if (af === ".") throw new Error("gnomAD AF_joint missing despite measured alleles");
  if (Math.abs(+af - ac / an) > Math.max(1e-10, (ac / an) * 1e-5))
    throw new Error("gnomAD AF_joint disagrees with published counts");
  if (!["PASS", "EXOMES_FILTERED", "GENOMES_FILTERED", "BOTH_FILTERED"].includes(f[6]!))
    throw new Error(`Unexpected gnomAD FILTER: ${f[6]}`);
  const pops: Record<string, number> = {};
  for (const group of Object.keys(POPULATIONS)) {
    const value = fraction(info[`AF_joint_${group}`], `AF_joint_${group}`);
    if (value !== "." && +(info[`AN_joint_${group}`] || 0) > 0) pops[group] = +value;
  }
  return {
    key: `${region.chrom}:${key}`,
    af,
    an,
    ac,
    pops,
    grp: POPULATIONS[info["grpmax_joint"]!] || info["grpmax_joint"] || ".",
    afmax: fraction(info["AF_grpmax_joint"], "AF_grpmax_joint"),
    filter: f[6]!,
    discordanceP: fraction(info["stat_union_p_value"], "stat_union_p_value"),
  };
}

/** One reader per worker, with a bounded cache and one chromosome open at a time. */
export function jointExtractor() {
  let chrom = "";
  let file: TabixIndexedFile;
  return async (region: FrequencyRegion) => {
    if (chrom !== region.chrom) {
      const next = new TabixIndexedFile({
        filehandle: new RemoteFileWithRangeCache(SOURCES.jointVcf(region.chrom)),
        tbiFilehandle: new RemoteFileWithRangeCache(SOURCES.jointVcf(region.chrom) + ".tbi"),
        chunkCacheSize: 64 * 1024 * 1024,
      });
      const signal = AbortSignal.timeout(120_000);
      const header = await next.getHeader({ signal });
      for (const field of [
        "AC_joint",
        "AN_joint",
        "AF_joint",
        "AF_grpmax_joint",
        "stat_union_p_value",
      ])
        if (!header.includes(`##INFO=<ID=${field},`))
          throw new Error(`gnomAD header missing ${field}`);
      if (!(await next.getReferenceSequenceNames({ signal })).includes(`chr${region.chrom}`))
        throw new Error(`gnomAD index missing chr${region.chrom}`);
      file = next;
      chrom = region.chrom;
    }
    const rows: JointFrequency[] = [];
    await file.getLines(`chr${region.chrom}`, region.start, region.end, {
      signal: AbortSignal.timeout(120_000),
      lineCallback(line) {
        const row = parseJointFrequency(line, region);
        if (row) rows.push(row);
      },
    });
    return rows;
  };
}
