import type { CatalogEntry } from "../../lib/catalogues/types.ts";
import type { createVcfRowExamples } from "./engine/row-diagram.ts";

export interface VcfHeader {
  meta: string[];
  columns: string[];
}
export interface VcfCounts {
  records: number;
  variants: number;
  homref: number;
  homrefBases: number;
  failed: number;
  snps: number;
  indels: number;
  ti: number;
  tv: number;
  het: number;
  hom: number;
  withId: number;
  dpSum: number;
  dpN: number;
  chrom: Record<string, number>;
  y: number;
  xnp: number;
  xhet: number;
  rowExamples: ReturnType<typeof createVcfRowExamples>;
}
export interface VcfMatch extends CatalogEntry {
  copies: number;
  ploidy: number;
  gt: string;
  partialCall: boolean;
  f: string[];
  recordCount: number;
  sourceCalls: string[][];
  callKeys: string[];
  conflictingRecords?: boolean;
}
export type VcfObservation = Omit<VcfMatch, "recordCount" | "sourceCalls" | "callKeys">;
export interface VcfMarkerHit {
  f: string[];
  letters: string[];
  filter: string;
  usable: boolean;
  conflicting?: boolean;
}
