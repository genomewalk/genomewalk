import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT } from "./lib/config.ts";

const { values } = parseArgs({
  options: { scope: { type: "string", default: "all" } },
  strict: true,
  allowPositionals: false,
});
if (!["all", "vcf", "consumer", "data"].includes(values.scope))
  throw new Error("--scope must be all, vcf, consumer or data");
const tests: string[] = [];
function collect(directory: string) {
  if (!fs.existsSync(directory)) return;
  for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(directory, file.name);
    if (file.isDirectory()) collect(name);
    else if (file.name.endsWith(".test.ts"))
      tests.push(path.relative(ROOT, name).split(path.sep).join("/"));
  }
}
collect(path.join(ROOT, "scripts"));
collect(path.join(ROOT, "src"));
collect(path.join(ROOT, "tests"));
const shared =
  /^(?:src\/lib\/|src\/components\/diagrams\/|tests\/integration\/(?:architecture|vcf-baseline|experience-routing|catalogue-preview|condition-links|genome-intake|share-chart)\.test)/;
const vcf =
  /^tests\/integration\/(?:chapter-navigation|match-identity|result-evidence|study-evidence|vcf-stream|vcf-row-diagram)\.test/;
const selected = tests.filter((file) => {
  if (values.scope === "all") return true;
  if (values.scope === "data")
    return (
      /^tests\/integration\/(?:reference-data|pipeline|catalog-ranges)\.test/.test(file) ||
      file.startsWith("scripts/lib/") ||
      file.startsWith("scripts/consumer/") ||
      file === "src/lib/io/http-range.test.ts"
    );
  if (shared.test(file)) return true;
  return values.scope === "vcf"
    ? file.startsWith("src/experiences/vcf/") || vcf.test(file)
    : file.startsWith("src/experiences/consumer-dna/") || file.startsWith("scripts/consumer/");
});
const result = spawnSync(process.execPath, ["--test", ...selected.sort()], {
  cwd: ROOT,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
