// One-based inclusive intervals between PAR1 and PAR2. Sources:
// https://www.cog-genomics.org/plink/2.0/data#split_par (X)
// https://grch37.ensembl.org/info/genome/genebuild/assembly.html (Y, GRCh37)
// https://www.ensembl.org/info/genome/genebuild/human_PARS.html (Y, GRCh38)
const NON_PAR: Record<string, { X: [number, number]; Y: [number, number] }> = {
  GRCh37: { X: [2699521, 154931043], Y: [2649521, 59034049] },
  GRCh38: { X: [2781480, 155701382], Y: [2781480, 56887902] },
};

// An educational pattern heuristic, not PLINK's population-frequency-based F
// statistic or a validated karyotype test. Leave intermediate/disagreeing
// evidence unresolved. The explicit guardrails are documented in CONSUMER_FILES.
export function sexChromosomeSummary(
  build: string,
  sites: Map<string, string>,
  conflicts: Set<string>,
) {
  const ranges = NON_PAR[build];
  if (!ranges) return null;
  const group = () => ({
    sites: 0,
    called: 0,
    differing: 0,
    single: 0,
    first: Infinity,
    last: -Infinity,
    firstCall: Infinity,
    lastCall: -Infinity,
  });
  const X = group(),
    Y = group();
  for (const [key, signature] of sites) {
    const chrom = key.slice(0, 2);
    if (chrom !== "X:" && chrom !== "Y:") continue;
    if (conflicts.has(key)) continue;
    const name = key[0] as "X" | "Y",
      pos = Number(key.slice(2));
    const [start, end] = ranges[name];
    if (pos < start || pos > end) continue;
    const data = name === "X" ? X : Y;
    data.sites++;
    data.first = Math.min(data.first, pos);
    data.last = Math.max(data.last, pos);
    // Missing, partial and I/D-coded calls never count as DNA evidence.
    if (!/^[ACGT](?:\/[ACGT])?$/.test(signature)) continue;
    const alleles = signature.split("/");
    const differing = alleles.length === 2 && alleles[0] !== alleles[1];
    if (differing) data.differing++;
    // Two different letters on non-PAR Y are inconsistent with a single Y.
    if (name === "Y" && differing) continue;
    data.called++;
    if (alleles.length === 1) data.single++;
    data.firstCall = Math.min(data.firstCall, pos);
    data.lastCall = Math.max(data.lastCall, pos);
  }
  const xRate = X.called ? X.differing / X.called : null;
  const yRate = Y.sites ? Y.called / Y.sites : null;
  let estimate: "XX" | "XY" | null = null;
  const enoughEvidence =
    X.called >= 200 &&
    X.called / X.sites >= 0.8 &&
    X.lastCall - X.firstCall >= 20000000 &&
    Y.sites >= 100 &&
    Y.last - Y.first >= 5000000;
  if (enoughEvidence) {
    if (
      xRate! <= 0.01 &&
      Y.called >= 50 &&
      yRate! >= 0.1 &&
      Y.lastCall - Y.firstCall >= 5000000 &&
      Y.differing / (Y.called + Y.differing) <= 0.01
    )
      estimate = "XY";
    else if (xRate! >= 0.1 && X.single === 0 && Y.called === 0 && Y.differing === 0)
      estimate = "XX";
  }
  return { build, X, Y, xRate, yRate, estimate };
}
