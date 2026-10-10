import fs from "node:fs";
import type { ResolvedOptions } from "./types.ts";

interface ConsumerBuilder {
  buildConsumerIndex(options: ResolvedOptions & { build: string }): Promise<unknown>;
  checkConsumerIndex(options: ResolvedOptions & { build: string }): Promise<void>;
}

/** Removing consumer support must leave the core tools runnable and type-checkable. */
export async function loadConsumerBuilder(): Promise<ConsumerBuilder | null> {
  const entry = new URL("../consumer/index.ts", import.meta.url);
  if (!fs.existsSync(entry)) return null;
  return import(entry.href);
}
