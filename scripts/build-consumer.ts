#!/usr/bin/env node
import { loadConsumerBuilder } from "./lib/optional-consumer.ts";
import { runCli, string, boolean } from "./lib/cli.ts";
import { BUILDS } from "./lib/config.ts";
await runCli(
  "Build consumer rsID indexes from existing public catalogues and markers. No network access.",
  { only: string, check: boolean },
  async (options) => {
    const consumer = await loadConsumerBuilder();
    if (!consumer) {
      console.log("Consumer support is not installed; no indexes to build.");
      return;
    }
    const { buildConsumerIndex, checkConsumerIndex } = consumer;
    for (const build of options.only ? [options.only] : BUILDS) {
      if (!options.check) await buildConsumerIndex({ ...options, build });
      await checkConsumerIndex({ ...options, build });
    }
  },
);
