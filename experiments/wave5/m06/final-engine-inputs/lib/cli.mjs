import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadPin } from "./paths.mjs";

function lastJsonLine(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // continue
    }
  }
  return null;
}

function usedRow(brief) {
  if (!brief || !brief.impact) return { usedClass: null, reason: null };
  for (const key of ["breaking", "compatible", "added", "deleted", "unknown"]) {
    const rows = brief.impact[key] || [];
    if (rows.length) {
      return { usedClass: rows[0].class, reason: rows[0].reason, pointer: rows[0].pointer };
    }
  }
  if ((brief.impact.unchangedCount || 0) > 0) {
    return { usedClass: "unchanged", reason: "structural-equal" };
  }
  return { usedClass: null, reason: null };
}

export function writeCaseInputs(entry, documents, destDir) {
  mkdirSync(destDir, { recursive: true });
  const beforePath = join(destDir, "before.json");
  const afterPath = join(destDir, "after.json");
  const usedPath = join(destDir, "used.json");
  writeFileSync(beforePath, `${JSON.stringify(documents.before, null, 2)}\n`);
  writeFileSync(afterPath, `${JSON.stringify(documents.after, null, 2)}\n`);
  writeFileSync(usedPath, `${JSON.stringify(documents.used, null, 2)}\n`);
  return { beforePath, afterPath, usedPath };
}

export function runDefaultCli(kit, args, outDir) {
  const argv = [...kit.cli.slice(1), ...args, "--out-dir", outDir];
  const spawned = spawnSync(process.execPath, argv, {
    cwd: kit.root,
    encoding: "utf8",
  });
  const stdout = lastJsonLine(spawned.stdout);
  let brief = null;
  try {
    brief = JSON.parse(readFileSync(join(outDir, "drift-brief.json"), "utf8"));
  } catch {
    brief = null;
  }
  const row = usedRow(brief);
  return {
    argv: ["node", ...argv],
    cwd: kit.root,
    exitCode: spawned.status == null ? 1 : spawned.status,
    stdoutRaw: spawned.stdout,
    stderr: spawned.stderr,
    stdout,
    brief,
    parseable: Boolean(stdout),
    transportFailure: spawned.status == null || spawned.error != null,
    ok: stdout ? Boolean(stdout.ok) : false,
    refused: Boolean(stdout && stdout.refused),
    code: stdout && stdout.code,
    status: stdout && stdout.status,
    breaking: stdout ? stdout.breaking : brief && brief.impact ? brief.impact.breaking.length : null,
    compatible: stdout ? stdout.compatible : brief && brief.impact ? brief.impact.compatible.length : null,
    unknown: stdout ? stdout.unknown : brief && brief.impact ? (brief.impact.unknown || []).length : null,
    unchangedCount: brief && brief.impact ? brief.impact.unchangedCount : null,
    usedClass: row.usedClass,
    reason: row.reason,
    pointer: row.pointer,
    customerBrief: stdout ? Boolean(stdout.customerBrief) : brief ? Boolean(brief.customerBrief) : null,
    purchaseAuthority: stdout ? Boolean(stdout.purchaseAuthority) : brief ? Boolean(brief.purchaseAuthority) : null,
    sold: stdout ? Boolean(stdout.sold) : brief ? Boolean(brief.sold) : null,
    sample: stdout ? Boolean(stdout.sample) : brief ? Boolean(brief.sample) : null,
    termsVersion: (stdout && stdout.termsVersion) || (brief && brief.termsVersion) || null,
  };
}

export function observeCase(kit, entry, documents) {
  const stamp = mkdtempSync(join(tmpdir(), `w5-m06-final-${entry.id}-`));
  if (entry.transport === "missing") {
    return runDefaultCli(kit, [], stamp);
  }
  if (entry.transport === "example") {
    return runDefaultCli(kit, ["--example"], stamp);
  }
  if (entry.transport === "kit-sample") {
    const rel = entry.kitSample;
    return runDefaultCli(
      kit,
      [
        "--before",
        join(kit.root, rel, "before.json"),
        "--after",
        join(kit.root, rel, "after.json"),
        "--used",
        join(kit.root, rel, "used.json"),
      ],
      stamp,
    );
  }
  const inputs = writeCaseInputs(entry, documents, join(stamp, "in"));
  return runDefaultCli(
    kit,
    ["--before", inputs.beforePath, "--after", inputs.afterPath, "--used", inputs.usedPath],
    join(stamp, "out"),
  );
}

export function defaultCliShape(pin = loadPin()) {
  return pin.publicKit.defaultCli;
}
