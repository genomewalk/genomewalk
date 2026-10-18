import { ctx, currentBuild } from "../context.ts";
import { note, escape } from "./html.ts";

export function buildGuard(out: HTMLElement) {
  const b = currentBuild();
  if (b === "GRCh38" || b === "GRCh37") {
    ctx.build = b;
    return true;
  }
  ctx.build = null;
  const reason =
    b === "unknown"
      ? "We couldn’t identify this file’s reference build."
      : b === "conflicting"
        ? "This file contains conflicting reference-build information."
        : `This file uses ${escape(b)}. Genomewalk’s catalogues support GRCh37 and GRCh38.`;
  out.append(
    note(
      `<b>${reason}</b> Catalogue matching is unavailable. You can still explore the file in chapters 1–6.`,
      "important",
    ),
  );
  return false;
}

export const refUrl = (file: string) => {
  if (ctx.build !== "GRCh37" && ctx.build !== "GRCh38")
    throw new Error("A supported reference build is required for catalogue matching.");
  return `/ref/${ctx.build}/${file}`;
};

export const isGvcf = () =>
  ctx.header!.meta.some(
    (l) =>
      l.startsWith("##FORMAT=<ID=MIN_DP") || l.startsWith("##INFO=<ID=END,") || /gvcf/i.test(l),
  );

export const sampleNote = () =>
  ctx.header!.columns.length > 10
    ? note(`This file holds <b>${ctx.header!.columns.length - 9}</b> people. Only the first sample
     column, <code>${escape(ctx.header!.columns[9])}</code>, is read below.`)
    : null;
