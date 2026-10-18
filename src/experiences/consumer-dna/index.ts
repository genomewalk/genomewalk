import type { ConsumerSource } from "./types.ts";
import type { SupportedBuild } from "../../lib/genetics/reference-build.ts";
import type { Progress } from "../../lib/io/types.ts";
import type { SelectionData, SelectionKind } from "../types.ts";
import { decodeConsumerCall, openConsumerFile } from "./reader.ts";
import { STEPS, ctx } from "./engine/learn.ts";
import { selectSource } from "./engine/context.ts";
import { session, resetSession } from "./engine/session.ts";

export default {
  id: "consumer",
  accept: ".txt,.tsv,.zip,.gz",
  label: "23andMe or AncestryDNA raw data (TXT or ZIP)",
  matches: (file: { name: string }) => /\.(txt|tsv|zip|gz)$/i.test(file.name),
  chapters: STEPS,
  context: ctx,
  session,
  loadPage: () => import("./chapter-page.tsx"),
  async open(file: File, signal?: AbortSignal, onProgress?: Progress) {
    const source = await openConsumerFile(file, signal, onProgress);
    return { source, header: source.header, build: source.build };
  },
  select({ source, selectedBuild }: SelectionData, name: string, kind?: SelectionKind) {
    if (!("readCalls" in source)) throw new Error("A consumer selection requires a call reader.");
    const consumer = source as ConsumerSource;
    if (consumer.build === "unknown" && selectedBuild) {
      consumer.build = selectedBuild;
      consumer.buildSource = "selected by you";
      consumer.capabilities.matching = consumer.strand === "forward";
      if (consumer.example)
        consumer.example = decodeConsumerCall(consumer.example.fields, consumer);
    }
    selectSource(consumer);
    resetSession(name, kind);
  },
  clear() {
    selectSource(null);
    resetSession("");
    session.fileName = null;
  },
  describe() {
    const source = ctx.source;
    const selectedBuild: SupportedBuild | undefined =
      source?.buildSource === "selected by you" &&
      (source.build === "GRCh37" || source.build === "GRCh38")
        ? source.build
        : undefined;
    return { size: source?.size || 0, build: source?.build || "unknown", selectedBuild };
  },
};
