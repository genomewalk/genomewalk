import type { ConsumerCall, ConsumerCounts, ConsumerSource, CountExample } from "../../types.ts";
import { escape, fmt } from "./html.ts";
import { callSignature, isAutosome } from "../calls.ts";

const hasFields = (call: CountExample | undefined): call is CountExample =>
  (call?.fields?.length ?? 0) >= 4;

function letterExplanation(call: ConsumerCall) {
  const letters = call.alleles || [];
  if (letters.length === 2) {
    const [a, b] = letters.map(escape);
    return a === b
      ? `Two ${a}s are reported at this address.`
      : `One ${a} and one ${b} are reported at this address.`;
  }
  return "The reported DNA letters at this address.";
}

function rowCheck(call: ConsumerCall, source: ConsumerSource) {
  if (!source.capabilities.matching)
    return { matchable: false, reason: "The file’s build or reading direction is not supported." };
  if (call.status === "no-call") return { matchable: false, reason: "No DNA letters to compare." };
  if (call.status === "partial")
    return { matchable: false, reason: "Part of the call is missing." };
  if (call.status === "unsupported")
    return {
      matchable: false,
      reason: "I/D codes do not give the DNA letters needed for matching.",
    };
  if (!isAutosome(call.chrom))
    return {
      matchable: false,
      reason: `Chromosome ${escape(call.chrom)} is outside the supported 1–22.`,
    };
  if (call.alleles.length !== 2)
    return { matchable: false, reason: "This row does not report two DNA letters." };
  return {
    matchable: call.canMatch,
    reason: call.canMatch
      ? `Two DNA letters on chromosome ${escape(call.chrom)}.`
      : "This row does not meet the matching rules.",
  };
}

function record(call: CountExample, columns: string[], kind: string, source: ConsumerSource) {
  const { matchable } = rowCheck(call, source);
  return `<div class="row-map-record">
    ${call.fileRow ? `<span class="row-map-number">Row ${fmt(call.fileRow)}</span>` : ""}
    <div class="row-map-data"><dl class="row-map-cells">${columns
      .map((column: unknown, index: number) => {
        const highlight =
          kind === "repeat"
            ? index === 1 || index === 2
            : kind === "outside"
              ? index === 1
              : index >= 3;
        return `<div><dt>${escape(column)}</dt><dd>${highlight ? "<mark>" : ""}${escape(call.fields[index])}${highlight ? "</mark>" : ""}</dd></div>`;
      })
      .join("")}</dl>
      <span class="row-map-status ${matchable ? "is-matchable" : "is-omitted"}"><span aria-hidden="true">${matchable ? "✓" : "×"}</span> ${matchable ? "Matchable" : "Omitted"}</span>
    </div>
  </div>`;
}

// The diagram uses the same bounded real examples as the prose, never invented
// genotypes. Original row numbers identify each example and distinguish repeats.
export function rowDiagram(
  stats: ConsumerCounts,
  source: ConsumerSource,
  { showSummary = true } = {},
) {
  const examples = stats.examples || {};
  const columns = source.header?.columns;
  if (!columns?.length) return "";
  const groups = [];
  const letters = examples.matchable || examples.called;
  if (hasFields(letters))
    groups.push({
      kind: "letters",
      title: "Standard row",
      text: letterExplanation(letters),
      calls: [letters],
    });
  if (hasFields(examples["no-call"]))
    groups.push({
      kind: "missing",
      title: "No-call",
      text: "The address is known. The DNA letters there are not reported.",
      calls: [examples["no-call"]],
    });
  if (hasFields(examples.partial))
    groups.push({
      kind: "partial",
      title: "Partial call",
      text: "Part of the answer is reported; part is missing.",
      calls: [examples.partial],
    });
  const repeat = examples.conflicting || examples.repeated || examples.anyRepeated;
  if (hasFields(repeat?.earlier) && hasFields(repeat?.call))
    groups.push({
      kind: "repeat",
      title: "Two rows, one site",
      text: "The same chromosome + position means the same location in your genome.",
      calls: [repeat.earlier, repeat.call],
    });
  const codes = [examples.insertion || examples.unsupported, examples.deletion]
    .filter(hasFields)
    .filter(
      (call, index, calls) =>
        calls.findIndex((other) => (other.fileRow ?? other) === (call.fileRow ?? call)) === index,
    );
  if (codes.length)
    groups.push({
      kind: "codes",
      title: "I/D codes",
      text: "I means insertion; D means deletion. These codes do not spell out the DNA letters.",
      calls: codes,
    });
  const outside = examples.outsideMatching;
  if (source.capabilities.matching && hasFields(outside) && outside.fileRow !== letters?.fileRow)
    groups.push({
      kind: "outside",
      title: "Other DNA-letter rows",
      text: "Letters are reported, but this row is outside our matching rules.",
      calls: [outside],
    });
  if (!groups.length) return "";
  const shownRows = new Set(
    groups.flatMap(({ calls }) => calls.map((call) => call.fileRow ?? call)),
  );
  const hasMoreRows = stats.records > shownRows.size;

  return `<figure class="consumer-row-map file-row-map" data-allele-columns="${columns.length - 3}" style="--row-map-allele-columns:${columns.length - 3}">
    <figcaption>
      <strong>${showSummary ? "Your file, at a glance" : "Rows side by side"}</strong>
      <span>${showSummary ? "Real rows, grouped by example." : `Selected examples from the first ${fmt(stats.records)} rows read.`}</span>
    </figcaption>
    <div class="row-map-layout" role="region" aria-label="DNA rows and matching checks" tabindex="0">
      <div class="row-map-entries">
        <div class="row-map-head" aria-hidden="true"><span>Reading the rows</span><div class="row-map-data"><div class="row-map-cells">${columns.map((column: unknown) => `<span>${escape(column)}</span>`).join("")}</div><span>Row check</span></div><span class="row-map-check-heading">Why?</span></div>
        ${groups
          .map(({ kind, title, text, calls }) => {
            const checks = calls.map((call) => rowCheck(call, source));
            const reasons = [...new Set(checks.map((check) => check.reason))];
            const sameCalls =
              kind === "repeat" && callSignature(calls[0]!) === callSignature(calls[1]!);
            return `<div class="row-map-group row-map-${kind}">
                <a class="row-map-note" href="#count-${kind}"><strong>${title} <span aria-hidden="true">↘</span></strong><p>${text}</p></a>
                <div class="row-map-records">${calls.map((call) => record(call, columns, kind, source)).join("")}</div>
                <div class="row-map-check"><strong>${checks.every((check) => check.matchable) ? "Why matchable?" : checks.every((check) => !check.matchable) ? "Why omitted?" : "Different row checks"}</strong><p>${reasons.join(" ")}${kind === "repeat" ? (sameCalls ? " Agreeing repeats are combined for results." : " The records differ, so the site is omitted from results after the repeat check.") : ""}</p></div>
              </div>`;
          })
          .join("")}
        ${hasMoreRows ? '<div class="row-map-end" aria-hidden="true"><span>⋮</span></div>' : ""}
      </div>
    </div>
    ${
      showSummary
        ? `<div class="row-map-totals">
      <div><span>Whole file</span><strong>${fmt(stats.records)}</strong><span>data ${stats.records === 1 ? "row" : "rows"}</span></div>
      <div class="is-matchable"><span><span aria-hidden="true">✓</span> Matchable</span><strong>${fmt(stats.eligible)}</strong><span>meet the row rules</span></div>
      <div class="is-omitted"><span><span aria-hidden="true">×</span> Omitted</span><strong>${fmt(stats.records - stats.eligible)}</strong><span>outside the row rules</span></div>
    </div>`
        : ""
    }
    <p class="row-map-file-check">${source.capabilities.matching ? "Your file’s reference build and reading direction are supported." : "Matching is unavailable: the file’s reference build or reading direction is not supported."} ${showSummary ? `Counts show row checks, before repeated sites are resolved. ${hasMoreRows ? "Only selected examples are shown." : "All data rows are shown."}` : "Only row types found in these examples are shown. An omitted row is outside our current matching rules."}</p>
  </figure>`;
}
