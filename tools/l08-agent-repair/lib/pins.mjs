// Public S14 checker lives in this repository. Neo230 stays unfetched:
// the repository is private and the ordinary caller does not need it.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkerRoot, verifyPublicChecker } from "./public-adapter.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");

export const NEO230 = "de9c23b5d19de30874e432e7ef1193d0d02d6702";
export const S14_PIN = "00267aeb03c3ce01b9b318f5ee0172aee34d7e34";
export const STALE_NEO = "259ea74da295f12d64e2aae9cb2042c4a14c6b96";

export const PIN_SOURCES = Object.freeze({
  neo: Object.freeze({
    kind: "neo",
    commit: NEO230,
    repo: "https://github.com/epistemedeus/neomorphic-io.git",
    acquire: "refused",
    reason: "private",
  }),
  s14: Object.freeze({
    kind: "s14",
    commit: S14_PIN,
    repo: "https://github.com/epistemedeus/agent-payment-integrity.git",
    acquire: "vendored",
    path: "vendor/agent-payment-integrity",
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

export function resolvePin(kind, explicit) {
  if (kind === "neo") {
    throw refuse("private_acquisition", `Neo ${NEO230} is private and is not fetched`);
  }
  const spec = PIN_SOURCES[kind];
  if (!spec) throw refuse("pin_unavailable", `${kind} is not a declared pin`);
  if (!explicit) {
    const provenance = verifyPublicChecker();
    if (provenance.checker.commit !== spec.commit) {
      throw refuse("pin_mismatch", `${kind} export ${provenance.checker.commit} is not ${spec.commit}`);
    }
    return { root: checkerRoot, head: spec.commit, acquired: "vendored" };
  }
  const root = resolve(explicit);
  const base = root.split("/").at(-1);
  if (STALE_SIBLING_NAMES.has(base)) {
    throw refuse("stale_sibling", `${base} is an unqualified sibling checkout`);
  }
  const head = gitHead(root);
  if (!head) throw refuse("pin_unavailable", `${kind} checkout is missing`);
  if (head === STALE_NEO) throw refuse("stale_sibling", `refusing stale neo ${STALE_NEO}`);
  if (head !== spec.commit) throw refuse("pin_mismatch", `${kind} HEAD ${head} is not ${spec.commit}`);
  return { root, head, acquired: "explicit" };
}

export function acquirePin(kind) {
  if (kind === "neo") {
    throw refuse("private_acquisition", `Neo ${NEO230} is private and is not fetched`);
  }
  return resolvePin(kind);
}

export function acquirePins() {
  const s14 = resolvePin("s14");
  return {
    neo: { head: null, commit: NEO230, acquired: "refused", reason: "private_git", root: null },
    s14: { head: s14.head, acquired: s14.acquired, root: s14.root },
  };
}
