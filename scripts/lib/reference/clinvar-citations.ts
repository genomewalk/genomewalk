import fs from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { SaxesParser } from "saxes";
import { atomicWriter } from "../io/atomic.ts";
import { textLines } from "../io/lines.ts";
import { log } from "../log.ts";
import { validPmid } from "../../../src/lib/catalogues/publication-format.ts";

const HEADER = "#ClinVar germline citations v1";
const COLUMNS = "#VariationID\tPMIDs";
const CITATION_PATH =
  "VariationArchive/ClassifiedRecord/Classifications/GermlineClassification/Citation/ID";

/** ClinVar's aggregate list matches its germline citations table. Never infer roles from titles. */
export function citationParser(
  onRelease: (date: string) => void,
  onRecord: (id: string, pmids: string[]) => void,
) {
  const parser = new SaxesParser();
  const stack: string[] = [];
  let variationId = "",
    date = "",
    collecting = false,
    text = "",
    records = 0,
    germlineLists = 0;
  const pmids = new Set<string>();
  parser.on("opentag", (tag) => {
    stack.push(tag.name);
    if (stack.length === 1) {
      if (tag.name !== "ClinVarVariationRelease")
        throw new Error("Expected a ClinVar VCV XML release");
      date = String(tag.attributes["ReleaseDate"] || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))
        throw new Error("Missing or invalid ClinVar XML release date");
      onRelease(date);
    }
    if (tag.name === "VariationArchive" && stack.length === 2) {
      variationId = String(tag.attributes["VariationID"] || "");
      if (!/^[1-9]\d*$/.test(variationId)) throw new Error("Invalid ClinVar VariationID");
      pmids.clear();
    }
    if (
      tag.name === "GermlineClassification" &&
      stack.slice(1).join("/") === CITATION_PATH.replace("/Citation/ID", "")
    )
      germlineLists++;
    if (
      tag.name === "ID" &&
      stack.slice(1).join("/") === CITATION_PATH &&
      tag.attributes["Source"] === "PubMed"
    ) {
      collecting = true;
      text = "";
    }
  });
  parser.on("text", (value) => {
    if (collecting) text += value;
  });
  parser.on("closetag", (tag) => {
    if (collecting && tag.name === "ID") {
      const id = text.trim();
      if (!validPmid(id)) throw new Error("Invalid PubMed ID in ClinVar citations");
      pmids.add(id);
      collecting = false;
    }
    if (tag.name === "VariationArchive" && stack.length === 2) {
      onRecord(
        variationId,
        [...pmids].sort((a, b) => +a - +b),
      );
      records++;
    }
    stack.pop();
  });
  // DTDs are not part of the release contract; do not accept external entities.
  parser.on("doctype", () => {
    throw new Error("Unexpected DTD in ClinVar release");
  });
  parser.on("end", () => {
    if (!date || !records) throw new Error("Empty ClinVar XML release");
    if (!germlineLists) throw new Error("ClinVar XML has no aggregate germline classifications");
  });
  return parser;
}

/** Stream the multi-GB release once; keep only the small publication mapping for later builds. */
export async function extractCitations(xml: string, destination: string) {
  const writer = atomicWriter(destination);
  let records = 0,
    cited = 0;
  const parser = citationParser(
    (date) => writer.write(`${HEADER}\t${date}\n${COLUMNS}\n`),
    (id, pmids) => {
      records++;
      if (pmids.length) {
        writer.write(`${id}\t${pmids.join(",")}\n`);
        cited++;
      }
      if (records % 250_000 === 0)
        log(`ClinVar citations: ${records.toLocaleString()} variants read`);
    },
  );
  try {
    await pipeline(fs.createReadStream(xml), createGunzip(), async (chunks) => {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      for await (const chunk of chunks) parser.write(decoder.decode(chunk, { stream: true }));
      parser.write(decoder.decode()).close();
    });
    writer.write(`#Complete\t${cited}\n`);
    writer.commit();
    log(
      `ClinVar citations: ${cited.toLocaleString()} variants with germline publications → ${destination}`,
    );
  } catch (error) {
    writer.abort();
    throw error;
  }
}

export async function readCitationIndex(file: string) {
  const pmids = new Map<string, Set<string>>();
  let date = "",
    row = 0,
    complete = false;
  for await (const line of textLines(file)) {
    row++;
    const [id, value, extra] = line.split("\t");
    if (row === 1) {
      if (
        id !== HEADER ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value || "") ||
        !Number.isFinite(Date.parse(value!))
      )
        throw new Error("Invalid ClinVar citation cache; run data:citations");
      date = value!;
    } else if (row === 2) {
      if (line !== COLUMNS) throw new Error("Invalid ClinVar citation columns");
    } else if (id === "#Complete" && !complete) {
      if (Number(value) !== pmids.size) throw new Error("Incomplete ClinVar citation cache");
      complete = true;
    } else {
      const ids = (value || "").split(",");
      if (
        complete ||
        extra !== undefined ||
        !/^[1-9]\d*$/.test(id!) ||
        !ids.every(validPmid) ||
        pmids.has(id!)
      )
        throw new Error("Invalid ClinVar citation row");
      pmids.set(id!, new Set(ids));
    }
  }
  if (!complete) throw new Error("Incomplete ClinVar citation cache; run data:citations");
  return { date, pmids };
}
