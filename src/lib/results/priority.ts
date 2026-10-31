import type { Evidence } from "../catalogues/types.ts";
import { resultCategories, SIG_LABEL } from "./evidence.ts";

export const RESULT_PRIORITY_GROUPS = [
  {
    id: "reviewed",
    label: "Review first",
    description: "Pathogenic or likely pathogenic classifications with 2–4 ClinVar review stars.",
  },
  {
    id: "limited",
    label: "Less-reviewed disease claims",
    description: "Pathogenic or likely pathogenic classifications with limited review evidence.",
  },
  {
    id: "context",
    label: "Additional context",
    description:
      "Conflicting classifications, drug responses, associations, traits and other records.",
  },
  {
    id: "verification",
    label: "Needs verification",
    description:
      "Incomplete or contradictory calls in your file. Check the original records first.",
  },
] as const;

const diseaseOrder: Record<string, number> = { P: 0, PLP: 1, LP: 2 };
const reviewStars = (h: Evidence) =>
  Number.isInteger(h.stars) && h.stars >= 0 && h.stars <= 4 ? h.stars : 0;

export function reviewPriority(h: Evidence) {
  if (h.partialCall || h.conflictingRecords) return RESULT_PRIORITY_GROUPS[3];
  if (Object.hasOwn(diseaseOrder, h.sig))
    return RESULT_PRIORITY_GROUPS[reviewStars(h) >= 2 ? 0 : 1];
  return RESULT_PRIORITY_GROUPS[2];
}

/** Stable ties retain input order; frequency never promotes or demotes a result. */
export function compareReviewPriority(a: Evidence, b: Evidence) {
  const groupA = reviewPriority(a),
    groupB = reviewPriority(b);
  const groupOrder =
    RESULT_PRIORITY_GROUPS.indexOf(groupA) - RESULT_PRIORITY_GROUPS.indexOf(groupB);
  if (groupOrder) return groupOrder;
  const stars = reviewStars(b) - reviewStars(a);
  if (stars) return stars;
  return groupA.id === "reviewed" || groupA.id === "limited"
    ? diseaseOrder[a.sig]! - diseaseOrder[b.sig]!
    : 0;
}

export function reviewPriorityReason(h: Evidence): string {
  if (h.conflictingRecords)
    return "Your file reports different genotypes; verify the original calls.";
  if (h.partialCall) return "Part of the genotype is missing; verify the original call.";
  const group = reviewPriority(h);
  if (group.id === "reviewed" || group.id === "limited") {
    const review =
      [
        "review criteria unavailable (0 stars)",
        "limited review (1 star)",
        "multiple submitters agree (2 stars)",
        "expert-panel review (3 stars)",
        "practice guideline (4 stars)",
      ][h.stars] || "review status unavailable";
    return `${group.id === "reviewed" ? "Listed first: " : ""}${SIG_LABEL[h.sig]!.toLowerCase()} classification; ${review}.`;
  }
  if (h.sig === "C") return "ClinVar submissions disagree about the classification.";
  const categories = resultCategories(h);
  if (categories.includes("drug")) return "ClinVar reports a medication-response association.";
  if (categories.includes("trait")) return "ClinVar reports a non-disease trait classification.";
  if (categories.includes("association"))
    return "ClinVar reports an association, risk or protective effect.";
  return "Additional ClinVar context; see the original classification.";
}
