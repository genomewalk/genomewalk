#!/usr/bin/env node
import { runCli, string, boolean } from "./lib/cli.ts";
import { downloadInputs } from "./lib/downloads.ts";
await runCli(
  "Download public ClinVar VCFs and publication references. Reuses cached inputs unless --fresh.\nGRCh38 is also required when building GRCh37 frequencies.",
  { only: string, fresh: boolean },
  downloadInputs,
);
