import type { Marker, MarkerData } from "../catalogues/types.ts";
import { frequencyEntryPreview } from "../catalogues/catalogue-preview.ts";

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
const link = (url: string, label: string) =>
  `<a href="${escape(url)}" target="_blank" rel="noopener">${escape(label)} ↗</a>`;

export function frequencyExampleIntro(marker: Marker | undefined, citations: string) {
  if (!marker) return "";
  return `<p>Consider the <span class="o1">${escape(marker.alt)}</span> variant at the alcohol-flush spot in the
    ALDH2 gene, where the reference has <span class="o0">${escape(marker.ref)}</span> (${citations}).
    If you carried this variant, how common would it be in different populations?</p>`;
}

// Both formats teach from the same catalogue record; no personal call is used.
export function frequencyExampleBody(
  marker: Marker,
  data: MarkerData,
  { populationFigure, citations }: { populationFigure: string; citations: string },
) {
  const dataset = data.dataset || (data.build === "GRCh37" ? "gnomad_r2_1" : "gnomad_r4");
  const variant = [marker.chrom, marker.pos, marker.ref, marker.alt].join("-");
  return `<div class="frequency-example-overview">
      <div class="frequency-example-columns">
        <div class="frequency-example-copy">
          <p>If you carried <b class="o1">${escape(marker.alt)}</b> at this position, these counts would show how common
            that allele is in each population.</p>
          <p class="mini">The catalogue key is <b>CHROM : POS : REF : ALT</b>.</p>
        </div>
        ${frequencyEntryPreview(marker, data)}
      </div>
    </div>
    <p class="sub">How common <span class="o1">${escape(marker.alt)}</span> is, per population${marker.source === "exomes" ? " (exome counts)" : ""}:</p>
    ${populationFigure}
    ${marker.af! > 0.5 ? `<p>This alternative allele is more common than the reference in these data. “Alternative” means different from the reference, not necessarily unusual.</p>` : ""}
    <p class="mini">Research sources: ${citations}</p>
    ${marker.studyNote ? `<p class="mini">${escape(marker.studyNote)}</p>` : ""}
    <p class="mini">${link(`https://www.ncbi.nlm.nih.gov/snp/${marker.rs}`, marker.rs)} · ${link(`https://gnomad.broadinstitute.org/variant/${variant}?dataset=${dataset}`, "gnomAD")}</p>`;
}
