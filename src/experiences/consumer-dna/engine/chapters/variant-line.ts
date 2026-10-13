import type { ConsumerCall } from "../../types.ts";
import { el, escape, ext, fmt, kvx, note, SOURCES } from "../view/html.ts";
import { chromoRow, callPositionDiagram } from "../view/genetics.ts";
import type { ConsumerSource } from "../../types.ts";
import { scrollCue } from "../../../../lib/view/file-excerpt.ts";

function columnExplanation(column: string, source: ConsumerSource) {
  const call = source.example!;
  switch (column.toLowerCase().replace(/\s+/g, "")) {
    case "rsid": {
      const description = /^rs\d+$/i.test(call.id)
        ? `<p>${ext(`${SOURCES.dbsnp}${call.id.toLowerCase()}`, `<code>${escape(call.id)}</code>`)} is a catalogue number from ${ext(SOURCES.dbsnp, "<b>dbSNP</b>")}, a public list of spots where people are known to differ. <code>rs</code> stands for "reference SNP"; the digits are just the entry number.</p>`
        : `<p><code>${escape(call.id)}</code> is a provider-specific marker name rather than an rsID.</p>
           <p>An rsID is a catalogue number from ${ext(SOURCES.dbsnp, "<b>dbSNP</b>")}, a public list of spots where people are known to differ. <code>rs</code> stands for "reference SNP"; the digits are just the entry number.</p>`;
      return `${description}
        <p>Services like 23andMe or AncestryDNA give you a list of rsIDs (or their own marker IDs), their positions and your reported letters at each one — typically hundreds of thousands of spots in all. Whole-genome sequencing examines far more of your DNA, including the regions between those sites.</p>`;
    }
    case "chromosome": {
      const chromosomes = chromoRow(call.chrom);
      if (!chromosomes.names.includes(call.chrom))
        return `<p>Which chromosome this line is about. This row uses the provider’s chromosome code <code>${escape(call.fields[1])}</code>.</p>`;
      return `<p>Which chromosome this line is about. This one is <b>chromosome ${escape(call.chrom)}</b>${call.chrom === "1" ? " — the biggest" : ""}:</p>
        <div class="consumer-example-location">${chromosomes.html}</div>
        <p class="mini">Schematic overview, not to scale. The highlighted chromosome is the one named in this row.</p>`;
    }
    case "position":
      return `<p>Which letter along that chromosome, counting from its start (the first letter is position 1). Position <b>${fmt(call.pos)}</b> is this one:</p>
        ${callPositionDiagram(call)}
        <p>${["GRCh37", "GRCh38", "NCBI36"].includes(source.build) ? `This file uses <code>${escape(source.build)}</code>.` : "This file’s reference build is not established."} Use the same build when looking up that address.</p>`;
    case "genotype":
      return `<p>Your reported DNA letters at this site.</p>
        <p>At a typical site on chromosomes 1–22, you have two copies. The letters can be the same (<code>AA</code>) or different (<code>AG</code>). Each version is called an <b>allele</b>. Their order does not tell us which parent supplied each one.</p>
        <p>Some sites have just one reported letter. <code>--</code> means no call was reported.</p>`;
    case "allele1":
      return `<p>The first reported DNA letter at this site. Read <code>allele1</code> and <code>allele2</code> together.</p>
        <p>At a typical site on chromosomes 1–22, you have two copies. The letters can be the same (<code>A</code> and <code>A</code>) or different (<code>A</code> and <code>G</code>). Each version is called an <b>allele</b>. Their order does not tell us which parent supplied each one.</p>`;
    case "allele2":
      return `<p>The second reported DNA letter at the same site. It can be the same as the first letter or different: <code>C</code> and <code>C</code> mean two Cs.</p>
        <p>The column order does not identify the parent. A <code>0</code> is a missing call, not a DNA letter.</p>`;
    default:
      return "<p>The value reported in this column of your file.</p>";
  }
}

function readGenotype(call: ConsumerCall, splitAlleles: boolean) {
  const reported = splitAlleles
    ? `The pair ${call.fields
        .slice(3)
        .map((value: unknown) => `<code>${escape(value)}</code>`)
        .join(" and ")}`
    : `<code>${escape(call.fields[3])}</code>`;
  if (call.status === "no-call") return `${reported} means no DNA letters were reported here.`;
  if (call.status === "partial")
    return `${reported} has one reported entry and one missing entry. We do not know the missing allele.`;
  if (call.status === "unsupported")
    return `${reported} uses insertion/deletion codes: <b>I</b> means added DNA and <b>D</b> means removed DNA. The codes do not spell out those DNA letters.`;
  const [first, second] = call.alleles.map(escape);
  if (!second) return `${reported} reports a single letter, <b>${first}</b>, at this site.`;
  if (first === second)
    return splitAlleles
      ? `Both entries report <b>${first}</b> — the same allele twice.`
      : `${reported} reports <b>${first}</b> in both entries — the same allele twice.`;
  return `${splitAlleles ? "The two entries report" : `${reported} reports`} <b>${first}</b> and <b>${second}</b> — two different alleles at the same site.`;
}

export function renderVariantLine(source: ConsumerSource, out: HTMLElement) {
  const { columns } = source.header;
  const call = source.example!;
  const { fields } = call;
  const splitAlleles = source.provider === "AncestryDNA";
  const columnId = (column: string) => `variant-${column.toLowerCase().replace(/\s+/g, "")}`;

  out.append(el("div", "sub", "A line from a genome file:"));
  out.append(
    el(
      "div",
      "rawline rawline-scroll sample-row consumer-example-row",
      `<div class="rawline-cells" role="region" aria-label="Consumer DNA example line, all columns" tabindex="0">${columns
        .map(
          (column, i) =>
            `<span class="cell"><a class="cell-k" href="#${escape(columnId(column))}">${escape(column)} <span aria-hidden="true">↘</span></a><span class="cell-v">${escape(fields[i])}</span></span>`,
        )
        .join("")}</div>${scrollCue}`,
    ),
  );
  out.append(
    note(`On chromosome <b>${escape(call.chrom)}</b>${fields[1] !== call.chrom ? ` (written as <code>${escape(fields[1])}</code> here)` : ""} at position <b>${fmt(call.pos)}</b>,
    this row identifies the marker <code>${escape(call.id)}</code>. ${readGenotype(call, splitAlleles)}`),
  );
  out.append(el("div", "sub", "Explore the columns:"));
  for (const [i, column] of columns.entries()) {
    const detail = kvx(
      escape(column.toUpperCase()),
      `<code>${escape(fields[i])}</code>`,
      columnExplanation(column, source),
    );
    detail.id = columnId(column);
    out.append(detail);
  }
}
