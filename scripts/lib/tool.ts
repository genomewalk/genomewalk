import fs from "node:fs";
import { download } from "./network.ts";

export async function ensureTool(destination: string) {
  if (fs.existsSync(destination)) return destination;
  const platforms: Record<string, string> = {
    "darwin-arm64": "macOSX.arm64",
    "darwin-x64": "macOSX.x86_64",
    "linux-x64": "linux.x86_64",
  };
  const platform = platforms[`${process.platform}-${process.arch}`];
  if (!platform)
    throw new Error(
      "No bundled UCSC tool for this platform. Supply a compatible executable with --tool <path>.",
    );
  await download(`https://hgdownload.soe.ucsc.edu/admin/exe/${platform}/bigBedToBed`, destination);
  fs.chmodSync(destination, 0o755);
  return destination;
}
