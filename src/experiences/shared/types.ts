import type { Progress, Status } from "../../lib/io/types.ts";
export interface ChapterOptions {
  signal?: AbortSignal | undefined;
  onProgress?: Progress | undefined;
  onStatus?: Status | undefined;
}
export interface Chapter {
  title: string;
  blurb: string;
  why: string;
  run(out: HTMLElement, options?: ChapterOptions): Promise<boolean | void>;
}
