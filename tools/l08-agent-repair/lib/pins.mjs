// Exact Neo230 and S14 checkouts. A bare clone acquires them with
// `node tools/l08-agent-repair/cold-client.mjs acquire-pins`.
// The fetch argument is the declared commit. A branch tip is never checked out.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");
export const pinCacheDir = join(here, "../.pin-cache");

export const NEO230 = "de9c23b5d19de30874e432e7ef1193d0d02d6702";
export const S14_PIN = "00267aeb03c3ce01b9b318f5ee0172aee34d7e34";
export const STALE_NEO = "259ea74da295f12d64e2aae9cb2042c4a14c6b96";

export const PIN_SOURCES = Object.freeze({
  neo: Object.freeze({
    kind: "neo",
    commit: NEO230,
    repo: "https://github.com/epistemedeus/neomorphic-io.git",
    install: null,
  }),
  s14: Object.freeze({
    kind: "s14",
    commit: S14_PIN,
    repo: "https://github.com/epistemedeus/agent-payment-integrity.git",
    install: "npm-ci-ignore-scripts",
  }),
});

const STALE_SIBLING_NAMES = new Set(["s14", "neomorphic-io", "neo"]);

function refuse(code, detail) {
  const error = new Error(detail);
  error.code = code;
  return error;
}

export function gitHead(root) {
  if (!root || !existsSync(join(root, ".git"))) return null;
  const ran = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (ran.status !== 0) return null;
  return ran.stdout.trim();
}

export function exactFetchArgs(commit) {
  return ["fetch", "--depth", "1", "origin", commit];
}

export function pinCacheRoot(kind) {
  const spec = PIN_SOURCES[kind];
  if (!spec) throw refuse("pin_unavailable", `${kind} is not a declared pin`);
  return join(pinCacheDir, spec.commit);
}

function gitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
  };
}

function runGit(args, cwd) {
  const ran = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv() });
  if (ran.status !== 0) {
    const detail = `${ran.stderr || ran.stdout || ""}`.replace(/gho_[A-Za-z0-9_]+/g, "gho_redacted").trim();
    throw refuse("pin_fetch_failed", detail || `git ${args[0]} failed`);
  }
  return (ran.stdout || "").trim();
}

function installExact(spec, root) {
  if (spec.install !== "npm-ci-ignore-scripts") return;
  if (existsSync(join(root, "node_modules"))) return;
  if (!existsSync(join(root, "package-lock.json"))) {
    throw refuse("pin_install_failed", `${spec.kind} has no lockfile to install`);
  }
  const ran = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
  });
  if (ran.status !== 0) {
    throw refuse("pin_install_failed", `${spec.kind} npm ci failed`);
  }
}

export function acquirePin(kind) {
  const spec = PIN_SOURCES[kind];
  if (!spec) throw refuse("pin_unavailable", `${kind} is not a declared pin`);
  const dest = pinCacheRoot(kind);
  const base = dest.split("/").at(-1);
  if (STALE_SIBLING_NAMES.has(base)) {
    throw refuse("stale_sibling", `${base} is an unqualified sibling checkout`);
  }
  if (existsSync(join(dest, ".git"))) {
    const head = gitHead(dest);
    if (head === spec.commit) {
      installExact(spec, dest);
      return { root: dest, head, acquired: "reused" };
    }
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  try {
    runGit(["init", "-q"], dest);
    runGit(["remote", "add", "origin", spec.repo], dest);
    runGit(exactFetchArgs(spec.commit), dest);
    runGit(["checkout", "--detach", "FETCH_HEAD"], dest);
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    throw err;
  }
  const head = gitHead(dest);
  if (head === STALE_NEO) {
    rmSync(dest, { recursive: true, force: true });
    throw refuse("stale_sibling", `refusing stale neo ${STALE_NEO}`);
  }
  if (head !== spec.commit) {
    rmSync(dest, { recursive: true, force: true });
    throw refuse("pin_mismatch", `${kind} HEAD ${head} is not ${spec.commit}`);
  }
  installExact(spec, dest);
  return { root: dest, head, acquired: "fetched" };
}

export function acquirePins() {
  return {
    neo: acquirePin("neo"),
    s14: acquirePin("s14"),
  };
}

export function resolvePin(kind, explicit) {
  const spec = PIN_SOURCES[kind];
  if (!spec) throw refuse("pin_unavailable", `${kind} is not a declared pin`);
  const root = explicit ? resolve(explicit) : pinCacheRoot(kind);
  const base = root.split("/").at(-1);
  if (STALE_SIBLING_NAMES.has(base)) {
    throw refuse("stale_sibling", `${base} is an unqualified sibling checkout`);
  }
  const head = gitHead(root);
  if (!head) {
    throw refuse("pin_unavailable", `${kind} checkout is missing. Run: node tools/l08-agent-repair/cold-client.mjs acquire-pins`);
  }
  if (head === STALE_NEO) throw refuse("stale_sibling", `refusing stale neo ${STALE_NEO}`);
  if (head !== spec.commit) throw refuse("pin_mismatch", `${kind} HEAD ${head} is not ${spec.commit}`);
  return { root, head };
}
