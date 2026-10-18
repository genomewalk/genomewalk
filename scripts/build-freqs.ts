#!/usr/bin/env node
import { runCli, string, boolean } from "./lib/cli.ts";
import { buildFrequencies } from "./lib/frequencies.ts";
await runCli(
  "Fetch published gnomAD v4.1 joint frequencies for the selected ClinVar classes. Requires network access.\n--chrom writes a separate freqs.gnomad-v4.1-joint.tsv.chrN diagnostic file, never the full cache.",
  { chrom: string, jobs: { ...string, default: "3" }, fresh: boolean },
  buildFrequencies,
);
