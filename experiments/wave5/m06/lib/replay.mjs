import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function parseStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  const line = text.split(/\n/).filter(Boolean).at(-1);
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function usedClassFromBrief(summary, brief) {
  if (summary?.refused) return { usedClass: "refuse", reason: summary.code || "refused" };
  if (!brief) return { usedClass: "unknown-brief", reason: "missing-brief" };
  const breaking = brief.impact?.breaking || [];
  if (breaking.length) {
    return { usedClass: "breaking", reason: breaking[0].reason || "breaking" };
  }
  const unknown = brief.impact?.unknown || [];
  if (unknown.length) {
    return { usedClass: "unknown", reason: unknown[0].reason || "unknown" };
  }
  return { usedClass: "unchanged", reason: "structural-equal" };
}

export function specifiedVsPin(entry, actual) {
  if (entry.transport === "refuse") {
    return actual.refused === true && actual.exitCode === 2 && actual.ok === false
      ? "agree-refuse"
      : "disagree-refuse";
  }
  const wantIncompatible = entry.specified.relation === "incompatible";
  const gotBreaking = actual.breaking > 0;
  if (wantIncompatible && gotBreaking) return "agree";
  if (!wantIncompatible && !gotBreaking && actual.ok === true && actual.refused !== true) {
    if (entry.specified.change === "weakening") return "agree-not-breaking-weakening-unclassified";
    return "agree";
  }
  if (wantIncompatible && !gotBreaking) return "gap-missed-incompatible";
  if (!wantIncompatible && gotBreaking) return "gap-false-breaking";
  return "disagree";
}

export function materializeCase(entry, dir) {
  mkdirSync(dir, { recursive: true });
  const beforePath = join(dir, "before.json");
  const afterPath = join(dir, "after.json");
  const usedPath = join(dir, "used.json");
  writeFileSync(beforePath, `${JSON.stringify(entry.before, null, 2)}\n`);
  writeFileSync(afterPath, `${JSON.stringify(entry.after, null, 2)}\n`);
  writeFileSync(usedPath, `${JSON.stringify(entry.used, null, 2)}\n`);
  return { beforePath, afterPath, usedPath };
}

export function runEngineCase(bin, entry, { outDir } = {}) {
  const work = outDir || mkdtempSync(join(tmpdir(), "w5-m06-case-"));
  const paths = materializeCase(entry, work);
  const briefDir = join(work, "out");
  mkdirSync(briefDir, { recursive: true });
  const spawned = spawnSync(
    process.execPath,
    [bin, "--before", paths.beforePath, "--after", paths.afterPath, "--used", paths.usedPath, "--out-dir", briefDir],
    { encoding: "utf8", timeout: 20_000 },
  );
  const summary = parseStdout(spawned.stdout);
  const briefPath = join(briefDir, "drift-brief.json");
  const brief = existsSync(briefPath) ? JSON.parse(readFileSync(briefPath, "utf8")) : null;
  const classified = usedClassFromBrief(summary, brief);
  return {
    exitCode: spawned.status,
    stdout: spawned.stdout,
    stderr: spawned.stderr,
    parseable: Boolean(summary),
    ok: summary?.ok === true,
    refused: summary?.refused === true,
    code: summary?.code || null,
    status: summary?.status || null,
    breaking: typeof summary?.breaking === "number" ? summary.breaking : brief?.impact?.breaking?.length || 0,
    unknown: typeof summary?.unknown === "number" ? summary.unknown : brief?.impact?.unknown?.length || 0,
    termsVersion: summary?.termsVersion || brief?.termsVersion || null,
    customerBrief: summary?.customerBrief === true || brief?.customerBrief === true,
    purchaseAuthority: summary?.purchaseAuthority === true || brief?.purchaseAuthority === true,
    sold: summary?.sold === true || brief?.sold === true,
    brief,
    briefDir,
    ...classified,
    transportFailure:
      spawned.error ||
      spawned.status === null ||
      !summary ||
      (spawned.status !== 0 && spawned.status !== 2) ||
      (summary?.ok !== true && summary?.refused !== true),
  };
}

export function alwaysPass(_entry) {
  return "compatible";
}

export function alwaysFail(_entry) {
  return "incompatible";
}

export function dummyAgrees(fn, entry) {
  if (entry.transport === "refuse") return true;
  return fn(entry) === entry.specified.relation;
}
