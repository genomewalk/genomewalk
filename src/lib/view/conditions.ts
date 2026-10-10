const NO_COND = /^(not provided|not specified|see cases|none|unknown|\.|-)$/i;

export const condList = (conds: string) => [
  ...new Set(
    (conds || "")
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c && !NO_COND.test(c)),
  ),
];

export const condTitle = (conds: string) => {
  const l = condList(conds);
  return l.length
    ? l[0] + (l.length > 1 ? ` (+${l.length - 1} more)` : "")
    : "condition not named by the submitter";
};

const JARGON: [RegExp, string][] = [
  [
    /\bNULL\b/,
    '"NULL" (a <em>null allele</em>) means a copy of the gene that makes no working protein at all — it describes the variant, not a disease',
  ],
  [/\bAMORPH/, '"AMORPH" is an older word for the same thing: a copy that produces nothing'],
  [/\bPOLYMORPHISM\b/, '"POLYMORPHISM" means a common, normal variation between people'],
  [/\bPHENOTYPE\b/, '"PHENOTYPE" means an observable characteristic, not necessarily a disease'],
  [
    /\bSUSCEPTIBILITY\b|\bRISK\b/i,
    'a "susceptibility" or "risk" entry claims a raised chance, not a cause',
  ],
];

export function condNotes(conds: string) {
  const text = conds || "";
  const notes = JARGON.filter(([re]) => re.test(text)).map(([, t]) => t);
  if (text.length > 6 && /^[A-Z0-9 ,()\-/|.]+$/.test(text))
    notes.push(
      "a name in capitals is a legacy OMIM label imported into ClinVar long ago — these are usually unreviewed",
    );
  return notes;
}
