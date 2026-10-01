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
  const files = checker.files || {};
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
