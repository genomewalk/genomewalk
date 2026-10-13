import { el } from "../../../../lib/view/html.ts";
import { rawBlock } from "../../../../lib/view/file-excerpt.ts";
export { rawBlock } from "../../../../lib/view/file-excerpt.ts";
export { el, fmt, MB, escape, ext, SOURCES, kv, note, tile } from "../../../../lib/view/html.ts";
export { splitBar } from "../../../../components/diagrams/share-chart.ts";

export function kvx(k: string, v: string, detail: string, raw?: string[]) {
  const d = el("details", "kvx");
  d.innerHTML = `<summary><span>${k}</span><b>${v}</b><i class="kvx-caret">+</i></summary>
    <div class="kvx-body">${detail}${raw ? rawBlock(raw) : ""}</div>`;
  return d;
}
