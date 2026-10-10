import type { ConsumerSource } from "./types.ts";
import type { Progress } from "../../lib/io/types.ts";
import type { SelectionData, SelectionKind } from "../types.ts";
import { openConsumerFile } from "./reader.ts";
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
  select({ source }: SelectionData, name: string, kind?: SelectionKind) {
    if (!("readCalls" in source)) throw new Error("A consumer selection requires a call reader.");
    selectSource(source as ConsumerSource);
    resetSession(name, kind);
  },
  clear() {
    selectSource(null);
    resetSession("");
    session.fileName = null;
  },
  describe() {
    return { size: ctx.source?.size || 0, build: ctx.source?.build || "unknown" };
  },
};
