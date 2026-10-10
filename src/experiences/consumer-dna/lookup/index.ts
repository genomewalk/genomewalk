import type { ConsumerCall, LookupIssue, RsidLookup } from "../types.ts";
import type { VariantIdentity } from "../../../lib/catalogues/types.ts";
import { gunzipSync } from "fflate";

const canonicalRsid = (id: string | null | undefined) => {
  const match = /^rs([1-9]\d*)$/i.exec(id || "");
  return match ? `rs${match[1]}` : null;
};

export async function sha256(bytes: BufferSource) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadLookup(
  build: string,
  kind: "catalog" | "markers",
  sourceBytes: Uint8Array<ArrayBuffer> | { sha256: string },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  // Fixed public resources only: the request never contains a person's rsIDs.
  const response = await fetch(`/ref/consumer-dna/${build}/rsids.json.gz`, {
    signal: signal ?? null,
  });
  if (!response.ok)
    throw new Error(
      `Consumer rsID lookup unavailable (${response.status}). Rebuild the reference indexes.`,
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  const json = bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes;
  const index = JSON.parse(new TextDecoder().decode(json));
  signal?.throwIfAborted();
  await validateLookup(index, build, kind, sourceBytes);
  signal?.throwIfAborted();
  return index;
}

export async function validateLookup(
  index: RsidLookup,
  build: string,
  kind: "catalog" | "markers",
  sourceBytes: Uint8Array<ArrayBuffer> | { sha256: string },
) {
  // Range-index source hashes bind the sidecar; each fetched block is verified separately.
  const sourceHash =
    sourceBytes instanceof Uint8Array ? await sha256(sourceBytes) : sourceBytes?.sha256;
  if (
    index.schema !== 1 ||
    index.build !== build ||
    !["catalog", "markers"].includes(kind) ||
    !index[kind] ||
    !index.aliases ||
    !/^[a-f0-9]{64}$/.test(sourceHash) ||
    index.sources?.[kind]?.sha256 !== sourceHash
  )
    throw new Error(
      "Consumer rsID lookup does not match this reference release. Rebuild the indexes together.",
    );
  const keys = /^(?:[1-9]|1\d|2[0-2]|X|Y|MT):[1-9]\d*:[ACGT]:[ACGT]$/;
  for (const [rs, entries] of Object.entries(index[kind])) {
    if (
      canonicalRsid(rs) !== rs ||
      !Array.isArray(entries) ||
      !entries.length ||
      entries.some((key) => !keys.test(key))
    )
      throw new Error("Invalid consumer rsID lookup entry");
  }
  for (const [old, current] of Object.entries(index.aliases)) {
    if (
      canonicalRsid(old) !== old ||
      canonicalRsid(current) !== current ||
      old === current ||
      index.aliases[current]
    )
      throw new Error("Invalid consumer rsID alias");
  }
}

export function createCandidates<T extends VariantIdentity>(
  records: T[],
  lookup: RsidLookup | null,
  kind: "catalog" | "markers",
  build: string,
  onIssue: (issue: LookupIssue) => void = () => {},
) {
  if (lookup && lookup.build !== build) throw new Error("Consumer rsID lookup build mismatch");
  const byPosition = new Map<string, T[]>();
  for (const record of records) {
    const position = `${record.chrom}:${record.pos}`;
    if (!byPosition.has(position)) byPosition.set(position, []);
    byPosition.get(position)!.push(record);
  }
  return (call: ConsumerCall) => {
    const id = canonicalRsid(call.id);
    const resolved = (id ? lookup?.aliases[id] : undefined) || id;
    const keys = resolved ? lookup?.[kind]?.[resolved] : undefined;
    const position = `${call.chrom}:${call.pos}`;
    // Coordinates select candidates. An rsID is an additional location check,
    // not a requirement: catalogue IDs can be missing or cover only some alleles.
    if (keys && !keys.some((key) => key.startsWith(`${position}:`))) {
      onIssue({
        type: "rsid-position-conflict",
        build,
        call,
        resolvedRsid: resolved,
        referencePositions: [...new Set(keys.map((key) => key.split(":", 2).join(":")))],
      });
      return [];
    }
    return byPosition.get(position) || [];
  };
}
