import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPinnedKits } from "../lib/extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const OWNED = path.resolve(here, "..");
export const BIND_BIN = path.join(OWNED, "bin/bind.mjs");

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function extractKit() {
  return extractPinnedKits();
}

export function runNode(script, argv, { cwd, expectStatus = 0 } = {}) {
  const r = spawnSync(process.execPath, [script, ...argv], {
    encoding: "utf8",
    cwd,
    timeout: 90_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const stdout = r.stdout || "";
  let json = null;
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          json = JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          json = null;
        }
      }
    }
  }
  if (expectStatus != null && r.status !== expectStatus) {
    const err = new Error(
      `expected status ${expectStatus} got ${r.status}: ${(stdout + (r.stderr || "")).slice(0, 1200)}`,
    );
    err.result = { status: r.status, stdout, stderr: r.stderr || "", json };
    throw err;
  }
  return { status: r.status, stdout, stderr: r.stderr || "", json };
}

export function runBind(argv, opts = {}) {
  return runNode(BIND_BIN, argv, { cwd: OWNED, ...opts });
}
