interface StudyInput {
  cite?: { label?: unknown; url?: unknown } | { label?: unknown; url?: unknown }[] | null;
  read?: unknown;
}
// Citation metadata is curated against the interpretation, not just the gene.
// Share this rule between the site and catalogue builder: no source, no item.
export function studyCitations(marker: StudyInput | null | undefined) {
  const cites = Array.isArray(marker?.cite) ? marker.cite : marker?.cite ? [marker.cite] : [];
  if (!cites.length) return [];
  const result = [];
  for (const cite of cites) {
    if (typeof cite?.label !== "string" || !cite.label.trim() || typeof cite.url !== "string")
      return [];
    try {
      const url = new URL(cite.url);
      if (url.protocol !== "https:" || url.username || url.password) return [];
      result.push({ label: cite.label.trim(), url: url.href });
    } catch {
      return [];
    }
  }
  return result;
}

export function hasStudyEvidence(marker: StudyInput | null | undefined) {
  return (
    studyCitations(marker).length > 0 &&
    Array.isArray(marker?.read) &&
    marker.read.length === 3 &&
    marker.read.every((reading) => typeof reading === "string" && reading.trim())
  );
}
