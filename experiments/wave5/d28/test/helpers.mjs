import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { KIT_ROOT, REPO_ROOT, SDS52_CALLER } from "../lib/pins.mjs";

export const D28_CLI = join(KIT_ROOT, "bin/cli.mjs");
export const AFTER_NOCHANGE = join(KIT_ROOT, "fixtures/caller/vendor-budget-impact/after-nochange.json");
export const AFTER_PRICE = join(KIT_ROOT, "fixtures/caller/vendor-budget-impact/after-price.json");
export const AFTER_NOTE = join(KIT_ROOT, "fixtures/caller/vendor-budget-impact/after-note.json");
export const CRASH_CLI = join(KIT_ROOT, "fixtures/crash-cli.mjs");
export const INVENTED_EVIDENCE = join(KIT_ROOT, "fixtures/field/invented.json");

export { SDS52_CALLER, REPO_ROOT, KIT_ROOT };

export function spawnD28(args, { timeoutMs = 180_000 } = {}) {
  const r = spawnSync(process.execPath, [D28_CLI, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: REPO_ROOT,
  });
  return {
    status: r.status,
    signal: r.signal,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

export function parseJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function startServe(packetDir) {
  const child = spawn(process.execPath, [D28_CLI, "serve", "--packet", packetDir], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buf = "";
  const originPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("serve did not print origin")), 15_000);
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const json = parseJson(buf);
      if (json?.origin) {
        clearTimeout(timer);
        resolve(json.origin);
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      if (!parseJson(buf)?.origin) {
        clearTimeout(timer);
        reject(new Error(`serve exited ${code}: ${buf}`));
      }
    });
  });
  return { child, originPromise };
}
