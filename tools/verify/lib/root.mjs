import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function resolveRoot(start = process.cwd()) {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "server/routes/mcp.js")) && existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const error = new Error("samedaydesk root not found (server/routes/mcp.js)");
  error.code = "USAGE";
  throw error;
}
