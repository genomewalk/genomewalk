import type { ConsumerSource } from "./types.ts";
import type { Progress } from "../../lib/io/types.ts";
import type { ChapterOptions } from "../shared/types.ts";
import { ctx } from "./engine/context.ts";
import { renderHeader } from "./engine/chapters/header.ts";
import { renderVariantLine } from "./engine/chapters/variant-line.ts";
import { runRowExamples } from "./engine/chapters/row-examples.ts";
import { runCounts } from "./engine/chapters/counts.ts";
import { renderSummary } from "./engine/chapters/summary.ts";
import { meaningChapterHtml } from "../shared/meaning-chapter.ts";
import { el } from "./engine/view/html.ts";

const renderers: ((
  source: ConsumerSource,
  out: HTMLElement,
  signal?: AbortSignal,
  onProgress?: Progress,
) => void | Promise<void>)[] = [
  renderHeader,
  renderVariantLine,
  runRowExamples,
  runCounts,
  renderSummary,
  (source, out) => out.append(el("div", "meaning-chapter", meaningChapterHtml(source))),
];

export async function runConsumerChapter(
  index: number,
  out: HTMLElement,
  { signal, onProgress }: ChapterOptions = {},
) {
  const source = ctx.source;
  if (!source || source.format !== "consumer")
    throw new Error("Choose a supported consumer DNA file first.");
  const render = renderers[index];
  if (!render) throw new Error(`Unknown consumer file chapter: ${index + 1}`);
  await render(source, out, signal, onProgress);
  return true;
}
