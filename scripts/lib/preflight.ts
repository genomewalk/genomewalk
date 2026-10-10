import type { ResolvedOptions } from "./types.ts";
import fs from "node:fs";
import path from "node:path";
import { BUILDS, DATASETS } from "./config.ts";
import { markerTarget } from "./markers.ts";
import { hasStudyEvidence } from "./reference/study-evidence.ts";

/** Check offline prerequisites up front, without creating output or making requests. */
export function inspectCachedInputs({ paths, only }: ResolvedOptions) {
  const builds = only ? [only] : BUILDS;
  const required = [
    ...new Set(["GRCh38", ...builds].map(paths.clinvar)),
    paths.frequencies,
    paths.citations,
    paths.markerBase,
  ];
  const issues = [];
  for (const file of required) {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || !stat.size) issues.push(`${file}: missing or empty input`);
    } catch {
      issues.push(`${file}: missing or unreadable input`);
    }
  }
  let markers;
  try {
    markers = JSON.parse(fs.readFileSync(paths.markerBase, "utf8")).filter(hasStudyEvidence);
    if (!markers.length) issues.push(`${paths.markerBase}: no cited markers`);
  } catch {
    issues.push(`${paths.markerBase}: cannot read the marker definitions`);
    return { required, issues };
  }
  for (const build of builds) {
    for (const marker of markers) {
      const file = path.join(paths.data, "markers", `${build}-${marker.rs}.json`);
      required.push(file);
      try {
        const target = markerTarget(marker, build);
        const cached = JSON.parse(fs.readFileSync(file, "utf8"));
        if (cached.dataset !== DATASETS[build] || cached.variant?.variant_id !== target.variant)
          issues.push(`${file}: cached dataset or variant does not match the marker definition`);
      } catch {
        issues.push(`${file}: missing or invalid marker cache`);
      }
    }
  }
  return { required, issues };
}

export function requireCachedInputs(options: ResolvedOptions) {
  const report = inspectCachedInputs(options);
  if (report.issues.length)
    throw new Error(
      `Offline prerequisites are incomplete:\n${report.issues.map((issue) => `  ${issue}`).join("\n")}\nNo build stages ran. Populate the cache with npm run data:build, or select an existing cache with --data-dir.`,
    );
  return report;
}
