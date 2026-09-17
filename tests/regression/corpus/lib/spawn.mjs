import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./root.mjs";
import { accept, reject } from "./result.mjs";

export function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function expand(value, ctx) {
  return String(value).replaceAll(/\{\{(\w+)\}\}/g, (_, key) => {
    if (ctx[key] == null) throw new Error(`unknown_placeholder:${key}`);
    return String(ctx[key]);
  });
}

export function runNode(relScript, args, { timeoutMs = 20_000, destName = null, extraCtx = {} } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "sds-corpus-"));
  const dest = destName ? join(tmp, destName) : null;
  const ctx = { dest: dest || "", tmp, root: REPO_ROOT, ...extraCtx };
  const argv = args.map((item) => expand(item, ctx));
  try {
    const result = spawnSync(process.execPath, [join(REPO_ROOT, relScript), ...argv], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: timeoutMs,
      env: { ...process.env, PAYMENT_SENT: "false" },
    });
    const timedOut = result.error?.code === "ETIMEDOUT";
    const json = parseJsonLoose(result.stdout) || parseJsonLoose(result.stderr);
    return {
      exitCode: timedOut ? 124 : result.status == null ? 64 : result.status,
      json,
      stdout: result.stdout,
      stderr: result.stderr,
      destExists: dest ? existsSync(dest) : null,
      timedOut,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function refuseFromJson(spawned, fallbackCode) {
  const json = spawned.json || {};
  const code = json.code || json.error?.code || fallbackCode;
  const message = json.message || json.error?.message || String(fallbackCode);
  if (spawned.timedOut) {
    return reject("timed_out", "product spawn timed out", { product: json, exitCode: spawned.exitCode });
  }
  if (spawned.destExists === true) {
    return accept("dest_written", "Refuse wrote dest.", { product: json, exitCode: spawned.exitCode });
  }
  if (json.ok === true) {
    return accept(code || "ok", message, { product: json, exitCode: spawned.exitCode, destExists: spawned.destExists });
  }
  return reject(code, message, {
    product: { ...json, exitCode: spawned.exitCode, destExists: spawned.destExists },
  });
}
