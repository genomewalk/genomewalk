#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCli, string, boolean } from "./lib/cli.ts";
import { buildPlan } from "./lib/plan.ts";
import { requireCachedInputs } from "./lib/preflight.ts";
import { requireCachedPublications } from "./lib/publications.ts";
import { log } from "./lib/util.ts";

await runCli(
  "Build and validate reference indexes. Reuse downloaded inputs by default.\n--fresh refreshes public inputs and frequencies; --dry-run prints the plan without writes or network access.",
  {
    only: string,
    fresh: boolean,
    offline: boolean,
    "dry-run": boolean,
    jobs: string,
  },
  async (options) => {
    const started = Date.now();
    if (options.offline && !options["dry-run"]) {
      requireCachedInputs(options);
      await requireCachedPublications(options);
    }
    const plan = buildPlan({
      ...options,
      consumer: fs.existsSync(new URL("consumer/index.ts", import.meta.url)),
      frequenciesExist: fs.existsSync(options.paths.frequencies),
    });
    for (const [index, step] of plan.entries()) {
      log(`[${index + 1}/${plan.length}] ${step.name}`);
      const args = [
        ...step.args,
        "--data-dir",
        options.paths.data,
        "--out-dir",
        options.paths.output,
      ];
      log(
        ["node", `scripts/${step.script}`, ...args].map((part) => JSON.stringify(part)).join(" "),
      );
      if (options["dry-run"]) continue;
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL(step.script, import.meta.url)), ...args],
        { stdio: "inherit" },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`${step.script} failed (${result.signal || result.status})`);
    }
    if (!options["dry-run"])
      log(`Reference build complete in ${((Date.now() - started) / 60000).toFixed(1)} min`);
  },
);
