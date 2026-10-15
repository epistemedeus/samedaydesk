import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = walk(root).filter((path) => path.endsWith(".mjs"));
const forbidden = [
  [/\bsetInterval\s*\(/, "timer"],
  [/\bsetTimeout\s*\(/, "timer"],
  [/\brunMaintenanceOccurrence\b/, "supplier rerun"],
  [/\bsource-change-alert\b/, "supplier rerun"],
  [/\bcreateReusePermissionService\b/, "second authority"],
  [/\bwriteFile(?:Sync)?\s*\(/, "persistence"],
  [/\bfetch\s*\(/, "network"],
  [/\bfrom\s+["']pg["']/, "database"],
];

let failed = false;
for (const path of files) {
  const check = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (check.status !== 0) {
    process.stderr.write(check.stderr || check.stdout || `${path} failed node --check\n`);
    failed = true;
  }
}
for (const path of files) {
  if (!path.includes(`${root}/src/`) && !path.endsWith("/cli.mjs")) continue;
  const text = readFileSync(path, "utf8");
  for (const [pattern, label] of forbidden) {
    if (pattern.test(text)) {
      process.stderr.write(`${path} contains ${label}\n`);
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "evidence") continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}
