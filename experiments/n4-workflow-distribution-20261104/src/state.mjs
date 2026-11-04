import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { experimentRoot, repoPath } from "./paths.mjs";
import { loadPins, verifyAssets } from "./pins.mjs";

const INSTALL_SCHEMA = "n4.workflow-distribution.install.v1";
const CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function fail(code, message) {
  return { ok: false, code, message };
}

export function assertClock(clock) {
  if (typeof clock !== "string" || !CLOCK.test(clock)) return fail("clock", "clock must be an explicit UTC instant");
  return { ok: true };
}

function assertStateDir(stateDir) {
  if (!stateDir) return fail("usage", "--state is required");
  try {
    const stat = lstatSync(stateDir);
    if (stat.isSymbolicLink()) return fail("symlink", "state path is a symlink");
    if (!stat.isDirectory()) return fail("usage", "--state must be a directory");
  } catch (error) {
    if (error && error.code === "ENOENT") return { ok: true, missing: true };
    return fail("usage", "cannot read --state");
  }
  return { ok: true, missing: false };
}

function archiveMatches(pins) {
  const file = repoPath(pins.native.archivePath);
  const bytes = readFileSync(file);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== pins.native.archiveBytes || sha !== pins.native.archiveSha256) {
    return fail("pin_mismatch", "useful-jobs archive does not match the admitted pin");
  }
  const discovery = JSON.parse(readFileSync(repoPath("client/public/discovery/useful-jobs.json"), "utf8"));
  if (discovery.archive?.sha256 !== pins.native.archiveSha256 || discovery.archive?.bytes !== pins.native.archiveBytes) {
    return fail("pin_mismatch", "discovery archive pin does not match the admitted pin");
  }
  return { ok: true, file };
}

function extractKit(stateDir, pins) {
  const archive = archiveMatches(pins);
  if (!archive.ok) return archive;
  const kitParent = join(stateDir, "kit");
  rmSync(kitParent, { recursive: true, force: true });
  mkdirSync(kitParent, { recursive: true });
  const extracted = spawnSync("tar", ["-xzf", archive.file, "-C", kitParent], { encoding: "utf8" });
  if (extracted.status !== 0) return fail("extract", "kit archive did not extract");
  const root = join(kitParent, pins.native.rootName);
  if (!existsSync(join(root, "bin", "useful-jobs.mjs"))) return fail("extract", "kit root is missing its command");
  return { ok: true, root };
}

function writeInstall(stateDir, pins, clock, updatedAt) {
  const body = {
    schema: INSTALL_SCHEMA,
    workflowVersion: pins.workflowVersion,
    installedAt: clock,
    updatedAt,
    kitRoot: `kit/${pins.native.rootName}`,
    archiveSha256: pins.native.archiveSha256,
    difyStarted: false,
    ghostServerStarted: false,
  };
  writeFileSync(join(stateDir, "installed.json"), `${JSON.stringify(body, null, 2)}\n`);
  return body;
}

export function readInstall(stateDir) {
  const file = join(stateDir, "installed.json");
  if (!existsSync(file)) return null;
  const doc = JSON.parse(readFileSync(file, "utf8"));
  if (doc.schema !== INSTALL_SCHEMA) return null;
  return doc;
}

export function installState(stateDir, clock) {
  const timed = assertClock(clock);
  if (!timed.ok) return timed;
  const state = assertStateDir(stateDir);
  if (!state.ok) return state;
  if (!state.missing && readInstall(stateDir)) return fail("already_installed", "state is already installed; use update");
  const assets = verifyAssets(experimentRoot);
  if (!assets.ok) return fail("pin_mismatch", "admitted asset bytes do not match");
  mkdirSync(stateDir, { recursive: true });
  const kit = extractKit(stateDir, assets.pins);
  if (!kit.ok) return kit;
  const body = writeInstall(stateDir, assets.pins, clock, null);
  return { ok: true, installed: body };
}

export function updateState(stateDir, clock) {
  const timed = assertClock(clock);
  if (!timed.ok) return timed;
  const state = assertStateDir(stateDir);
  if (!state.ok) return state;
  const current = state.missing ? null : readInstall(stateDir);
  if (!current) return fail("not_installed", "state is not installed; use install");
  const assets = verifyAssets(experimentRoot);
  if (!assets.ok) return fail("pin_mismatch", "admitted asset bytes do not match");
  if (current.workflowVersion !== assets.pins.workflowVersion || current.archiveSha256 !== assets.pins.native.archiveSha256) {
    return fail("pin_mismatch", "installed pin does not match the admitted workflow");
  }
  const kit = extractKit(stateDir, assets.pins);
  if (!kit.ok) return kit;
  const body = writeInstall(stateDir, assets.pins, current.installedAt, clock);
  return { ok: true, installed: body };
}

export function removeState(stateDir) {
  const state = assertStateDir(stateDir);
  if (!state.ok) return state;
  if (state.missing) return { ok: true, removed: false };
  rmSync(stateDir, { recursive: true, force: true });
  return { ok: true, removed: true };
}

export function kitRootFrom(stateDir, pins = loadPins()) {
  return join(stateDir, "kit", pins.native.rootName);
}
