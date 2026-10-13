import { escape } from "./html.ts";

// Values are already escaped lesson HTML. Keep one set of headings for the
// desktop table, screen readers, and the visible labels on narrow screens.
export function teachingTable(
  label: string,
  columns: { label: string; className: string }[],
  rows: string[][],
) {
  return `<table class="fmt fmt-stack" role="table" aria-label="${escape(label)}">
    <thead role="rowgroup"><tr role="row">${columns.map((column) => `<th role="columnheader" scope="col">${escape(column.label)}</th>`).join("")}</tr></thead>
    <tbody role="rowgroup">${rows
      .map(
        (row) =>
          `<tr role="row">${row.map((value, i) => `<td role="cell" class="${escape(columns[i]!.className)}"><span class="fmt-label" aria-hidden="true">${escape(columns[i]!.label)}</span><div class="fmt-value">${value}</div></td>`).join("")}</tr>`,
      )
      .join("")}</tbody>
  </table>`;
}
