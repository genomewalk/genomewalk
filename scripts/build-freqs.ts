#!/usr/bin/env node
import { runCli, string, boolean } from "./lib/cli.ts";
import { buildFrequencies } from "./lib/frequencies.ts";
await runCli(
  "Build published gnomAD v4.1 joint frequencies for the selected ClinVar classes, reusing matching region caches.\n--offline requires every selected region to be cached and never makes network requests.\n--chrom writes a separate freqs.gnomad-v4.1-joint.tsv.chrN diagnostic file, never the full cache.",
  { chrom: string, jobs: { ...string, default: "3" }, fresh: boolean, offline: boolean },
  buildFrequencies,
);
