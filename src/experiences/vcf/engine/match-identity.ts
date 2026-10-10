import type { VariantIdentity } from "../../../lib/catalogues/types.ts";
import type { VcfObservation, VcfMatch } from "../types.ts";
// One result per exact genomic allele, never per gene or condition name.
export function matchKey(hit: VariantIdentity) {
  const chrom = String(hit.chrom).replace(/^chr/, "").replace(/^M$/, "MT");
  return `${chrom}:${Number(hit.pos)}:${hit.ref}:${hit.alt}`;
}

export function variantLocation(hit: VariantIdentity, alleles = `${hit.ref} → ${hit.alt}`) {
  const chrom = String(hit.chrom).replace(/^chr/, "").replace(/^M$/, "MT");
  return `chr${chrom}:${Number(hit.pos).toLocaleString("en-US")} · ${alleles}`;
}

function callKey(hit: VcfObservation) {
  const fields = hit.f;
  const options = [fields[3], ...fields[4]!.split(",")];
  const gt = (fields[9] || "").split(":")[0];
  // Compare the actual alleles: ALT ordering and unphased GT ordering can differ.
  return gt!
    .split(/[/|]/)
    .map((i) => (options[Number(i)] && i !== "." && i !== "" ? options[Number(i)] : "?"))
    .sort()
    .join("/");
}

export function addUniqueMatch(matches: Map<string, VcfMatch>, hit: VcfObservation) {
  const key = matchKey(hit);
  const existing = matches.get(key);
  if (!existing) {
    matches.set(key, { ...hit, recordCount: 1, sourceCalls: [hit.f], callKeys: [callKey(hit)] });
    return;
  }
  existing.recordCount++;
  const call = callKey(hit);
  if (!existing.callKeys.includes(call)) {
    existing.callKeys.push(call);
    existing.sourceCalls.push(hit.f);
    existing.conflictingRecords = true;
  }
}
