/** Shared wording for catalogue results and teaching examples. */
export function frequencySourceNote(source: {
  gnomadFilter?: string;
  gnomadDiscordanceP?: number | null;
}) {
  const notes: string[] = [];
  const filter = source.gnomadFilter;
  if (filter && filter !== ".") notes.push("gnomAD v4.1 combined exome and genome data.");
  const filtered: Record<string, string> = {
    EXOMES_FILTERED: "exome data",
    GENOMES_FILTERED: "genome data",
    BOTH_FILTERED: "both datasets",
  };
  if (filter && filtered[filter])
    notes.push(
      `gnomAD flags this variant in ${filtered[filter]} for failing quality filters; treat the frequency with caution.`,
    );
  if (source.gnomadDiscordanceP != null && source.gnomadDiscordanceP < 0.0001)
    notes.push("gnomAD reports a substantial difference between exome and genome frequencies.");
  return notes.join(" ");
}
