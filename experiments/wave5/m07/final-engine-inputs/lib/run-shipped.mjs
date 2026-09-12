import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ensureShippedEngines, incomplete } from "./ensure-shipped.mjs";

export function tmpOutDir() {
  return mkdtempSync(join(tmpdir(), "w5-m07-final-out-"));
}

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function runShippedCli(kind, { before, after, outDir }) {
  if (!existsSync(before) || !existsSync(after)) {
    throw incomplete(`fixture path missing: before=${before} after=${after}`);
  }
  const engines = ensureShippedEngines();
  const dest = outDir || tmpOutDir();
  mkdirSync(dest, { recursive: true });
  const argv =
    kind === "merchant"
      ? [engines.merchantBin, "--before", before, "--after", after, "--out-dir", dest]
      : kind === "kit"
        ? [engines.kitBin, "run", "lockfile-pin-delta", "--before", before, "--after", after, "--out-dir", dest]
        : null;
  if (!argv) throw incomplete(`unknown engine kind ${kind}`);
  const r = spawnSync(process.execPath, argv, {
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
  const reportPath = join(dest, "pin-delta.json");
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
  return {
    kind,
    argv: [process.execPath, ...argv],
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
