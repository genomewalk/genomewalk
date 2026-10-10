#!/usr/bin/env node
import { runCli, string, boolean } from "./lib/cli.ts";
import { buildMarkers } from "./lib/markers.ts";
await runCli(
  "Build cited markers from exact, build-specific variant IDs and gnomAD.\nReuse cached responses unless --fresh; never choose an arbitrary rsID alternative.",
  { build: { ...string, default: "GRCh38" }, fresh: boolean, offline: boolean },
  buildMarkers,
);
