import type { ConsumerSource } from "../../types.ts";
import { detectReferenceBuild } from "../../../../lib/genetics/reference-build.ts";
import { consumerHeaderDiagram } from "../view/header-diagram.ts";
import { el, escape, fmt, kvx, ext, SOURCES } from "../view/html.ts";

export function renderHeader(source: ConsumerSource, out: HTMLElement) {
  const comments = source.header.lines.filter((line) => !line.columns).map((line) => line.text);
  const headerDetail = (id: string, title: string, value: string, body: string, raw?: string[]) => {
    const card = kvx(title, value, body, raw?.length ? raw : undefined);
    card.id = id;
    return card;
  };
  out.append(
    el(
      "p",
      "s-why",
      `Your browser reports <b>${fmt(source.size)} bytes</b> for the selected file.
      This is its file size, not a value in the DNA header; for ZIP or gzip files, it is the compressed size.
      File size does not tell us how much of your genome was tested.`,
    ),
  );
  out.append(el("div", "header-overview", consumerHeaderDiagram(source)));
  out.append(el("div", "sub", "Explore the header:"));
  const buildName = SOURCES.build[source.build]
    ? ext(SOURCES.build[source.build]!, `<code>${escape(source.build)}</code>`)
    : `<code>${escape(source.build)}</code>`;
  const buildExplanation =
    source.build === "unknown"
      ? "We could not identify the reference build, and you continued without selecting one. You can explore the file, but catalogue matching is unavailable."
      : source.build === "conflicting"
        ? "The header mentions more than one reference build. We cannot select one reliably."
        : source.buildSource === "selected by you"
          ? `${buildName} was <b>selected by you</b> because we could not identify the build from the file.`
          : source.buildSource === "file header"
            ? `Your file's header says it uses ${buildName}.`
            : `The header does not name a build. ${buildName} comes from the ${escape(source.buildSource)}.`;
  out.append(
    headerDetail(
      "header-source",
      "Source",
      escape(source.label),
      `<p>The header names <b>${escape(source.label)}</b> as the source of this raw genotype export.</p>`,
      comments
        .filter((line) => line.toLowerCase().includes(source.label.toLowerCase()))
        .slice(0, 1),
    ),
  );
  out.append(
    headerDetail(
      "reference-build",
      "Reference build",
      `<code>${escape(source.build)}</code>${source.buildSource === "selected by you" ? " · Selected by you" : ""}`,
      `<div class="reference-detail">
         <p>A <b>reference genome</b> is a shared DNA sequence that scientists use for comparison. A <b>reference build</b> is a version of it, such as GRCh37 or GRCh38. ${buildExplanation}</p>
         <p>We look for common build names in the file's comments. When AncestryDNA omits build information, we use its documented export format. If we still cannot identify the build, we ask you before matching. Your selection applies only to this file for this visit.</p>
         <p>A whole-genome results file can save space by listing changes instead of repeating all the matching DNA letters. Here is a made-up example:</p>
<pre class="align">position   1 2 3 4 5 6 7 8
reference  A C G <i>T</i> A G T <i>G</i>
you        A C G <i>A</i> A G T <i>T</i></pre>
         <p>Only positions 4 and 8 differ. The file could record just those two changes:</p>
<pre class="align">position 4:  <i>T</i> → <i>A</i>
position 8:  <i>G</i> → <i>T</i></pre>
         <p>Using the wrong reference build when matching your DNA to condition records can lead to <b>incorrect or missed matches</b>.</p>
         <p><b>Your ${escape(source.label)} file works differently.</b> It lists selected tested sites, including ones that match the reference. The build still tells us where those sites are. A site may also have a name called an <b>rsID</b>, such as ${ext(`${SOURCES.dbsnp}rs4988235`, "<code>rs4988235</code>")}. That gives us another way to find it, even if its position changes between builds. We will explore rsIDs later.</p>
         </div>`,
      comments.filter(
        (line) =>
          detectReferenceBuild([line]) !== "unknown" ||
          /\b(?:reference|assembly|build)\b/i.test(line),
      ),
    ),
  );
  const strandExplanation =
    source.strandSource === "file header"
      ? source.strand === "conflicting"
        ? "The header mentions both forward and reverse strands, so we cannot select one reliably."
        : `The header states that DNA letters use the <b>${escape(source.strand)}</b> strand.`
      : `The comments do not state a strand. The <b>${escape(source.strand)}</b> reading direction comes from the ${escape(source.strandSource)}.`;
  out.append(
    headerDetail(
      "header-strand",
      "Reading direction",
      escape(source.strand),
      `<p>${strandExplanation} ${
        source.strand === "forward"
          ? "DNA has two complementary strands; <b>forward</b> means the letters are reported in the same orientation as the reference genome. Our catalogues use this convention too."
          : "Catalogue matching requires the forward strand."
      }</p>`,
      comments.filter((line) =>
        /(?:plus|positive|forward|minus|negative|reverse|\([+-]\))\s+strand/i.test(line),
      ),
    ),
  );
  const ancestry = source.provider === "AncestryDNA";
  out.append(
    headerDetail(
      "header-columns",
      "Columns & reported alleles",
      ancestry ? "allele1 · allele2" : "genotype",
      `<p><code>rsid</code> identifies the marker, <code>chromosome</code> and <code>position</code> locate it on the reference build, and ${
        ancestry
          ? "<code>allele1</code> and <code>allele2</code> hold the reported alleles in separate columns"
          : "<code>genotype</code> holds the reported alleles together in one column"
      } (or no-call codes when missing).</p>`,
      source.header.lines.filter((line) => line.columns).map((line) => line.text),
    ),
  );
}
