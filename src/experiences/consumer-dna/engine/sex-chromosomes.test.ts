import { mockDocument } from "../../../../tests/helpers/fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { sexChromosomeSummary } from "./sex-chromosomes.ts";
import { sexChromosomeFinding } from "./view/sex-chromosomes.ts";
import { consumerStats, openConsumerFile } from "../reader.ts";

const sample = (
  xCall: (i: number) => string = () => "A/A",
  yCall: (i: number) => string = () => "C/C",
) =>
  new Map<string, string>([
    ...Array.from({ length: 200 }, (_, i): [string, string] => [
      `X:${3000000 + i * 500000}`,
      xCall(i),
    ]),
    ...Array.from({ length: 100 }, (_, i): [string, string] => [
      `Y:${3000000 + i * 100000}`,
      yCall(i),
    ]),
  ]);
const summarize = (
  sites: Map<string, string>,
  build = "GRCh37",
  conflicts: Set<string> = new Set(),
) => sexChromosomeSummary(build, sites, conflicts);

test("broad agreeing X/Y evidence supports XY with single or doubled alleles", () => {
  for (const gt of ["A", "A/A"]) {
    const result = summarize(sample(() => gt));
    assert.equal(result!.estimate, "XY");
    assert.equal(result!.X.called, 200);
    assert.equal(result!.Y.called, 100);
  }
});

test("differing X letters and sampled but uncalled Y sites support XX", () => {
  const result = summarize(
    sample(
      (i) => (i % 3 === 0 ? "A/G" : "A/A"),
      () => "?/?",
    ),
  );
  assert.equal(result!.estimate, "XX");
  assert.equal(result!.X.differing, 67);
  assert.equal(result!.Y.sites, 100);
  assert.equal(result!.Y.called, 0);
});

test("Y row presence alone, absent Y, sparse or clustered evidence never determines sex", () => {
  const missingY = sample(
    () => "A/A",
    () => "?/?",
  );
  const absentY = new Map([...missingY].filter(([key]) => key.startsWith("X:")));
  const fewX = sample();
  fewX.delete("X:3000000");
  const clustered = new Map<string, string>(
    Array.from({ length: 200 }, (_, i) => [`X:${3000000 + i}`, "A/A"]),
  );
  for (const [key, value] of sample()) if (key.startsWith("Y:")) clustered.set(key, value);
  for (const sites of [missingY, absentY, fewX, clustered, new Map()])
    assert.equal(summarize(sites)!.estimate, null);
});

test("intermediate X patterns or contradictory Y evidence remain unresolved", () => {
  for (const sites of [
    sample((i) => (i < 10 ? "A/G" : "A/A")),
    sample((i) => (i % 3 === 0 ? "A/G" : "A/A")),
    sample(
      () => "A/A",
      (i) => (i < 2 ? "C/T" : "C/C"),
    ),
    sample(
      (i) => (i === 0 ? "A" : "A/G"),
      () => "?/?",
    ),
  ])
    assert.equal(summarize(sites)!.estimate, null);
});

test("low X call rate and a handful of Y calls cannot produce an estimate", () => {
  const poorX = sample();
  for (let i = 0; i < 100; i++) poorX.set(`X:${110000000 + i}`, "?/?");
  assert.equal(summarize(poorX)!.estimate, null);
  assert.equal(
    summarize(
      sample(
        () => "A/A",
        (i) => (i < 10 ? "C" : "?/?"),
      ),
    )!.estimate,
    null,
  );
});

test("missing, partial, coded and conflicting calls never become usable alleles", () => {
  const sites = new Map([
    ["X:3000000", "?/?"],
    ["X:4000000", "?/A"],
    ["X:5000000", "D/D"],
    ["X:6000000", "A/G"],
    ["Y:3000000", "C/T"],
    ["Y:4000000", "I/I"],
  ]);
  const result = summarize(sites, "GRCh37", new Set(["X:6000000"]));
  assert.equal(result!.X.sites, 3);
  assert.equal(result!.X.called, 0);
  assert.equal(result!.Y.called, 0);
  assert.equal(result!.Y.differing, 1);
  assert.equal(result!.estimate, null);
});

test("both builds exclude PAR boundaries and retain the adjacent non-PAR bases", () => {
  const boundaries = {
    GRCh37: { X: [2699520, 154931044], Y: [2649520, 59034050] },
    GRCh38: { X: [2781479, 155701383], Y: [2781479, 56887903] },
  };
  for (const [build, chroms] of Object.entries(boundaries)) {
    const sites = new Map();
    for (const [chrom, [lo, hi]] of Object.entries(chroms)) {
      sites.set(`${chrom}:${lo}`, "A/G");
      sites.set(`${chrom}:${hi}`, "A/G");
      sites.set(`${chrom}:${lo! + 1}`, "A/A");
      sites.set(`${chrom}:${hi! - 1}`, "A/A");
    }
    const result = summarize(sites, build);
    for (const chrom of ["X", "Y"] as const) {
      assert.equal(result![chrom].sites, 2, `${build} ${chrom}`);
      assert.equal(result![chrom].called, 2);
      assert.equal(result![chrom].differing, 0);
    }
  }
  const sites = new Map([
    ["X:2750000", "A/G"],
    ["Y:2700000", "C"],
  ]);
  assert.equal(summarize(sites, "GRCh37")!.X.called, 1);
  assert.equal(summarize(sites, "GRCh38")!.X.called, 0);
  assert.equal(summarize(sites, "GRCh37")!.Y.called, 1);
  assert.equal(summarize(sites, "GRCh38")!.Y.called, 0);
});

test("unknown, conflicting and unsupported builds have no fallback estimate", () => {
  for (const build of [undefined, "unknown", "conflicting", "NCBI36", "T2T-CHM13"])
    assert.equal(sexChromosomeSummary(build!, sample(), new Set()), null);
});

test("provider imports deduplicate evidence and withhold contradictory sites", async () => {
  for (const provider of ["23andMe", "AncestryDNA"]) {
    const header =
      provider === "23andMe"
        ? "# 23andMe\n# build 37\n# rsid\tchromosome\tposition\tgenotype\n"
        : "# AncestryDNA\n# build 37\nrsid\tchromosome\tposition\tallele1\tallele2\n";
    const rows = [...sample()].map(([key, gt], i) => {
      const [chrom, pos] = key.split(":");
      return provider === "23andMe"
        ? `rs${i}\t${chrom}\t${pos}\t${gt.replaceAll("/", "")}`
        : `rs${i}\t${chrom === "X" ? "23" : "24"}\t${pos}\t${gt.replaceAll("/", "\t")}`;
    });
    rows.push(rows[0]!);
    const source = await openConsumerFile(new File([header + rows.join("\n")], "synthetic.txt"));
    const stats = await consumerStats(source);
    assert.equal(stats.records, 301);
    assert.equal(stats.sexChromosomes!.X.called, 200);
    assert.equal(stats.sexChromosomes!.estimate, "XY");
    rows.push(provider === "23andMe" ? "rs0\tX\t3000000\t--" : "rs0\t23\t3000000\t0\t0");
    const conflicting = await openConsumerFile(
      new File([header + rows.join("\n")], "synthetic.txt"),
    );
    const changed = await consumerStats(conflicting);
    assert.equal(changed.sexChromosomes!.X.called, 199);
    assert.equal(changed.sexChromosomes!.estimate, null);
  }
});

test("unresolved estimates have no placeholder; resolved disclosures start closed", (t) => {
  const original = globalThis.document;
  globalThis.document = mockDocument();
  t.after(() => {
    globalThis.document = original;
  });
  assert.equal(sexChromosomeFinding(null), null);
  assert.equal(
    sexChromosomeFinding(
      summarize(
        sample(
          () => "A/A",
          () => "?/?",
        ),
      ),
    ),
    null,
  );
  const row = sexChromosomeFinding(summarize(sample()));
  assert.equal(row!.tagName, "details");
  assert.equal(row!.open, false);
  assert.match(row!.innerHTML, /Likely male \(XY\)/);
  assert.match(row!.innerHTML, /200 distinct X sites/);
  assert.match(row!.innerHTML, /have matching letters/);
  assert.match(row!.innerHTML, /just one X chromosome \(typically males\)/);
  const femaleRow = sexChromosomeFinding(
    summarize(
      sample(
        (i) => (i % 3 === 0 ? "A/G" : "A/A"),
        () => "?/?",
      ),
    ),
  );
  assert.match(femaleRow!.innerHTML, /Likely female \(XX\)/);
  assert.match(femaleRow!.innerHTML, /two X chromosomes \(typically females\)/);
  assert.doesNotMatch(femaleRow!.innerHTML, /\bmale genome more likely\./);
});
