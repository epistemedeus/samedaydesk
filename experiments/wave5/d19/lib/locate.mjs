import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CO16_PATH,
  CO16_SHA,
  CO20_PATH,
  CO20_SHA,
  D19_ROOT,
  LEDGER_CLI,
  ORDER_CLI,
  REPO_ROOT,
} from "./pins.mjs";

export class Incomplete extends Error {
  constructor(message) {
    super(message);
    this.name = "Incomplete";
    this.code = "incomplete";
  }
}

function git(args, cwd = REPO_ROOT) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gitText(args, cwd = REPO_ROOT) {
  const result = git(args, cwd);
  if (result.status !== 0) {
    throw new Incomplete(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout || "").trim();
}

export function ensureD19Deps() {
  const pg = join(D19_ROOT, "node_modules/pg/package.json");
  if (existsSync(pg)) return { pg: join(D19_ROOT, "node_modules/pg") };
  const install = spawnSync("npm", ["install"], {
    cwd: D19_ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (install.status !== 0 || !existsSync(pg)) {
    throw new Incomplete(`npm install pg failed: ${install.stderr || install.stdout}`);
  }
  return { pg: join(D19_ROOT, "node_modules/pg") };
}

function linkNodeModules(pinRoot) {
  ensureD19Deps();
  const src = join(D19_ROOT, "node_modules");
  const dest = join(pinRoot, "node_modules");
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (name.startsWith(".")) continue;
    const from = join(src, name);
    const to = join(dest, name);
    if (existsSync(to)) continue;
    try {
      symlinkSync(from, to);
    } catch (err) {
      if (err && err.code !== "EEXIST") throw err;
    }
  }
}

function fetchSha(sha) {
  const have = git(["cat-file", "-t", sha]);
  if (have.status === 0 && String(have.stdout).trim() === "commit") return;
  const fetched = git(["fetch", "origin", sha]);
  if (fetched.status !== 0) {
    throw new Incomplete(`cannot fetch ${sha}: ${fetched.stderr || fetched.stdout}`);
  }
}

function worktreeHead(dest) {
  if (!existsSync(dest)) return null;
  const result = git(["-C", dest, "rev-parse", "HEAD"], dest);
  if (result.status !== 0) return null;
  return String(result.stdout || "").trim();
}

function materializeSha(sha) {
  const dest = join(tmpdir(), "w5-d19-runtime", sha);
  const head = worktreeHead(dest);
  if (head === sha) {
    linkNodeModules(dest);
    return dest;
  }
  fetchSha(sha);
  mkdirSync(join(tmpdir(), "w5-d19-runtime"), { recursive: true });
  if (existsSync(dest)) {
    throw new Incomplete(`worktree ${dest} exists but HEAD is ${head}, want ${sha}`);
  }
  const added = git(["worktree", "add", "--detach", dest, sha]);
  if (added.status !== 0) {
    throw new Incomplete(`worktree add ${sha} failed: ${added.stderr || added.stdout}`);
  }
  linkNodeModules(dest);
  return dest;
}

function inTreePackage(relDir, cliRel) {
  const dir = join(REPO_ROOT, relDir);
  const cli = join(dir, cliRel);
  if (!existsSync(cli)) return null;
  return { root: REPO_ROOT, dir, cli, source: "in-tree" };
}

export function locateCo20() {
  if (process.env.W5_D19_CO20_ROOT) {
    const root = realpathSync(process.env.W5_D19_CO20_ROOT);
    const cli = join(root, CO20_PATH, ORDER_CLI);
    if (!existsSync(cli)) throw new Incomplete(`W5_D19_CO20_ROOT missing ${ORDER_CLI}`);
    linkNodeModules(root);
    return { root, cli, sha: gitText(["rev-parse", "HEAD"], root), source: "env", path: CO20_PATH };
  }
  const local = inTreePackage(CO20_PATH, ORDER_CLI);
  if (local) {
    linkNodeModules(local.root);
    return {
      root: local.root,
      cli: local.cli,
      sha: gitText(["rev-parse", "HEAD"], local.root),
      source: "in-tree",
      path: CO20_PATH,
    };
  }
  const root = materializeSha(CO20_SHA);
  const cli = join(root, CO20_PATH, ORDER_CLI);
  if (!existsSync(cli)) throw new Incomplete(`pin ${CO20_SHA} missing ${CO20_PATH}${ORDER_CLI}`);
  return { root, cli, sha: CO20_SHA, source: "pin-worktree", path: CO20_PATH };
}

export function locateCo16() {
  if (process.env.W5_D19_CO16_ROOT) {
    const root = realpathSync(process.env.W5_D19_CO16_ROOT);
    const cli = join(root, CO16_PATH, LEDGER_CLI);
    if (!existsSync(cli)) throw new Incomplete(`W5_D19_CO16_ROOT missing ${LEDGER_CLI}`);
    return { root, cli, sha: gitText(["rev-parse", "HEAD"], root), source: "env", path: CO16_PATH };
  }
  const local = inTreePackage(CO16_PATH, LEDGER_CLI);
  if (local) {
    return {
      root: local.root,
      cli: local.cli,
      sha: gitText(["rev-parse", "HEAD"], local.root),
      source: "in-tree",
      path: CO16_PATH,
    };
  }
  const root = materializeSha(CO16_SHA);
  const cli = join(root, CO16_PATH, LEDGER_CLI);
  if (!existsSync(cli)) throw new Incomplete(`pin ${CO16_SHA} missing ${CO16_PATH}${LEDGER_CLI}`);
  return { root, cli, sha: CO16_SHA, source: "pin-worktree", path: CO16_PATH };
}

export function co20Fixture(name) {
  const located = locateCo20();
  return join(located.root, CO20_PATH, "fixtures/orders", name);
}

export function ledgerLibPath() {
  const located = locateCo16();
  return join(located.root, CO16_PATH, "lib/ledger.mjs");
}
