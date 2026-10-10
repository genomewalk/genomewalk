import { ctx } from "../context.ts";
import { escape, note } from "./html.ts";
export function buildGuard(out: HTMLElement) {
  const build = ctx.source!.build;
  ctx.build = null;
  if (!ctx.source!.capabilities.matching) {
    out.append(
      note(
        "This file’s reference build or strand is not supported for catalogue matching. You can still explore the file in chapters 1–5.",
      ),
    );
    return false;
  }
  if (build === "GRCh37" || build === "GRCh38") {
    ctx.build = build;
    return true;
  }
  out.append(note(`Catalogue matching is unavailable for ${escape(build)}.`));
  return false;
}
export const refUrl = (file: string) => `/ref/${ctx.build}/${file}`;
