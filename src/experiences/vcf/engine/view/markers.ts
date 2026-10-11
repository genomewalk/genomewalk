import type { Marker, MarkerData } from "../../../../lib/catalogues/types.ts";
import { frequencyComparison } from "../../../../components/diagrams/frequency-comparison.ts";
import { hasStudyEvidence, studyCitations } from "../../../../lib/catalogues/study-evidence.ts";
import { ext, escape, kvx } from "./html.ts";
import { pct, freqBars, PERSON_PATH } from "./population.ts";
import { frequencyExampleBody } from "../../../../lib/genetics/frequency-example.ts";

export const FEATURED = ["rs671", "rs12913832", "rs17822931", "rs9923231", "rs4988235"];

export const featuredMarkers = (data: MarkerData) =>
  FEATURED.map((rs) => data.markers.find((m) => m.rs === rs)).filter(hasStudyEvidence);

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

export function markerRow(m: Marker, data: MarkerData) {
  if (!hasStudyEvidence(m)) return null;
  return kvx(
    `${escape(m.title)} <span class="mut">· ${escape(m.gene)}</span>`,
    `<code>${escape(m.rs)} · ${escape(m.ref)} → ${escape(m.alt)}</code>`,
    frequencyExampleBody(m, data, {
      populationFigure: freqBars(m, data.pops),
      citations: studyLinks(m),
    }),
  );
}
