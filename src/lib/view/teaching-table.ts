import { escape } from "./html.ts";

// Values are already escaped lesson HTML. Keep one set of column headings
// at every width and scroll the table when the columns no longer fit.
export function teachingTable(
  label: string,
  columns: { label: string; className: string }[],
  rows: string[][],
) {
  return `<div class="table-scroll" role="region" aria-label="${escape(label)}" tabindex="0"><table class="fmt fmt-teaching" role="table" aria-label="${escape(label)}">
    <thead role="rowgroup"><tr role="row">${columns.map((column) => `<th role="columnheader" scope="col">${escape(column.label)}</th>`).join("")}</tr></thead>
    <tbody role="rowgroup">${rows
      .map(
        (row) =>
          `<tr role="row">${row.map((value, i) => `<td role="cell" class="${escape(columns[i]!.className)}"><div class="fmt-value">${value}</div></td>`).join("")}</tr>`,
      )
      .join("")}</tbody>
  </table></div>`;
}
