#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticServer } from "./lib/static-server.ts";

const directory = fileURLToPath(new URL("../dist/client/", import.meta.url));
if (!fs.existsSync(path.join(directory, "index.html")))
  throw new Error("Run npm run build first; dist/client/index.html is missing.");
const port = Number(process.env["PORT"] || 5283);
createStaticServer(directory).listen(port, process.env["HOST"] || "127.0.0.1", () => {
  console.log(`Static preview: http://localhost:${port}\nServing only ${directory}`);
});
