#!/usr/bin/env node
import { runCli, string } from "./lib/cli.ts";
import { requireCachedInputs } from "./lib/preflight.ts";
import { requireCachedPublications } from "./lib/publications.ts";
import { requireCachedFrequencies } from "./lib/frequencies.ts";

await runCli(
  "Check whether cached inputs are ready for a network-free rebuild. No writes or requests.",
  { only: string },
  async (options) => {
    const { required } = requireCachedInputs(options);
    const regions = await requireCachedFrequencies(options);
    await requireCachedPublications(options);
    console.log(
      `Ready for an offline rebuild: ${required.length} cached inputs and ${regions} frequency regions checked.`,
    );
    console.log(`Cache: ${options.paths.data}\nOutput: ${options.paths.output}`);
    console.log("The rebuild still validates input contents and all generated outputs.");
  },
);
