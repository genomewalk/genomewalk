#!/usr/bin/env node
import { runCli, string, boolean } from "./lib/cli.ts";
import { buildCatalog } from "./lib/catalog.ts";
await runCli(
  "Build a local catalogue from downloaded ClinVar, citations and frequency inputs.\nGRCh37 needs the GRCh38 allele-ID join first.",
  { build: { ...string, default: "GRCh38" }, "join-only": boolean },
  buildCatalog,
);
