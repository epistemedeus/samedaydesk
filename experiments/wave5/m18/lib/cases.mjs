import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { PACKAGE_ROOT, SDS_ROOT } from "./pins.mjs";
import { sha256File } from "./sha.mjs";

export function capturesRoot(packageRoot = PACKAGE_ROOT) {
  return join(packageRoot, "captures");
}

export function listCaseDirs(packageRoot = PACKAGE_ROOT) {
  const root = capturesRoot(packageRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .filter((dir) => existsSync(join(dir, "case.json")))
    .sort();
}

export function loadCase(caseDir) {
  const file = join(caseDir, "case.json");
  const spec = JSON.parse(readFileSync(file, "utf8"));
  return { ...spec, caseDir };
}

export function loadCaseById(id, packageRoot = PACKAGE_ROOT) {
  const dir = join(capturesRoot(packageRoot), id);
  if (!existsSync(join(dir, "case.json"))) {
    const error = new Error(`unknown trial case ${id}`);
    error.code = "usage";
    throw error;
  }
  return loadCase(dir);
}

function resolveCapture(entry, { caseDir, sdsRoot }) {
  if (typeof entry === "string") {
    const path = isAbsolute(entry) ? entry : resolve(caseDir, entry);
    return { path, expectedSha256: null };
  }
  if (entry && typeof entry.repoPath === "string") {
    const path = join(sdsRoot, entry.repoPath);
    return { path, expectedSha256: entry.sha256 || null };
  }
  if (entry && typeof entry.path === "string") {
    const path = isAbsolute(entry.path) ? entry.path : resolve(caseDir, entry.path);
    return { path, expectedSha256: entry.sha256 || null };
  }
  const error = new Error("case capture path is missing");
  error.code = "usage";
  throw error;
}

export function resolveCaseInputs(spec, { sdsRoot = SDS_ROOT } = {}) {
  const caseDir = spec.caseDir || dirname(spec.caseFile || "");
  const before = resolveCapture(spec.before, { caseDir, sdsRoot });
  const after = resolveCapture(spec.after, { caseDir, sdsRoot });
  if (!existsSync(before.path)) {
    const error = new Error(`before capture missing: ${before.path}`);
    error.code = "usage";
    throw error;
  }
  if (!existsSync(after.path)) {
    const error = new Error(`after capture missing: ${after.path}`);
    error.code = "usage";
    throw error;
  }
  const beforeSha256 = sha256File(before.path);
  const afterSha256 = sha256File(after.path);
  if (before.expectedSha256 && before.expectedSha256 !== beforeSha256) {
    const error = new Error(`before capture sha256 mismatch at ${before.path}`);
    error.code = "capture_digest_mismatch";
    throw error;
  }
  if (after.expectedSha256 && after.expectedSha256 !== afterSha256) {
    const error = new Error(`after capture sha256 mismatch at ${after.path}`);
    error.code = "capture_digest_mismatch";
    throw error;
  }
  return { before: { ...before, sha256: beforeSha256 }, after: { ...after, sha256: afterSha256 } };
}
