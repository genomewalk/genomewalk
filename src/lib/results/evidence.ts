import type { CatalogEntry, Evidence } from "../catalogues/types.ts";

export const SIG_LABEL: Record<string, string> = {
  P: "Pathogenic",
  LP: "Likely pathogenic",
  PLP: "Pathogenic / likely pathogenic",
  C: "Conflicting",
  O: "Other context",
  STUDY: "Research reading",
};

export const SIG_MEANING = {
  P: "a pathogenic classification for the reported condition and inheritance context; this is not a diagnosis of the person carrying it",
  LP: "a likely pathogenic classification for the reported condition and inheritance context",
  PLP: "submitters split between the two above",
  C: "submitters disagree; a conflict may involve uncertain or benign classifications without a pathogenic assertion",
  O: "a drug-response, association, risk, protective or other record; see its original classification",
  STUDY: "a cited research reading, separate from any ClinVar classification",
};

export const STAR_TEXT = [
  "criteria unavailable",
  "criteria provided; single or conflicting submissions",
  "multiple submitters agree",
  "expert panel",
  "practice guideline",
];

export const stars = (n: number) => "★".repeat(n) + "☆".repeat(4 - n);

// Categories follow ClinVar's classification vocabulary, never a gene/variant list.
// https://www.ncbi.nlm.nih.gov/clinvar/docs/clinsig/
export const RESULT_CATEGORIES = [
  {
    id: "all",
    label: "All results",
    description:
      "Grouped by ClinVar’s labels. A variant can appear in more than one category, but is listed once here.",
  },
  {
    id: "disease",
    label: "Disease evidence",
    description:
      "Variants labelled “Pathogenic”, “Likely pathogenic”, “Pathogenic / likely pathogenic” or “Conflicting classifications of pathogenicity” by ClinVar.",
  },
  {
    id: "drug",
    label: "Drug response",
    description: "Variants labelled “drug response” by ClinVar.",
  },
  {
    id: "trait",
    label: "Traits",
    description: "Variants labelled “Affects” by ClinVar — its term for non-disease traits.",
  },
  {
    id: "association",
    label: "Associations",
    description:
      "Variants labelled “risk factor”, “risk allele” (including uncertain, likely or established), “association” or “protective” by ClinVar.",
  },
  {
    id: "other",
    label: "Other records",
    description: "Variants with other ClinVar labels that fall outside the categories above.",
  },
];

export function resultCategories(h: Evidence) {
  const labels = (h.rawSig || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .split("|")
    .map((s) => s.trim());
  const categories = new Set<string>();
  if (labels.includes("drug response")) categories.add("drug");
  if (labels.includes("affects")) categories.add("trait");
  if (
    labels.some(
      (s) =>
        /^(?:(?:uncertain|likely|established) )?risk (?:factor|allele)$/.test(s) ||
        ["association", "protective"].includes(s),
    )
  )
    categories.add("association");
  if (["P", "LP", "PLP", "C"].includes(h.sig)) categories.add("disease");
  if (!categories.size) categories.add("other");
  return [...categories];
}

export function reviewText(h: Evidence) {
  if (h.reviewStatus) return h.reviewStatus.replaceAll("_", " ");
  return (
    [
      "Review criteria unavailable",
      h.sig === "C"
        ? "Criteria provided, conflicting classifications"
        : "Criteria provided, single submitter",
      "Criteria provided, multiple submitters, no conflicts",
      "Reviewed by expert panel",
      "Practice guideline",
    ][h.stars] || "Review status unavailable"
  );
}

export const RESULT_ORDER = [
  "conflicting file calls",
  "incomplete call",
  "review context",
  "limited review",
  "frequency unknown",
  "conflicting claims",
  "drug response",
  "trait record",
  "association record",
  "other record",
  "frequency context",
  "common variant",
];

export function resultSummary(h: Evidence) {
  if (h.conflictingRecords)
    return {
      label: "conflicting file calls",
      cls: "mut",
      why: "Your file reports different genotypes here. Check the original lines below.",
    };
  if (h.partialCall)
    return {
      label: "incomplete call",
      cls: "mut",
      why: "Part of your genotype is missing. We cannot give a complete copy count.",
    };
  const categories = resultCategories(h);
  if (!categories.includes("disease")) {
    if (categories.includes("drug"))
      return {
        label: "drug response",
        cls: "mut",
        why: "ClinVar links this variant to a medication response. It does not establish a dose.",
      };
    if (categories.includes("trait"))
      return {
        label: "trait record",
        cls: "mut",
        why: "ClinVar labels this variant “Affects”. The reported trait is listed below.",
      };
    if (categories.includes("association"))
      return {
        label: "association record",
        cls: "mut",
        why: "ClinVar reports an association or a change in risk. The source describes its direction and strength.",
      };
    return {
      label: "other record",
      cls: "mut",
      why: "See the original ClinVar claim and its source below.",
    };
  }
  if (Number.isFinite(h.afmax) && h.afmax! >= 0.05)
    return {
      label: "common variant",
      cls: "mut",
      why: "Common in at least one population. Common variants can still have trait, drug-response or disease-risk associations.",
    };
  if (Number.isFinite(h.afmax) && h.afmax! >= 0.01)
    return {
      label: "frequency context",
      cls: "mut",
      why: "How common it is matters, but frequency alone cannot settle the claim.",
    };
  if (h.sig === "C")
    return {
      label: "conflicting claims",
      cls: "mut",
      why: "ClinVar submissions disagree about this variant.",
    };
  if (!Number.isFinite(h.afmax))
    return {
      label: "frequency unknown",
      cls: "mut",
      why: "This catalogue has no usable frequency for the variant.",
    };
  if (h.stars < 2)
    return {
      label: "limited review",
      cls: "warn",
      why: "The ClinVar claim has limited review evidence. Check its source before drawing conclusions.",
    };
  return {
    label: "review context",
    cls: "mut",
    why: "A reviewed ClinVar claim for an uncommon variant. What it means for you depends on the condition and how it is inherited.",
  };
}

const numeric = (s: string | null | undefined) =>
  s !== "" && s !== "." && s != null && Number.isFinite(Number(s)) ? Number(s) : null;
export function parseCatalogEntry(line: string): CatalogEntry {
  const c = line.split("\t") as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    ...string[],
  ];
  return {
    chrom: c[0],
    pos: +c[1],
    ref: c[2],
    alt: c[3],
    sig: c[4],
    stars: +c[5],
    gene: c[6],
    conditions: c[7],
    af: numeric(c[8]),
    grp: c[9]!,
    afmax: numeric(c[10]),
    an: numeric(c[11]),
    variationId: c[12] || "",
    alleleId: c[13] || "",
    rawSig: c[14] || "",
    reviewStatus: c[15] || "",
    rsIds: c[16] || "",
    hgvs: c[17] || "",
    pmids: (c[18] || "").split(",").filter((x) => /^\d+$/.test(x)),
    releaseDate: c[19] || "",
    citationDate: c[20] || "",
    conflictingSig: c[21] || "",
    gnomadKey: c[22] || "",
    conditionMedgenIds: c[23] || "",
  };
}
