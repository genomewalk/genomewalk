import { SAMPLE } from "../../src/lib/catalogues/public-sample.ts";

export interface BenchmarkSample {
  id: string;
  name: string;
  build: string;
  url: string;
  bytes: number;
  relationship: string;
  localPath?: string;
  sha256?: string;
  md5?: string;
  checksumUrl?: string;
}

const base = "https://ftp-trace.ncbi.nlm.nih.gov/ReferenceSamples/giab/release/";
export const bundledSample: BenchmarkSample = {
  id: "HG002",
  name: SAMPLE.name,
  build: "GRCh38",
  bytes: SAMPLE.bytes,
  relationship: "Ashkenazim trio child; bundled v5.0q teaching sample",
  url: base + "AshkenazimTrio/HG002_NA24385_son/v5.0q/HG002_GRCh38_v5.0q_smvar.vcf.gz",
  localPath: SAMPLE.url.slice(1),
  sha256: "c7f9d7a4781f1f0a8a42ec54b051d6b95db1935c5e12318bae219740f9c50dc8",
};

// Versioned upstream files; sizes checked against NCBI's Content-Length.
// NCBI publishes md5.in entries for HG001/HG005/HG006/HG007, but not these
// HG002/HG003/HG004 files. All runs record SHA-256 and validate BGZF CRCs.
const sources: [string, string, number, string, string?][] = [
  ["HG001", "NA12878_HG001", 125932193, "Separate individual", "ec61d76ad725d808e3a9e1c8acec402a"],
  ["HG002", "AshkenazimTrio/HG002_NA24385_son", 156252944, "Ashkenazim trio child"],
  ["HG003", "AshkenazimTrio/HG003_NA24149_father", 147212428, "Ashkenazim trio father"],
  ["HG004", "AshkenazimTrio/HG004_NA24143_mother", 148948118, "Ashkenazim trio mother"],
  [
    "HG005",
    "ChineseTrio/HG005_NA24631_son",
    139334496,
    "Chinese trio child",
    "35fe853b7e8d979daa91033ed6863e98",
  ],
  [
    "HG006",
    "ChineseTrio/HG006_NA24694_father",
    117161667,
    "Chinese trio father",
    "d02b15294b232f96506dea2dd8d6d82d",
  ],
  [
    "HG007",
    "ChineseTrio/HG007_NA24695_mother",
    118171165,
    "Chinese trio mother",
    "336f8cf6806521618779b6c5f4eadeb7",
  ],
];
export const giabGrch38: BenchmarkSample[] = sources.map(
  ([id, directory, bytes, relationship, md5]) => {
    const release = `${base}${directory}/NISTv4.2.1/`;
    const name = `${id}_GRCh38_1_22_v4.2.1_benchmark.vcf.gz`;
    return {
      id,
      name,
      build: "GRCh38",
      bytes,
      relationship,
      url: `${release}GRCh38/${name}`,
      ...(md5 ? { md5, checksumUrl: release + "md5.in" } : {}),
    };
  },
);
export const suites: Record<string, BenchmarkSample[]> = {
  hg002: [bundledSample],
  "giab-grch38": giabGrch38,
};
