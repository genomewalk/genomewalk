import { detectBuild } from "../reference.ts";
import { ctx } from "../context.ts";
import { note, escape } from "./html.ts";

export function buildGuard(out: HTMLElement, informational = false) {
  const b = detectBuild(ctx.header!.meta);
  if (b === "GRCh38" || b === "GRCh37") {
    ctx.build = b;
    return true;
  }
  if (b === "T2T-CHM13") {
    out.append(
      note(`<b>This file is on T2T-CHM13.</b> Neither ClinVar nor gnomAD publish on that
      build, so there is no catalogue to look it up in. ${informational ? "Chapters 6 to 8 will stop for this file." : "Stopping here."}`),
    );
    return false;
  }
  ctx.build = "GRCh38";
  out.append(
    note(`<b>Could not tell which reference build this file uses.</b> Assuming GRCh38.
    If it is actually GRCh37, every lookup below will be wrong — treat the results with suspicion.`),
  );
  return true;
}

export const refUrl = (file: string) => `/ref/${ctx.build || "GRCh38"}/${file}`;

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
