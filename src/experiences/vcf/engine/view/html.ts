import { el, escape } from "../../../../lib/view/html.ts";
export { el, fmt, MB, escape, ext, SOURCES, kv, note, tile } from "../../../../lib/view/html.ts";

export function kvx(k: string, v: string, detail: string, raw?: string[]) {
  const d = el("details", "kvx");
  d.innerHTML = `<summary><span>${k}</span><b>${v}</b><i class="kvx-caret">+</i></summary>
    <div class="kvx-body">${detail}${raw ? rawBlock(raw) : ""}</div>`;
  return d;
}

export function rawBlock(lines: string[], max = 10) {
  // Tab-separated lines that share a column count (a #CHROM header over data
  // lines) are padded so each value sits under its heading; the text is still
  // the file's, only the spacing changes.
  let rows = lines.slice(0, max);
  const cells = rows.map((l) => l.split("\t"));
  if (rows.length > 1 && cells.every((c) => c.length === cells[0]!.length && c.length > 1)) {
    const w = cells[0]!.map((_, i) => Math.max(...cells.map((c) => c[i]!.length)));
    rows = cells.map((c) => c.map((v, i) => (i < c.length - 1 ? v.padEnd(w[i]!) : v)).join("  "));
  }
  const shown = rows.map(escape).join("\n");
  const more =
    lines.length > max ? `\n… ${(lines.length - max).toLocaleString()} more lines like these` : "";
  return `<div class="raw"><span class="raw-k">From the file</span><pre>${shown}${more}</pre></div>`;
}
