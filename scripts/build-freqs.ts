#!/usr/bin/env node
import { runCli, string } from "./lib/cli.ts";
import { buildFrequencies } from "./lib/frequencies.ts";
await runCli(
  "Fetch gnomAD v4.1 frequencies for the selected ClinVar classes. Requires network access.\n--chrom writes a separate freqs.tsv.chrN diagnostic file, never the full cache.",
  { chrom: string, jobs: { ...string, default: "6" }, tool: string },
  buildFrequencies,
);
