export function detectBuild(meta: string[]) {
  const chr1 = meta.find((l) => /^##contig=<ID=(chr)?1,/.test(l)) || "";
  const len = +(chr1.match(/length=(\d+)/) || [])[1]!;
  if (len === 248956422) return "GRCh38";
  if (len === 249250621) return "GRCh37";
  if (len === 248387328) return "T2T-CHM13";
  const hint = (
    (meta.find((l) => l.startsWith("##reference=")) || "") +
    " " +
    ((chr1.match(/assembly=([^,>]+)/) || [])[1] || "")
  ).toLowerCase();
  if (/grch38|hg38/.test(hint)) return "GRCh38";
  if (/grch37|hg19|b37|hs37/.test(hint)) return "GRCh37";
  if (/chm13|t2t/.test(hint)) return "T2T-CHM13";
  return "unknown";
}

export const genomeLen = (meta: string[]) =>
  meta
    .filter((l) => /^##contig=<ID=(chr)?([1-9]|1[0-9]|2[0-2]|X|Y|MT|M),/.test(l))
    .reduce((t: number, l: string) => t + (+(l.match(/length=(\d+)/) || [])[1]! || 0), 0);
