import type { VariantIdentity } from "../../../lib/catalogues/types.ts";

// One result per exact genomic allele, never per gene or condition name.
export function matchKey(hit: VariantIdentity) {
  const chrom = String(hit.chrom).replace(/^chr/, "").replace(/^M$/, "MT");
  return `${chrom}:${Number(hit.pos)}:${hit.ref}:${hit.alt}`;
}

export function variantLocation(hit: VariantIdentity, alleles = `${hit.ref} → ${hit.alt}`) {
  const chrom = String(hit.chrom).replace(/^chr/, "").replace(/^M$/, "MT");
  return `chr${chrom}:${Number(hit.pos).toLocaleString("en-US")} · ${alleles}`;
}
