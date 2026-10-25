import { AppError } from "../../lib/app-error.ts";
import type { ConsumerSource, ConsumerHeader } from "./types.ts";
import type { Progress } from "../../lib/io/types.ts";
import { unpack, textLines } from "./containers.ts";
import { describeHeader } from "./reader/header.ts";
import { decodeConsumerCall } from "./reader/call.ts";

export { describeHeader, decodeConsumerCall };
export { consumerStats } from "./engine/statistics.ts";

const missingHeaderMessage =
  "We couldn’t find the expected DNA file header. Choose a raw 23andMe or AncestryDNA export, or try the public sample.";

export async function openConsumerFile(file: File, signal?: AbortSignal, onProgress?: Progress) {
  const text = await unpack(file, signal, onProgress);
  if (!text.size)
    throw new AppError("FILE_EMPTY", "This file is empty. Download the raw DNA export again.");
  const meta = [];
  const headerLines: ConsumerHeader["lines"] = [];
  let columns = null;
  let lineNumber = 0;
  for await (const line of textLines(text, null, signal)) {
    lineNumber++;
    const content = line.replace(/^#+\s*/, "").trim();
    if (/^rsid\s*\t/i.test(content)) {
      columns = content.split("\t").map((s) => s.trim());
      headerLines.push({ text: line, number: lineNumber, columns: true });
      break;
    }
    if (line.startsWith("#")) {
      meta.push(line);
      headerLines.push({ text: line, number: lineNumber });
    } else if (line.trim()) throw new AppError("DNA_HEADER_MISSING", missingHeaderMessage);
  }
  if (!columns) throw new AppError("DNA_HEADER_MISSING", missingHeaderMessage);
  const profile = describeHeader(meta, columns);
  const source: ConsumerSource = {
    file,
    size: file.size,
    bytesRead: 0,
    format: "consumer",
    label: profile.provider,
    ...profile,
    header: { meta, columns, lines: headerLines },
    capabilities: {
      matching: ["GRCh37", "GRCh38"].includes(profile.build) && profile.strand === "forward",
      quality: false,
      depth: false,
      referenceBlocks: false,
    },
    async readCalls(each, onProgress, callSignal) {
      let pastHeader = false,
        count = 0;
      for await (const line of textLines(text, onProgress, callSignal)) {
        const content = line.replace(/^#+\s*/, "").trim();
        if (/^rsid\s*\t/i.test(content)) {
          pastHeader = true;
          continue;
        }
        if (!pastHeader || !line.trim() || line.startsWith("#")) continue;
        each(
          decodeConsumerCall(
            line.split("\t").map((s) => s.trim()),
            source,
          ),
        );
        count++;
      }
      if (!count) throw new AppError("DNA_NO_ROWS", "This DNA export has no data rows.");
    },
  };
  // Validate the first row during selection without retaining the entire genome.
  const stop = Symbol("first call");
  try {
    await source.readCalls(
      (call) => {
        source.example = call;
        throw stop;
      },
      null,
      signal,
    );
  } catch (e) {
    if (e !== stop) throw e;
  }
  return source;
}
