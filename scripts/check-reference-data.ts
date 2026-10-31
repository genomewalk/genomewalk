#!/usr/bin/env node
import { loadConsumerBuilder } from "./lib/optional-consumer.ts";
import { runCli, string } from "./lib/cli.ts";
import { BUILDS } from "./lib/config.ts";
import { checkReference } from "./lib/validate.ts";
import { checkCatalogMetadata } from "./lib/catalog-metadata.ts";
import { checkPublications } from "./lib/publications.ts";
await runCli(
  "Validate catalogues, compact summaries, cited markers and publication labels without network access.",
  { only: string },
  async (options) => {
    const consumer = await loadConsumerBuilder();
    for (const build of options.only ? [options.only] : BUILDS) {
      await checkReference({ ...options, build });
      await checkCatalogMetadata({ ...options, build });
      if (consumer) await consumer.checkConsumerIndex({ ...options, build });
    }
    await checkPublications(options);
  },
);
