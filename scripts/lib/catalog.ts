import type { ResolvedOptions } from "./types.ts";
import { buildCatalogRanges } from "./catalog-ranges.ts";
import {
  CATALOG_HEADER,
  FREQUENCY_HEADER,
  ALLELE_HEADER,
  parseClinvar,
  catalogFields,
  MISSING_FREQUENCY,
} from "./clinvar.ts";
import type fs from "node:fs";
import { requireFiles, textLines, readLines, bgzfWriter, atomicWriter, log, mb } from "./util.ts";
import { readCitationIndex } from "./reference/clinvar-citations.ts";

async function frequencyIndex(file: fs.PathLike, build: string) {
  const result = new Map<string, { values: string[]; sourceKey: string }>();
  let header = false;
  for await (const line of textLines(file)) {
    if (!header) {
      if (line !== (build === "GRCh38" ? FREQUENCY_HEADER : ALLELE_HEADER))
        throw new Error(`Outdated frequency schema in ${file}; run npm run data:frequencies`);
      header = true;
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const fields = line.split("\t");
    if (fields.length !== (build === "GRCh38" ? 11 : 9))
      throw new Error(`Malformed frequency row in ${file}`);
    const key = build === "GRCh38" ? fields.slice(0, 4).join(":") : fields[0]!;
    result.set(key, {
      values: fields.slice(build === "GRCh38" ? 4 : 1, build === "GRCh38" ? 11 : 8),
      sourceKey: build === "GRCh38" ? fields.slice(0, 4).join("-") : fields[8]!,
    });
  }
  if (!header) throw new Error(`Empty frequency input: ${file}`);
  return result;
}

export async function buildCatalog({
  paths,
  build = "GRCh38",
  "join-only": joinOnly = false,
}: ResolvedOptions) {
  if (joinOnly && build !== "GRCh38") throw new Error("--join-only applies to GRCh38");
  const frequencyFile = build === "GRCh38" ? paths.frequencies : paths.alleleFrequencies;
  requireFiles(paths.clinvar(build), frequencyFile, ...(joinOnly ? [] : [paths.citations]));
  const { date: citationDate, pmids: citations } = joinOnly
    ? { date: "", pmids: new Map<string, Set<string>>() }
    : await readCitationIndex(paths.citations);
  const frequencies = await frequencyIndex(frequencyFile, build);
  const catalog = joinOnly ? null : bgzfWriter(paths.catalog(build));
  const alleleMap = build === "GRCh38" ? atomicWriter(paths.alleleFrequencies) : null;
  let releaseDate = "",
    kept = 0,
    mapped = 0;
  const tally: Record<string, number> = {};
  try {
    catalog?.write(CATALOG_HEADER + "\n");
    alleleMap?.write(ALLELE_HEADER + "\n");
    for await (const line of readLines(paths.clinvar(build))) {
      if (line.startsWith("##fileDate=")) releaseDate = line.slice(11).trim();
      const record = parseClinvar(line);
      if (!record) continue;
      const {
        values = MISSING_FREQUENCY,
        sourceKey = build === "GRCh38" ? record.frequencyKey : "",
      } = frequencies.get(build === "GRCh38" ? record.key : record.info["ALLELEID"]!) || {};
      if (alleleMap && values[0] !== "." && record.info["ALLELEID"]) {
        alleleMap.write(`${record.info["ALLELEID"]}\t${values.join("\t")}\t${sourceKey}\n`);
        mapped++;
      }
      catalog?.write(
        catalogFields(record, {
          frequency: values,
          frequencyKey: sourceKey,
          pmids: citations.get(record.variationId),
          releaseDate,
          citationDate,
        }).join("\t") + "\n",
      );
      kept++;
      tally[record.code] = (tally[record.code] || 0) + 1;
    }
    if (!kept) throw new Error("No selected ClinVar rows; previous indexes preserved");
    const size = catalog?.commit();
    alleleMap?.commit();
    if (catalog) await buildCatalogRanges({ paths, build });
    if (catalog)
      log(
        `${build}: ${kept.toLocaleString()} records, ${mb(size)} → ${paths.catalog(build)}`,
        tally,
      );
    if (alleleMap) log(`${mapped.toLocaleString()} allele IDs → ${paths.alleleFrequencies}`);
    return { kept, mapped, tally };
  } catch (error) {
    catalog?.abort();
    alleleMap?.abort();
    throw error;
  }
}
