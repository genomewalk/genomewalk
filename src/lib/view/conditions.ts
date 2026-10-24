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
