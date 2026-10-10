// Keep the explanation and illustration consistent across both file formats.
export function sexChromosomeIntro(format: string, estimate: string) {
  const different = format === "vcf" ? "0/1" : "AG";
  const explanation =
    estimate === "XX"
      ? `When someone has two X chromosomes (typically females), X sites can report two different alleles: <code>${different}</code> (different alleles). Many such X calls make a female genome more likely.`
      : `When someone has just one X chromosome (typically males), the file reports a single allele or matching alleles at most positions on X. This pattern makes a male genome more likely.`;
  return `<p><b>How the file suggests this.</b> ${explanation}</p>`;
}

export function sexChromosomeDiagram(estimate: string, format: string) {
  const vcf = format === "vcf";
  const x = (who: string, cls: string, a: string, b: string) =>
    `<div class="strand"><span class="who ${cls}">${who} · X</span><code>…ACGTAGTGCAT<i class="${cls}">${a}</i>GACCGTA<i class="${cls}">${b}</i>GCTTGCA…</code></div>`;
  const y =
    '<div class="strand"><span class="who f">father · Y</span><code class="dim">…TTGCAAGTCC…</code></div>';
  const panel = (pair: string, label: string, emoji: string, strands: string, caption: string) => {
    const selected = estimate === pair;
    return `<div class="sexcase${selected ? " on" : ""}">
      <div class="sexcase-head"><span class="fig${selected ? " you" : ""}" aria-label="${label}${selected ? " (you)" : ""}">${emoji}</span><b>${pair.split("").join(" ")}</b><span>${label}${selected ? " · you" : ""}</span></div>
      <div class="chromo-strand">${strands}<span>${caption}</span></div>
    </div>`;
  };
  return `<div class="sexcases">
    ${panel(
      "XX",
      "female",
      "👩",
      x("mother", "m", "T", "A") + x("father", "f", "C", "G"),
      `Both parents gave an X. Their letters can differ at the same site, such as <code>${vcf ? "0/1" : "AG"}</code> (different alleles).`,
    )}
    ${panel(
      "XY",
      "male",
      "👨",
      x("mother", "m", "T", "A") + y,
      `The father gave a Y instead of a second X. Most X sites report one letter, or the same letter twice, such as <code>${vcf ? "1/1" : "AA"}</code> (same allele).`,
    )}
  </div>`;
}
