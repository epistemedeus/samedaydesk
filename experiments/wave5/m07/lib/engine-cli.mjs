import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { engineCliPath, incomplete } from "./ensure-engine.mjs";

export function tmpOutDir() {
  return mkdtempSync(join(tmpdir(), "w5-m07-out-"));
}

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function runEngineCli({ before, after, outDir, extraArgs = [] }) {
  if (!existsSync(before) || !existsSync(after)) {
    throw incomplete(`fixture path missing: before=${before} after=${after}`);
  }
  const dest = outDir || tmpOutDir();
  mkdirSync(dest, { recursive: true });
  const cli = engineCliPath();
  const r = spawnSync(process.execPath, [cli, "--before", before, "--after", after, "--out-dir", dest, ...extraArgs], {
    encoding: "utf8",
    timeout: 30_000,
    cwd: dest,
  });
  const stdout = (r.stdout || "").trim();
  let json = null;
  if (stdout) {
    try {
      json = JSON.parse(stdout);
    } catch {
      json = null;
    }
  }
  let report = null;
  const reportPath = join(dest, "pin-delta.json");
  if (existsSync(reportPath)) {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  }
  return {
    status: r.status,
    stdout,
    stderr: r.stderr || "",
    json,
    report,
    reportPath,
    outDir: dest,
    reportSha256: existsSync(reportPath) ? sha256Bytes(readFileSync(reportPath)) : null,
  };
}

export function writeFetchedLock(bytes, fileName) {
  const dir = tmpOutDir();
  const filePath = join(dir, fileName);
  writeFileSync(filePath, bytes);
  return filePath;
}
