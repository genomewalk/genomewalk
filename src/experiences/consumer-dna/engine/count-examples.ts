import type { CallSource, ConsumerCall, CountExample, CountExamples } from "../types.ts";
import { callSignature } from "./calls.ts";

// Keep a bounded selection of real rows and their original line order.
// Earlier duplicate calls are already stored as signatures; do not retain a
// second copy of every row just to illustrate a repeated position.
export function countExampleCollector(examples: CountExamples) {
  // Usually the counting pass already holds the first DNA-letter signature.
  // Keep a separate signature only when a site's first row used another code,
  // so a later CC / CT pair can still be selected without retaining every row.
  const mixedSites = new Map<string, string>();
  return (call: ConsumerCall, previous: string | undefined, row: number) => {
    let saved: CountExample | undefined;
    const snapshot = () => (saved ??= { ...call, fileRow: row });
    examples.first ??= snapshot();
    examples[call.status] ??= snapshot();
    if (call.canMatch) examples.matchable ??= snapshot();
    if (call.status === "called" && !call.canMatch) examples.outsideMatching ??= snapshot();
    if (call.status === "unsupported" && call.alleles.includes("I"))
      examples.insertion ??= snapshot();
    if (call.status === "unsupported" && call.alleles.includes("D"))
      examples.deletion ??= snapshot();
    if (previous !== undefined) examples.anyRepeated ??= { call: snapshot(), previous, row };
    if (
      examples.conflicting ||
      previous === undefined ||
      call.status !== "called" ||
      call.alleles.length !== 2
    )
      return;
    const key = `${call.chrom}:${call.pos}`;
    const signature = callSignature(call);
    const earlier = /^[ACGT]\/[ACGT]$/.test(previous) ? previous : mixedSites.get(key);
    if (earlier === undefined) {
      mixedSites.set(key, signature);
      return;
    }
    const example = { call: snapshot(), previous: earlier, row };
    examples.repeated ??= example;
    if (earlier !== signature) {
      examples.conflicting = example;
      mixedSites.clear();
    }
  };
}

export async function completeRepeatExample(
  source: CallSource,
  examples: CountExamples,
  signal?: AbortSignal,
) {
  const example = examples.conflicting || examples.repeated || examples.anyRepeated;
  if (!example?.call.fields) return;
  // Read only as far as this site's first row. This preserves the original ID
  // and encoding without keeping every file row in memory or inventing a line
  // from the normalized signature used to count duplicates.
  const found = Symbol("earlier row found");
  let row = 0;
  try {
    await source.readCalls(
      (call) => {
        row++;
        if (
          call.chrom !== example.call.chrom ||
          call.pos !== example.call.pos ||
          callSignature(call) !== example.previous
        )
          return;
        example.earlier = { ...call, fileRow: row };
        example.separated = example.row > row + 1;
        throw found;
      },
      null,
      signal,
    );
  } catch (error) {
    if (error !== found) throw error;
  }
}
