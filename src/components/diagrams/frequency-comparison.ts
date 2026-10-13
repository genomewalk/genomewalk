import type { Marker } from "../../lib/catalogues/types.ts";
import { populationPeople } from "../../lib/genetics/population-frequencies.ts";

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

// Both file formats compare the same example, using their loaded reference build.
export function frequencyComparison(
  marker: Marker,
  populations: Record<string, string>,
  { formatPercent, personPath }: { formatPercent: (n: number) => string; personPath: string },
) {
  const people = populationPeople(marker.pops, populations, {
    formatPercent,
    personPath,
  });
  const context = (value: number | null | undefined) =>
    !Number.isFinite(value)
      ? "No frequency is reported for this group."
      : value! >= 0.05
        ? "<b>Less surprising.</b> Common in this sampled group."
        : "<b>More surprising.</b> Uncommon in this sampled group.";

  return `<p>Imagine Mei and Tom each carry one copy of allele <b class="o1">${escape(marker.alt)}</b>
      in the <b>${escape(marker.gene)}</b> gene. Here is how the population context differs.</p>
    <div class="frequency-comparison">
      <div class="frequency-comparison-body">
        <table role="table" aria-label="Mei and Tom: same variant, different ancestry groups">
          <colgroup><col class="frequency-comparison-topic"><col><col></colgroup>
          <thead><tr>
            <td></td>
            <th scope="col"><span class="frequency-comparison-name">Mei</span><span class="frequency-comparison-ancestry">East Asian ancestry</span></th>
            <th scope="col"><span class="frequency-comparison-name">Tom</span><span class="frequency-comparison-ancestry">European ancestry</span></th>
          </tr></thead>
          <tbody>
            <tr><th scope="row">Frequency of allele ${escape(marker.alt)} in the ${escape(marker.gene)} gene</th>
              <td colspan="2">${people}</td>
            </tr>
            <tr><th scope="row">Is this allele unusual in their ancestry group?</th>
              <td><span class="frequency-comparison-person"><b>Mei</b> · East Asian ancestry</span>${context(marker.pops["eas"])}</td><td><span class="frequency-comparison-person"><b>Tom</b> · European ancestry</span>${context(marker.pops["nfe"])}</td>
            </tr>
            <tr><th scope="row">Could this be a reading error?</th>
              <td colspan="2">Frequency alone cannot tell us. Check the quality of the call.</td>
            </tr>
            <tr><th scope="row">Does this tell us their health risk?</th>
              <td colspan="2">Frequency alone does not calculate either person’s risk.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}
