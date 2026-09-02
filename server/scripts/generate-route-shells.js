import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeRouteShells } from "../lib/spa-route-shells.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(process.argv[2] || path.join(here, "../../client/dist"));
const written = writeRouteShells(distDir);
for (const item of written) {
  console.log(`[route-shells] ${item.path} -> ${item.relativeFile} (${item.bytes} bytes)`);
}
