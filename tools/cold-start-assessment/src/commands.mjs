import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256 } from "./hash.mjs";
import { childEnv } from "./settle-guard.mjs";

function parseJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function commandLine(entry, argv) {
  return ["node", entry, ...argv].join(" ");
}

export function runFirstCommands({ target, extractRoot }) {
  const isolatedHome = mkdtempSync(join(tmpdir(), "sds-csa-home-"));
  mkdirSync(isolatedHome, { recursive: true });
  const results = [];
  const documents = [];

  for (const spec of target.firstCommands) {
    const argv = spec.argv;
    const spawned = spawnSync(process.execPath, [target.entry, ...argv], {
      cwd: extractRoot,
      encoding: "utf8",
      env: childEnv(isolatedHome),
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const stdout = spawned.stdout || "";
    const stderr = spawned.stderr || "";
    const row = {
      argv,
      commandLine: commandLine(target.entry, argv),
      exitCode: spawned.status == null ? 1 : spawned.status,
      stdoutSha256: sha256(stdout),
      stderrSha256: sha256(stderr),
      demo: Boolean(spec.demo),
    };
    results.push(row);
    if (spec.json) {
      const doc = parseJson(stdout);
      if (doc) documents.push(doc);
    }
  }

  return { commands: results, documents };
}
