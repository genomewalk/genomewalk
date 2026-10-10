#!/usr/bin/env node
import { runCli, boolean } from "./lib/cli.ts";
import { downloadCitations } from "./lib/downloads.ts";
await runCli(
  "Download ClinVar VCV XML and extract its aggregate germline publication lists.",
  { fresh: boolean },
  downloadCitations,
);
