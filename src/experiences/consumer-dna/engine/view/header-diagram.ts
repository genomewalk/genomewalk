import type { ConsumerSource } from "../../types.ts";
import { headerMap, headerNote as note } from "../../../../components/diagrams/header-map.ts";

export function consumerHeaderDiagram(source: ConsumerSource) {
  const entries = source.header.lines;
  const comments = entries.filter((line) => !line.columns);
  const provider = comments.find(({ text }) =>
    text.toLowerCase().includes(source.label.toLowerCase()),
  );
  const build = comments.filter(({ text }) =>
    /(?:GRCh\s*|build\s*|assembly\s*)(36|37|38)\b/i.test(text),
  );
  const strand = comments.filter(({ text }) =>
    /(?:plus|positive|forward|minus|negative|reverse|\([+-]\))\s+strand/i.test(text),
  );
  const coordinateLines = [...new Set([...build, ...strand])]
    .sort((a, b) => a.number - b.number)
    .slice(0, 3);
  const columns = entries.find((line) => line.columns);
  const ancestry = source.provider === "AncestryDNA";
  const omitted = [
    !build.length && '<a href="#reference-build">Reference build ↘</a>',
    !strand.length && '<a href="#header-strand">Reading direction ↘</a>',
  ].filter(Boolean);

  return headerMap({
    label: "Your raw DNA header, explained",
    groups: [
      {
        kind: "origin",
        left: note("header-source", "Source", "The provider named in this export."),
        lines: provider ? [provider] : [],
      },
      {
        kind: "reference",
        left: build.length
          ? note("reference-build", "Reference build", "The build used for the file’s coordinates.")
          : null,
        right: strand.length
          ? note("header-strand", "Reading direction", "The strand used to report DNA letters.")
          : null,
        lines: coordinateLines,
      },
      {
        kind: "sample",
        left: note(
          "header-columns",
          "Column names",
          "A marker, its location and the reported alleles.",
        ),
        right: note(
          "header-columns",
          ancestry ? "Two allele columns" : "Genotype column",
          ancestry ? "One reported allele in each column." : "Reported alleles share one column.",
        ),
        lines: columns ? [{ ...columns, keyEnd: columns.text.length }] : [],
      },
    ],
    caption: `The <code>#</code> comments describe the export; the column-heading line introduces its data rows. Line labels refer to the original text export.${omitted.length ? ` Not stated in these comments: ${omitted.join(" and ")}. Open the explanations to see whether the provider’s format supplies those settings.` : ""}`,
  });
}
