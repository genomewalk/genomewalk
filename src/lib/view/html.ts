export const el = <K extends keyof HTMLElementTagNameMap>(
  t: K,
  cls?: string | null,
  html?: string | null,
) => {
  const e = document.createElement(t);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");

export const MB = (b: number) => (b / 1e6).toFixed(1) + " MB";

export function escape(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export const ext = (url: string, label: string) =>
  `<a href="${url}" target="_blank" rel="noopener">${label} ↗</a>`;

export const SOURCES = {
  vcfSpec: (v: string) =>
    `https://samtools.github.io/hts-specs/${/^VCFv4\.[1-5]$/.test(v) ? v : "VCFv4.2"}.pdf`,
  build: {
    GRCh38: "https://www.ncbi.nlm.nih.gov/datasets/genome/GCF_000001405.40/",
    GRCh37: "https://www.ncbi.nlm.nih.gov/datasets/genome/GCF_000001405.25/",
    "T2T-CHM13": "https://www.ncbi.nlm.nih.gov/datasets/genome/GCF_009914755.1/",
  } as Record<string, string>,
  grc: "https://www.ncbi.nlm.nih.gov/grc/human",
  gvcf: "https://gatk.broadinstitute.org/hc/en-us/articles/360035531812-GVCF-Genomic-Variant-Call-Format",
  phred: "https://en.wikipedia.org/wiki/Phred_quality_score",
  dbsnp: "https://www.ncbi.nlm.nih.gov/snp/",
  gnomad: "https://gnomad.broadinstitute.org/",
  clinvar: "https://www.ncbi.nlm.nih.gov/clinvar/",
  clinvarStars: "https://www.ncbi.nlm.nih.gov/clinvar/docs/review_status/",
  arrays: "https://en.wikipedia.org/wiki/SNP_array",
};

export function kv(k: string, v: string | number) {
  return el("div", "kv", `<span>${k}</span><b>${v}</b>`);
}

export function note(html: string) {
  return el("div", "note", html);
}

export function tile(k: string, v: string | number, n?: string) {
  return `<div class="tile"><div class="tk">${k}</div><div class="tv">${v}</div>${n ? `<div class="tn">${n}</div>` : ""}</div>`;
}
