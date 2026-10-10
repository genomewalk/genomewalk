#!/usr/bin/env node
import { runCli, string } from "./lib/cli.ts";
import { BUILDS } from "./lib/config.ts";
import { buildCatalogRanges } from "./lib/catalog-ranges.ts";

await runCli(
  "Index existing catalogues for HTTP byte-range reads. No network access.",
  { only: string },
  async (options) => {
    for (const build of options.only ? [options.only] : BUILDS)
      await buildCatalogRanges({ ...options, build });
  },
);
