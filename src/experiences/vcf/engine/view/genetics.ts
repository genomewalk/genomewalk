import { ctx } from "../context.ts";

export function chromoRow(lit?: string) {
  const meta = ctx.header ? ctx.header.meta : [];
  const lens = Object.fromEntries(
    meta
      .filter((l) => l.startsWith("##contig="))
      .map((l) => {
        const m = l.match(/ID=([^,>]+),length=(\d+)/);
        return m ? ([m[1]!.replace(/^chr/, "").replace(/^M$/, "MT"), +m[2]!] as const) : null;
      })
      .filter((value) => value != null),
  );
  const ALL = [...Array(22)].map((_, i) => String(i + 1)).concat(["X", "Y", "MT"]);
  const names = ALL.some((c) => lens[c]) ? ALL.filter((c) => lens[c]) : ALL; // only what this file declares
  const maxLen = Math.max(1, ...names.map((c) => lens[c] || 0));
  const on = String(lit).replace(/^chr/, "").replace(/^M$/, "MT");
  const mini = (c: string) => {
    const h = 14 + 26 * ((lens[c] || 0) / maxLen);
    return `<div class="ch${c === on ? " on" : ""}" title="chromosome ${c}"><svg viewBox="0 0 60 96" width="${(h * 0.62).toFixed(0)}" height="${h.toFixed(0)}" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"><path d="M16 10 C 28 36, 28 60, 16 86"/><path d="M44 10 C 32 36, 32 60, 44 86"/></g></svg><span>${c}</span></div>`;
  };
  return { names, html: `<div class="chromos">${names.map(mini).join("")}</div>` };
}

export function sexFigure(which: string, you = false) {
  return `<span class="fig${you ? " you" : ""}" aria-label="${which.toLowerCase()}${you ? " (you)" : ""}">${which === "Female" ? "👩" : "👨"}</span>`;
}

export const chromoSvg = `<svg viewBox="0 0 60 96" width="44" height="70" aria-hidden="true">
  <g fill="none" stroke-width="11" stroke-linecap="round">
    <path class="m" d="M16 10 C 28 36, 28 60, 16 86"/><path class="f" d="M44 10 C 32 36, 32 60, 44 86"/>
  </g><circle cx="30" cy="48" r="5" class="c"/></svg>`;

export const copiesSvg = `<svg class="copies" viewBox="0 0 162 74" width="243" height="111" aria-hidden="true">
  <line x1="105" y1="4" x2="105" y2="58" class="guide"/>
  <text x="0" y="22" class="lbl m">copy 1</text>
  <line x1="48" y1="18" x2="162" y2="18" class="strand m"/>
  <circle cx="105" cy="18" r="9" class="dot m"/><text x="105" y="21.5" class="letter">A</text>
  <text x="0" y="52" class="lbl f">copy 2</text>
  <line x1="48" y1="48" x2="162" y2="48" class="strand f"/>
  <circle cx="105" cy="48" r="9" class="dot f"/><text x="105" y="51.5" class="letter">C</text>
  <text x="105" y="71" class="cap">same position</text>
</svg>`;

export function gtCases(
  ref: string,
  alt: string,
  current?: string | null,
  only?: string | string[],
) {
  const opt = [ref, alt];
  const cases = [
    { gt: "0/0", pick: [0, 0], sum: "both copies match the REF" },
    { gt: "0/1", pick: [0, 1], sum: "one copy each of REF and ALT" },
    { gt: "1/1", pick: [1, 1], sum: "both copies carry the change and match the ALT" },
  ].filter((c) => !only || only.includes(c.gt)); // `only` narrows to the cases a row is about
  return `<div class="cases">${cases
    .map(
      ({ gt, pick, sum }) => `
    <div class="case${gt === current ? " on" : ""}">
      <div class="case-gt">GT <b>${gt}</b></div>
      <div class="case-sum"><b class="o${pick[0]}">${opt[pick[0]!]}</b> and <b class="o${pick[1]}">${opt[pick[1]!]}</b> — ${sum}</div>
    </div>`,
    )
    .join("")}</div>`;
}

export const unknownFigure = `<span class="fig unknown" title="You — step 4 works this out from your data">👤</span>`;

export function chrRank(c: string) {
  const x = c.replace("chr", "");
  return x === "X" ? 23 : x === "Y" ? 24 : x === "MT" ? 25 : +x;
}
