#!/usr/bin/env node
import { runCli, string, boolean } from "./lib/cli.ts";
import { buildPublications } from "./lib/publications.ts";
await runCli(
  "Build compact PubMed citation labels from existing catalogues. Reuse cached metadata; --offline forbids requests and --fresh refreshes it.",
  { only: string, fresh: boolean, offline: boolean },
  buildPublications,
);
