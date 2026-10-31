#!/usr/bin/env node
import { runCli, string } from "./lib/cli.ts";
import { BUILDS } from "./lib/config.ts";
import { buildCatalogMetadata } from "./lib/catalog-metadata.ts";

await runCli(
  "Build compact summaries for existing streaming catalogues. No network access.",
  { only: string },
  async (options) => {
    for (const build of options.only ? [options.only] : BUILDS)
      await buildCatalogMetadata({ ...options, build });
  },
);
