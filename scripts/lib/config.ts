import type { BuildOptions } from "./types.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const BUILDS = ["GRCh38", "GRCh37"]; // GRCh38 supplies the GRCh37 frequency join.
export const DATASETS: Record<string, string> = { GRCh38: "gnomad_r4", GRCh37: "gnomad_r4" };
export const FREQUENCY_SOURCE = "gnomad-v4.1-joint";
export const SOURCES = {
  clinvar: (build: string) =>
    `https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_${build}/clinvar.vcf.gz`,
  citations: "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/xml/ClinVarVCVRelease_00-latest.xml.gz",
  pubmed: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
  jointVcf: (chrom: string) =>
    `https://storage.googleapis.com/gcp-public-data--gnomad/release/4.1/vcf/joint/gnomad.joint.v4.1.sites.chr${chrom}.vcf.bgz`,
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
    frequencies: path.join(data, "freqs.gnomad-v4.1-joint.tsv"),
    alleleFrequencies: path.join(data, "freqs.gnomad-v4.1-joint.by-alleleid.tsv"),
    catalog: (build: string) => path.join(output, build, "catalog.tsv.gz"),
    catalogMetadata: (build: string) => path.join(output, build, "catalog.meta.json"),
    markers: (build: string) => path.join(output, build, "markers.json"),
    markerBase: path.join(ROOT, "scripts/markers.base.json"),
  };
}
