import type { ByteSource } from "../../../lib/io/types.ts";
import type { selectHeaderField } from "./header-field-example.ts";
type HeaderDefinition = ReturnType<typeof selectHeaderField>;
interface PreviewOptions {
  maxRows?: number;
  maxBytes?: number;
  assertCurrent?: () => void;
}
interface DataRow {
  fields: string[];
  number: number;
}
export interface HeaderDataExamples {
  field: (DataRow & { value: string; index?: number; sample?: number }) | null;
  pass: DataRow | null;
  fail: DataRow | null;
  unfiltered: DataRow | null;
  scanned: number;
}
import { streamBlocks } from "../../../lib/io/bgzf.ts";

// Resolve a declared field by its name, not by assuming a fixed FORMAT order.
export function fieldInRow(fields: string[], definition: HeaderDefinition) {
  if (!definition) return null;
  const id = definition.fields["ID"];
  if (definition.kind === "FORMAT") {
    const index = (fields[8] || "").split(":").indexOf(id!);
    if (index < 0) return null;
    for (let sample = 9; sample < fields.length; sample++) {
      const value = fields[sample]!.split(":")[index];
      if (value && !/^[.|/]+$/.test(value)) return { index, sample, value };
    }
  } else if (definition.kind === "INFO") {
    const token = (fields[7] || "")
      .split(";")
      .find((item) => item === id || item.startsWith(`${id}=`));
    if (token && token !== `${id}=.`)
      return { value: token.includes("=") ? token.slice(id!.length + 1) : "present" };
  } else if ((fields[4] || "").split(",").includes(`<${id}>`)) {
    return { value: `<${id}>` };
  }
  return null;
}

// A small preview for Chapter 1. Keep one field and three filter examples, stopping even if a
// rare filter or declared field never occurs. This must not become a full scan.
export async function collectHeaderDataExamples(
  blocks: AsyncIterable<{ data: Uint8Array }> | Iterable<{ data: Uint8Array }>,
  definition: HeaderDefinition,
  { maxRows = 2000, maxBytes = 4 << 20, assertCurrent = () => {} } = {},
) {
  const result: HeaderDataExamples = {
    field: null,
    pass: null,
    fail: null,
    unfiltered: null,
    scanned: 0,
  };
  const decoder = new TextDecoder();
  let carry = "",
    number = 0,
    bytes = 0;
  const accept = (text: string) => {
    number++;
    text = text.replace(/\r$/, "");
    if (!text || text.startsWith("#")) return false;
    const fields = text.split("\t");
    result.scanned++;
    if (fields.length >= 8) {
      const row = { fields, number };
      if (!result.field) {
        const value = fieldInRow(fields, definition);
        if (value) result.field = { ...row, ...value };
      }
      if (!result.pass && fields[6] === "PASS") result.pass = row;
      if (!result.fail && fields[6] && fields[6] !== "." && fields[6] !== "PASS") result.fail = row;
      if (!result.unfiltered && fields[6] === ".") result.unfiltered = row;
    }
    return (
      result.scanned >= maxRows ||
      ((!definition || result.field) && result.pass && result.fail && result.unfiltered)
    );
  };
  for await (const block of blocks) {
    assertCurrent();
    const remaining = maxBytes - bytes;
    const data = block.data.subarray(0, remaining);
    bytes += data.length;
    carry += decoder.decode(data, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop()!;
    for (const line of lines) if (accept(line)) return result;
    if (bytes >= maxBytes) return result;
  }
  assertCurrent();
  carry += decoder.decode();
  if (carry) accept(carry);
  return result;
}

export const readHeaderDataExamples = (
  source: ByteSource,
  definition: HeaderDefinition,
  options?: PreviewOptions,
) => collectHeaderDataExamples(streamBlocks(source, 64 << 10), definition, options);
