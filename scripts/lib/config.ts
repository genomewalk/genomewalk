import type { BuildOptions } from "./types.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const BUILDS = ["GRCh38", "GRCh37"]; // GRCh38 supplies the GRCh37 frequency join.
export const DATASETS: Record<string, string> = { GRCh38: "gnomad_r4", GRCh37: "gnomad_r2_1" };
export const SOURCES = {
  clinvar: (build: string) =>
    `https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_${build}/clinvar.vcf.gz`,
  citations: "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/xml/ClinVarVCVRelease_00-latest.xml.gz",
  pubmed: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
  gnomad: "https://gnomad.broadinstitute.org/api",
  bigBed: [
    "https://hgdownload.soe.ucsc.edu/gbdb/hg38/gnomAD/v4.1/exomes/exomes.bb",
    "https://hgdownload.soe.ucsc.edu/gbdb/hg38/gnomAD/v4.1/genomes/genomes.bb",
  ],
};

export function paths(options: BuildOptions = {}) {
  const data = path.resolve(options["data-dir"] || path.join(ROOT, "data"));
  const output = path.resolve(options["out-dir"] || path.join(ROOT, "public/ref"));
  return {
    data,
    output,
    clinvar: (build: string) => path.join(data, `clinvar.${build}.vcf.gz`),
    citationXml: path.join(data, "ClinVarVCVRelease.xml.gz"),
    citations: path.join(data, "clinvar.germline-citations.tsv"),
    frequencies: path.join(data, "freqs.tsv"),
    alleleFrequencies: path.join(data, "freqs.by-alleleid.tsv"),
    tool: path.join(data, "tools/bigBedToBed"),
    catalog: (build: string) => path.join(output, build, "catalog.tsv.gz"),
    catalogIndex: (build: string) => path.join(output, build, "catalog.index.json.gz"),
    markers: (build: string) => path.join(output, build, "markers.json"),
    markerBase: path.join(ROOT, "scripts/markers.base.json"),
  };
}
