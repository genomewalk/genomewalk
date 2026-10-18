import { escape } from "./html.ts";

// Label links are trusted markup; values always remain escaped file text.
export function fileFields(fields: { labelHtml: string; value: string }[], label: string) {
  const cells = fields
    .map(
      ({ labelHtml, value }) =>
        `<div class="cell">${labelHtml}<span class="cell-v">${escape(value)}</span></div>`,
    )
    .join("");
  return `<div class="file-fields" role="region" aria-label="${escape(label)}" tabindex="0">
    <div class="file-fields-row">${cells}</div>
  </div>`;
}

// Accept escaped HTML so callers can retain links and highlights in file text.
export function fileExcerpt(html: string, label = "From the file") {
  return `<div class="raw"><pre role="region" aria-label="${escape(label)}" tabindex="0">${html}</pre></div>`;
}

export function rawBlock(lines: string[], max = 10, label = "From the file") {
  // Align tab-separated rows while preserving standalone ellipsis lines.
  let rows = lines.slice(0, max);
  const cells = rows.map((line) => line.split("\t"));
  const data = cells.filter((row) => !(row.length === 1 && row[0] === "…"));
  if (data.length > 1 && data.every((row) => row.length === data[0]!.length && row.length > 1)) {
    const widths = data[0]!.map((_, i) => Math.max(...data.map((row) => row[i]!.length)));
    rows = cells.map((row) =>
      row.map((value, i) => (i < row.length - 1 ? value.padEnd(widths[i]!) : value)).join("  "),
    );
  }
  const more =
    lines.length > max ? `\n… ${(lines.length - max).toLocaleString()} more lines like these` : "";
  return fileExcerpt(rows.map(escape).join("\n") + more, label);
}
