import type { BuildOptions } from "./types.ts";
import { BUILDS } from "./config.ts";

/** Ordered public-data stages; computing a plan never touches disk or the network. */
export function buildPlan({
  only,
  fresh = false,
  offline = false,
  consumer = true,
  jobs,
}: BuildOptions & { consumer?: boolean }) {
  if (offline && fresh) throw new Error("--offline and --fresh cannot be combined");
  const builds = only ? [only] : BUILDS;
  const plan = [];
  if (!offline)
    plan.push({
      name: "Download public inputs (reuse complete cached files)",
      script: "download-inputs.ts",
      args: [...(only ? ["--only", only] : []), ...(fresh ? ["--fresh"] : [])],
    });
  // Re-evaluate selection every time; an existing TSV may predate new targets.
  plan.push({
    name: "Build gnomAD frequencies for selected ClinVar alleles (reuse matching region caches)",
    script: "build-freqs.ts",
    args: [
      ...(jobs ? ["--jobs", jobs] : []),
      ...(fresh ? ["--fresh"] : []),
      ...(offline ? ["--offline"] : []),
    ],
  });
  plan.push({
    name:
      only === "GRCh37"
        ? "Prepare the GRCh38 allele-ID frequency join"
        : "Build the GRCh38 catalogue, compact summary and allele-ID join",
    script: "build-catalog.ts",
    args: ["--build", "GRCh38", ...(only === "GRCh37" ? ["--join-only"] : [])],
  });
  if (builds.includes("GRCh37"))
    plan.push({
      name: "Build the GRCh37 catalogue and compact summary using the allele-ID join",
      script: "build-catalog.ts",
      args: ["--build", "GRCh37"],
    });
  plan.push({
    name: "Build compact publication labels (reuse cached PubMed metadata)",
    script: "build-publications.ts",
    args: [
      ...(only ? ["--only", only] : []),
      ...(fresh ? ["--fresh"] : []),
      ...(offline ? ["--offline"] : []),
    ],
  });
  for (const build of builds)
    plan.push({
      name: `Build ${build} cited marker examples`,
      script: "build-marker-freqs.ts",
      args: ["--build", build, ...(fresh ? ["--fresh"] : []), ...(offline ? ["--offline"] : [])],
    });
  if (consumer)
    plan.push({
      name: "Build consumer rsID indexes from the generated files",
      script: "build-consumer.ts",
      args: only ? ["--only", only] : [],
    });
  plan.push({
    name: "Validate every generated artifact",
    script: "check-reference-data.ts",
    args: only ? ["--only", only] : [],
  });
  return plan;
}
