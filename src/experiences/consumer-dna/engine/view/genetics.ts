import type { ConsumerCall } from "../../types.ts";
import { ctx } from "../context.ts";
import { escape, fmt } from "./html.ts";

export function chromoRow(lit: string) {
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

// Use the same strand-with-arrow vocabulary as the VCF lessons.
// Consumer exports provide calls at the selected site, not the neighbouring sequence.
export function callPositionDiagram(call: ConsumerCall) {
  const prefix = "· · · ";
  const strands = call.alleles
    .map(
      (allele, i) =>
        `<div class="strand"><span class="who">allele ${i + 1}</span><code>${prefix}<i>${escape(allele ?? "?")}</i> · · ·</code></div>`,
    )
    .join("");
  return `<figure class="mk-spot consumer-example-location" aria-label="Chromosome ${escape(call.chrom)}, position ${fmt(call.pos)}, reported alleles ${escape(call.alleles.map((a) => a ?? "unknown").join(" and "))}">
    <span class="mk-lbl">Chromosome <b>${escape(call.chrom)}</b> · position <b>${fmt(call.pos)}</b></span>
    <div class="chromo-strand mk-zoom">
      <div class="diagram-scroll" role="region" aria-label="Reported alleles at the same chromosome position" tabindex="0"><div class="strand-rows">
        ${strands}
        <div class="strand mk-arrow" aria-hidden="true"><span class="who"></span><code>${" ".repeat(prefix.length)}↑</code></div>
      </div></div>
      <p class="diagram-scroll-hint">Scroll sideways to compare the aligned DNA letters.</p>
    </div>
    <figcaption class="mini">Your reported letters at this site. ${call.alleles.includes(null) ? "? means no call was reported. " : ""}The dots stand for surrounding DNA, which is not shown. Diagram not to scale.</figcaption>
  </figure>`;
}
