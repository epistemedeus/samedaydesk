// Public stand-in for Neo230 runS14. Spawns the vendored MIT checker.
// Does not fetch neomorphic-io and does not copy its source.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");
export const checkerRoot = join(repoRoot, "vendor/agent-payment-integrity");
export const provenancePath = join(checkerRoot, "PROVENANCE.json");

export const ALLOWED_FIXTURES = Object.freeze([
  "catalog-row-repair-add-required.json",
  "catalog-row-contract-absent.json",
  "catalog-row-repair-complete.json",
]);

function refuse(code, detail) {
  const error = new Error(detail);
  error.code = code;
  return error;
}

export function loadProvenance() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(provenancePath, "utf8"));
  } catch {
    throw refuse("provenance_mismatch", "public checker provenance is missing");
  }
  if (parsed?.schema !== "samedaydesk.public-readiness.provenance.v1") {
    throw refuse("provenance_mismatch", "public checker provenance schema mismatch");
  }
  return parsed;
}

export function verifyPublicChecker() {
  const provenance = loadProvenance();
  const checker = provenance.checker || {};
  if (checker.commit !== "00267aeb03c3ce01b9b318f5ee0172aee34d7e34") {
    throw refuse("provenance_mismatch", "public checker commit is not the pinned S14 export");
  }
  if (checker.license !== "MIT" || checker.visibility !== "public") {
    throw refuse("provenance_mismatch", "public checker license or visibility changed");
  }
  if (provenance.adapter?.privateFilesCopied !== false || provenance.adapter?.credentialsCopied !== false) {
    throw refuse("provenance_mismatch", "provenance claims private material was copied");
  }
  if (provenance.deployment?.publicHostActivated !== false) {
    throw refuse("provenance_mismatch", "provenance claims a public deployment");
  }
  // Preserve the S14 catalog fixtures and admit only the received shared validator overlay.
  // A caller cannot bless new bytes by editing the provenance receipt's hashes.
  const overlay = provenance.networkAwareReceiving;
  const expectedOverlay = {
    "integrity.mjs": "d018d829e07052ae14db5c79c4309840bf9862ba56ae5dc0e8cd597d4371e244",
    "package.json": "c82c41d46f3413e5f8631190c122b0ee4db35d52d499212912ac03da901c23c1",
    "package-lock.json": "f557346839db6012bd0fdeff2f7747dc05ebec4ecf59055e4e7342b251de766a",
  };
  if (overlay && (overlay.repository !== "epistemedeus/agent-payment-integrity" ||
      overlay.commit !== "4d110186a9ddbd3de5ce74f06540c145455c2f2a" ||
      overlay.testedSource !== "dd9fb16f6ee64153b9f44fac19f45a1c9660399a" ||
      overlay.version !== "0.1.0-candidate.17" ||
      Object.keys(overlay.files || {}).length !== Object.keys(expectedOverlay).length ||
      Object.entries(expectedOverlay).some(([name, expected]) => overlay.files?.[name] !== expected))) {
    throw refuse("provenance_mismatch", "public checker network-aware overlay differs from the received source");
  }
  const files = { ...(checker.files || {}), ...(overlay ? expectedOverlay : {}) };
  const names = Object.keys(files);
  if (names.length === 0) throw refuse("provenance_mismatch", "public checker file list is empty");
  for (const rel of names) {
    if (rel.includes("..") || rel.startsWith("/") || rel === "PROVENANCE.json") {
      throw refuse("provenance_mismatch", `refusing provenance path ${rel}`);
    }
    let raw;
    try {
      raw = readFileSync(join(checkerRoot, rel));
    } catch {
      throw refuse("checker_unavailable", `public checker file missing: ${rel}`);
    }
    const got = createHash("sha256").update(raw).digest("hex");
    if (got !== files[rel]) throw refuse("provenance_mismatch", `public checker hash mismatch: ${rel}`);
  }
  return provenance;
}

export function fixtureRelative(name) {
  if (typeof name !== "string" || !ALLOWED_FIXTURES.includes(name)) {
    throw refuse("fixture_refused", "fixture is not an exported public row");
  }
  return `action/fixtures/${name}`;
}

function checkerEnv() {
  return {
    PATH: process.env.PATH || "",
    TMPDIR: process.env.TMPDIR || "/tmp",
    LANG: process.env.LANG || "C",
    CATALOG_ROW_CHECK: "1",
  };
}

export function runPublicAdapter(sourceRelative) {
  const provenance = verifyPublicChecker();
  const allowed = new Set(ALLOWED_FIXTURES.map((name) => `action/fixtures/${name}`));
  if (!allowed.has(sourceRelative)) throw refuse("fixture_refused", "fixture path is not an exported public row");
  const script = join(checkerRoot, "integrity.catalog-repair.test.mjs");
  const ran = spawnSync(process.execPath, [script, sourceRelative], {
    cwd: checkerRoot,
    encoding: "utf8",
    env: checkerEnv(),
    timeout: 20_000,
  });
  const stdout = ran.stdout ?? "";
  let json = null;
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = null;
    }
  }
  return {
    status: ran.status ?? 1,
    stdout,
    stderr: ran.stderr ?? "",
    json,
    commit: provenance.checker.commit,
    privateGit: false,
  };
}
