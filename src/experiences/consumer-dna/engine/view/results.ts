import { frequencySourceNote } from "../../../../lib/genetics/frequency-source.ts";
import type { ConsumerMatch } from "../../types.ts";
import { resultSources } from "../../../../lib/results/sources.ts";
import { copyIllustration } from "../../../../lib/results/copy-illustration.ts";
import { reviewPriorityReason } from "../../../../lib/results/priority.ts";
import { calledLetters } from "../calls.ts";
import { conditionUrl } from "../../../../lib/results/condition-links.ts";
import { ctx } from "../context.ts";
import { matchKey, variantLocation } from "../match-identity.ts";
import {
  SIG_LABEL,
  stars,
  resultCategories,
  resultSummary,
  reviewText,
} from "../../../../lib/results/evidence.ts";
import { condList, condTitle } from "../../../../lib/view/conditions.ts";
import { SOURCES, escape, ext, fmt, kvx, rawBlock } from "./html.ts";
import { pct, personDefs, personFigure } from "./population.ts";

export function matchRow(h: ConsumerMatch) {
  if (h.partialCall || h.conflictingRecords) {
    const location = variantLocation(
      h,
      h.conflictingRecords ? "conflicting calls" : "partial call",
    );
    const row = kvx(
      `<span class="mh-title">Needs verification</span><span class="mh-location">${escape(location)}</span><span class="mh-priority-reason">${escape(reviewPriorityReason(h))}</span>`,
      "",
      rawBlock([
        "#" + ctx.header!.columns.join("\t"),
        ...(h.sourceCalls || [h.call.fields]).map((f) => f.join("\t")),
      ]),
    );
    row.classList.add("match-row", "match-verification");
    row.dataset["variantKey"] = matchKey(h);
    row.querySelector<HTMLElement>(".mh-location")!.title = location;
    row.querySelector<HTMLElement>(".kvx-caret")!.setAttribute("aria-hidden", "true");
    return row;
  }
  const v = resultSummary(h),
    conds = condList(h.conditions);
  const called = calledLetters(h.call);
  // Compact SNP genotypes (CT, TT); keep sequence alleles separated for indels.
  const genotype = called.join(called.every((l) => /^[ACGT?]$/i.test(l)) ? "" : " / ");
  const letters = called
    .map((l) =>
      l === "?"
        ? '<span class="mut">unknown</span>'
        : `<span class="${l === h.ref ? "o0" : "o1"}">${escape(l)}</span>`,
    )
    .join(" and ");
  const zyg = h.ploidy === 1 ? "single copy" : h.copies === 1 ? "one copy" : "two copies";
  const rs =
    (h.rsIds || "")
      .split("|")
      .filter((id) => /^\d+$/.test(id))
      .map((id) => `rs${id}`)[0] || (h.call.id || "").split(";").find((id) => /^rs\d+$/.test(id));
  const location = variantLocation(h, genotype),
    categories = resultCategories(h);
  const shortClass =
    h.sig === "O"
      ? categories.includes("drug")
        ? "Drug response"
        : categories.includes("trait")
          ? "Affects"
          : categories.includes("association")
            ? "Association"
            : "Other context"
      : SIG_LABEL[h.sig] || h.sig;
  const fullClass = h.rawSig ? h.rawSig.replaceAll("_", " ").replaceAll("|", " · ") : shortClass;
  const gnomad = h.gnomadKey
    ? ext(
        `https://gnomad.broadinstitute.org/variant/${encodeURIComponent(h.gnomadKey)}?dataset=gnomad_r4`,
        "gnomAD",
      )
    : "";
  const figures = (
    [
      ["Overall", h.af],
      [h.grp || "Highest population", h.afmax],
    ] satisfies [string, number | null][]
  ).filter((row): row is [string, number] => Number.isFinite(row[1]));
  const frequency = figures.length
    ? `<div class="fpeople two">${personDefs()}${figures
        .map(
          ([label, value]) =>
            `<div class="fp${label === "Overall" ? " all" : ""}">${personFigure(value, escape(`${label}: ${pct(value)} of allele copies`))}<span class="fp-n">${pct(value)}</span><span class="fp-l">${escape(label)}${label === "Overall" ? "" : "<br><small>highest group</small>"}</span></div>`,
        )
        .join("")}</div>
    <span class="mini">Colour shows the share of allele copies. Tiny non-zero values use a minimum fill; the number gives the percentage. ${gnomad}</span>`
    : `No usable frequency in this catalogue. ${gnomad}`;
  const row = kvx(
    `<span class="mh-title"><span class="mh-gene">${escape(h.gene || "(no gene named)")}</span>${rs ? `<span class="mh-id">${escape(rs)}</span>` : ""}</span><span class="mh-condition mut">${escape(condTitle(h.conditions))}</span><span class="mh-location">${escape(location)}</span><span class="mh-priority-reason">${escape(reviewPriorityReason(h))}</span>`,
    `<span class="mh"><code title="${escape(fullClass)}">${escape(shortClass)}</code><span class="stars" title="${escape(reviewText(h))}">${stars(h.stars)}</span><span class="mh-z">${zyg}${copyIllustration(h)}</span></span>`,
    `${h.recordCount > 1 ? `<p class="match-record-note">${fmt(h.recordCount)} file records for this variant are shown as one result. The called alleles agree.</p>` : ""}
     <div class="raw-first">${rawBlock(["#" + ctx.header!.columns.join("\t"), ...(h.sourceCalls || [h.call.fields]).map((f) => f.join("\t"))])}</div>
     <div class="table-scroll" role="region" aria-label="Variant evidence" tabindex="0"><table class="fmt fmt-result"><tbody>
       <tr><td class="fk">Bottom line</td><td class="fd">${escape(v.why)}</td></tr>
       <tr><td class="fk">You & ClinVar</td><td class="fd">
         <p>Your ${called.length === 1 ? "allele" : "alleles"}: <b>${letters}</b>.</p>
         <p>ClinVar allele: <b class="flag">${escape(h.alt)}</b> — <b>${escape(fullClass)}</b>.</p>
       </td></tr>
       <tr><td class="fk">Condition${conds.length === 1 ? "" : "s"}</td><td class="fd">${
         conds.length
           ? `<ul class="plain conds">${conds
               .map((c) => {
                 const url = conditionUrl(h, c);
                 return `<li>${url ? ext(url, escape(c)) : escape(c)}</li>`;
               })
               .join(
                 "",
               )}</ul>${conds.length > 1 ? '<span class="mini">Names reported in ClinVar; they may describe different conditions.</span>' : ""}`
           : "The submitter did not name a condition."
       }</td></tr>
       <tr><td class="fk">Trust</td><td class="fd"><span class="stars">${stars(h.stars)}</span> ${h.stars} ${h.stars === 1 ? "star" : "stars"} — ${escape(reviewText(h))}. ${ext(SOURCES.clinvarStars, "About the stars")}</td></tr>
       <tr><td class="fk">Frequency</td><td class="fd">${frequency}<p class="mini">${escape(frequencySourceNote(h))}</p></td></tr>
       <tr><td class="fk">Sources</td><td class="fd">${resultSources(h)}</td></tr>
     </tbody></table></div>`,
  );
  row.classList.add("match-row");
  row.dataset["variantKey"] = matchKey(h);
  row.querySelector<HTMLElement>(".mh-location")!.title = location;
  row.querySelector<HTMLElement>(".mh-condition")!.title =
    conds.join(" · ") || condTitle(h.conditions);
  row.querySelector<HTMLElement>(".mh-gene")!.title = h.gene || "(no gene named)";
  row.querySelector<HTMLElement>(".kvx-caret")!.setAttribute("aria-hidden", "true");
  return row;
}
