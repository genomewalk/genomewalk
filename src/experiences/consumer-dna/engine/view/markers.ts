import type { Marker, MarkerData } from "../../../../lib/catalogues/types.ts";
import { hasStudyEvidence } from "../../../../lib/catalogues/study-evidence.ts";
import { escape, kvx } from "./html.ts";
import { freqBars, studyLinks } from "./population.ts";
import { frequencyExampleBody } from "../../../../lib/genetics/frequency-example.ts";

export function markerRow(marker: Marker, data: MarkerData) {
  if (!hasStudyEvidence(marker)) return null;
  return kvx(
    `${escape(marker.title)} <span class="mut">· ${escape(marker.gene)}</span>`,
    `<code>${escape(marker.rs)} · ${escape(marker.ref)} → ${escape(marker.alt)}</code>`,
    frequencyExampleBody(marker, data, {
      populationFigure: freqBars(marker, data.pops),
      citations: studyLinks(marker),
    }),
  );
}
