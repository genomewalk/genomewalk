import type { ComponentType } from "react";
import type { SourceMetadata, Progress } from "../lib/io/types.ts";
import type { Chapter } from "./shared/types.ts";
import type { SupportedBuild } from "../lib/genetics/reference-build.ts";

export type SelectionKind = "upload" | "sample";
/** The router only needs header metadata; each experience owns its reader. */
export interface SelectionHeader {
  meta: string[];
  columns: string[];
}
export interface SelectionData {
  source: SourceMetadata;
  header: SelectionHeader;
  selectedBuild?: SupportedBuild | undefined;
}
export interface OpenedGenome extends SelectionData {
  build: string;
  experience: Experience;
}
export interface SavedSelection extends SelectionData {
  experienceId: string;
  name: string;
  kind: SelectionKind;
  info: { size: number; build: string; selectedBuild?: SupportedBuild | undefined };
}
export interface Experience {
  id: string;
  accept: string;
  label: string;
  chapters: Chapter[];
  context: { source: SelectionData["source"] | null; header: SelectionHeader | null };
  session: { fileName: string | null; kind: SelectionKind | null; done: Record<number, boolean> };
  matches(file: File): boolean;
  open(
    file: File,
    signal?: AbortSignal,
    onProgress?: Progress,
  ): Promise<SelectionData & { build: string }>;
  select(opened: SelectionData, name: string, kind?: SelectionKind): void;
  clear(): void;
  describe(): SavedSelection["info"];
  loadPage?: () => Promise<{ default: ComponentType<{ n: string }> }>;
}
