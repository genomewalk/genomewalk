import type { VcfHeader } from "../types.ts";
import { headerMap, headerNote as note } from "../../../components/diagrams/header-map.ts";
import { selectHeaderField } from "./header-field-example.ts";

// Keep each selected line intact. Grouping is for teaching; the source line
// numbers identify its original position, including gaps between examples.
export function headerDiagram({ meta, columns }: VcfHeader) {
  const entries = meta.map((text, index) => ({ text, number: index + 1 }));
  const select = (key: string, limit = 1) =>
    entries.filter(({ text }) => text.startsWith(`##${key}=`)).slice(0, limit);
  const fieldExample = selectHeaderField(meta);
  const groups = [
    {
      kind: "format",
      left: note("header-format", "VCF format version", "The VCF rules this file follows."),
      right: note("header-file-type", "VCF or gVCF?", "How the two file types differ."),
      lines: select("fileformat"),
    },
    {
      kind: "reference",
      left: note(
        "reference-build",
        "Reference build",
        "The build used for the file’s coordinates.",
      ),
      right: note("header-genome-map", "Genome map", "Reference sequences and their lengths."),
      lines: [...select("reference"), ...select("contig", 2)],
    },
    {
      kind: "origin",
      left: select("source").length
        ? note("header-made-by", "Made by", "The lab or pipeline that wrote the file.")
        : null,
      right: select("fileDate").length
        ? note("header-date-created", "Date created", "When the file was generated.")
        : null,
      lines: [...select("source"), ...select("fileDate")],
    },
    {
      kind: "fields",
      left: note(
        "header-fields",
        "Field definitions",
        "One example: how to read a field in the data rows.",
      ),
      lines: fieldExample ? [fieldExample] : [],
    },
    {
      kind: "filters",
      right: note(
        "header-filters",
        "Quality filters",
        "Labels for the checks applied to each data row.",
      ),
      lines: select("FILTER", 2),
    },
    {
      kind: "sample",
      left: note("header-sample", "Column names", "The final header line names the data columns."),
      right:
        columns.length > 9
          ? note("header-sample", "Sample ID", "Sample names follow FORMAT.")
          : null,
      lines: columns.length ? [{ text: `#${columns.join("\t")}`, number: meta.length + 1 }] : [],
    },
  ].filter(({ lines }) => lines.length);
  return headerMap({
    label: "Your VCF header, explained",
    groups: groups.map((group) => ({
      ...group,
      lines: group.lines.map((line: { text: string; number: number }) => ({
        ...line,
        keyEnd: line.text.startsWith("##") ? line.text.indexOf("=") : 6,
      })),
    })),
    caption:
      "The <code>##</code> lines describe the file. The <code>#CHROM</code> line names its columns; the data rows begin after it. Line numbers show where each excerpt appears in the original header.",
  });
}
