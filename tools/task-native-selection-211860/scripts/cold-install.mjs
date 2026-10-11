import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const started = performance.now();
const pack = spawnSync("npm", ["pack", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8" });
if (pack.status !== 0) {
  process.stderr.write(pack.stderr || pack.stdout || "npm pack failed\n");
  process.exit(pack.status || 1);
}
const packed = JSON.parse(pack.stdout).at(-1);
const tarball = join(root, packed.filename);
const dir = mkdtempSync(join(tmpdir(), "task-native-cold-"));
const installStarted = performance.now();
const install = spawnSync("npm", ["install", "--omit=dev", "--ignore-scripts", tarball], {
  cwd: dir,
  encoding: "utf8",
});
const installMs = performance.now() - installStarted;
if (install.status !== 0) {
  process.stderr.write(install.stderr || install.stdout || "npm install failed\n");
  process.exit(install.status || 1);
}
const bin = join(dir, "node_modules/.bin/task-native-select");
const pkg = join(dir, "node_modules/@samedaydesk/task-native-selection-211860");
const run = spawnSync(bin, [
  "select",
  "--catalog",
  join(pkg, "fixtures/cold-catalog.json"),
  "--task",
  join(pkg, "fixtures/tasks/structured-extract.json"),
], { encoding: "utf8" });
const totalMs = performance.now() - started;
const receipt = {
  schema: "samedaydesk.task-native-selection.cold-install.v1",
  installMs,
  totalMs,
  packStatus: pack.status,
  installStatus: install.status,
  selectStatus: run.status,
  tarball: packed.filename,
  bytes: packed.size,
  selected: run.status === 0 ? JSON.parse(run.stdout).stages.selected.operationId : null,
  stdoutBytes: run.stdout.length,
};
mkdirSync(new URL("../receipts/", import.meta.url), { recursive: true });
writeFileSync(new URL("../receipts/cold-install.json", import.meta.url), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt)}\n`);
rmSync(tarball, { force: true });
rmSync(dir, { recursive: true, force: true });
process.exit(run.status === 0 && receipt.selected === "extractUrl" ? 0 : 1);
