// Resolve the maintained Neo230 and S14 checkouts by commit.
// An unqualified sibling directory is not a pin, even when a checkout happens to sit there.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");
export const jobRoot = resolve(repoRoot, "..");

export const NEO230 = "de9c23b5d19de30874e432e7ef1193d0d02d6702";
export const S14_PIN = "00267aeb03c3ce01b9b318f5ee0172aee34d7e34";
export const STALE_NEO = "259ea74da295f12d64e2aae9cb2042c4a14c6b96";

const STALE_SIBLING_NAMES = new Set(["s14", "neomorphic-io", "neo"]);

export function gitHead(root) {
  if (!root || !existsSync(join(root, ".git"))) return null;
  const ran = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (ran.status !== 0) return null;
  return ran.stdout.trim();
}

function refuse(code, detail) {
  const error = new Error(detail);
  error.code = code;
  return error;
}

export function resolvePin(kind, explicit) {
  const expected = kind === "neo" ? NEO230 : S14_PIN;
  const fallback = kind === "neo"
    ? join(jobRoot, "pins", "neo230")
    : join(jobRoot, "pins", "s14-00267aeb");
  const root = explicit ? resolve(explicit) : fallback;
  const base = root.split("/").at(-1);
  if (!explicit && STALE_SIBLING_NAMES.has(base)) {
    throw refuse("stale_sibling", `${base} is an unqualified sibling checkout`);
  }
  if (explicit && STALE_SIBLING_NAMES.has(base)) {
    throw refuse("stale_sibling", `${base} is an unqualified sibling checkout`);
  }
  const head = gitHead(root);
  if (!head) throw refuse("pin_unavailable", `${kind} checkout is missing at ${root}`);
  if (head === STALE_NEO) throw refuse("stale_sibling", `refusing stale neo ${STALE_NEO}`);
  if (head !== expected) throw refuse("pin_mismatch", `${kind} HEAD ${head} is not ${expected}`);
  return { root, head };
}
