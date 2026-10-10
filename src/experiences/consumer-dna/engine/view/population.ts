import type { Marker, MarkerData } from "../../../../lib/catalogues/types.ts";
import { PERSON_PATH, personFigure, personDefs, pct } from "../../../../lib/view/population.ts";
export {
  PERSON_PATH,
  personFigure,
  personDefs,
  tallyFigure,
  pct,
} from "../../../../lib/view/population.ts";
import { frequencyComparison } from "../../../../components/diagrams/frequency-comparison.ts";
import { hasStudyEvidence, studyCitations } from "../study-evidence.ts";
import { escape, ext } from "./html.ts";

export const studyLinks = (marker: Marker) =>
  studyCitations(marker)
    .map((cite) => ext(cite.url, escape(cite.label)))
    .join(" · ");

export function storyBlock(data: MarkerData) {
  const marker = data.markers.find((item) => item.rs === "rs671" && hasStudyEvidence(item));
  return marker
    ? frequencyComparison(marker, data.pops, { formatPercent: pct, personPath: PERSON_PATH })
    : "";
}

export function freqBars(m: Marker, pops: Record<string, string>) {
  const rows: [string, string | undefined, number | null][] = [
    ["all", "Everyone", m.af],
    ...Object.entries(m.pops).map(([k, v]): [string, string | undefined, number | null] => [
      k,
      pops[k],
      v,
    ]),
  ];
  // each group is one figure, coloured by that group's frequency — 22% means a
  // fifth of the figure — with the number and the group's name underneath
  return `<div class="fpeople">${personDefs()}${rows
    .map(
      ([k, label, v]) =>
        `<div class="fp${k === "all" ? " all" : ""}">${personFigure(v!, `${label}: ${pct(v!)}`)}<span class="fp-n">${pct(v!)}</span><span class="fp-l">${label}</span></div>`,
    )
    .join(
      "",
    )}</div><span class="frequency-scale-note">Colour shows the share of allele copies. Tiny nonzero values use a minimum fill; the percentages show the actual shares.</span>`;
}
