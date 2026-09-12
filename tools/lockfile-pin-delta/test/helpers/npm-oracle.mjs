import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Test-only oracle: npm generates its own lock and actually reifies the tree.
// Every command uses local packages, offline mode, disabled scripts and a timeout.
export function npm(cwd, args) {
  const result = spawnSync("npm", [...args, "--ignore-scripts", "--offline", "--no-audit", "--no-fund"], {
    cwd,
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 128 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768", npm_config_update_notifier: "false" },
  });
  if (result.status !== 0) throw new Error(`npm ${args[0]} failed: ${result.error?.message || result.stderr}`);
  return result.stdout;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function pack(root, name = "oracle-pin", metadata = {}) {
  const dir = path.join(root, name);
  writeJson(path.join(dir, "package.json"), { name, version: "1.0.0", ...metadata });
  npm(dir, ["pack", "--pack-destination", root]);
  return `file:../${name}-1.0.0.tgz`;
}

export function install(root, version, label, manifest, { omit = [], platform } = {}) {
  const dir = path.join(root, `v${version}-${label}`);
  writeJson(path.join(dir, "package.json"), { name: "oracle-root", version: "1.0.0", ...manifest });
  npm(dir, ["install", "--package-lock-only", `--lockfile-version=${version}`]);
  const text = fs.readFileSync(path.join(dir, "package-lock.json"), "utf8");
  npm(dir, ["ci", ...omit.map((kind) => `--omit=${kind}`), ...(platform ? [`--os=${platform}`] : [])]);
  return { dir, text };
}
