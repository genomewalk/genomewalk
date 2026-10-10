import type { BuildOptions } from "./types.ts";
import { BUILDS } from "./config.ts";

/** Ordered public-data stages; computing a plan never touches disk or the network. */
export function buildPlan({
  only,
  fresh = false,
  offline = false,
  frequenciesExist = false,
  consumer = true,
  jobs,
  tool,
}: BuildOptions & { frequenciesExist?: boolean; consumer?: boolean }) {
  if (offline && fresh) throw new Error("--offline and --fresh cannot be combined");
  const builds = only ? [only] : BUILDS;
  const plan = [];
  if (!offline)
    plan.push({
      name: "Download public inputs (reuse complete cached files)",
      script: "download-inputs.ts",
      args: [...(only ? ["--only", only] : []), ...(fresh ? ["--fresh"] : [])],
    });
  if (!offline && (fresh || !frequenciesExist))
    plan.push({
      name: "Extract gnomAD frequencies for selected ClinVar alleles",
      script: "build-freqs.ts",
      args: [...(jobs ? ["--jobs", jobs] : []), ...(tool ? ["--tool", tool] : [])],
    });
  plan.push({
    name:
      only === "GRCh37"
        ? "Prepare the GRCh38 allele-ID frequency join"
        : "Build the GRCh38 catalogue, byte-range index and allele-ID join",
    script: "build-catalog.ts",
    args: ["--build", "GRCh38", ...(only === "GRCh37" ? ["--join-only"] : [])],
  });
  if (builds.includes("GRCh37"))
    plan.push({
      name: "Build the GRCh37 catalogue and byte-range index using the allele-ID join",
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
