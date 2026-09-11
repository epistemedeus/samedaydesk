import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import {
  F08_CLI_REL,
  F08_PIN_SHA,
  MAILBOX_CLI_REL,
  MAILBOX_PIN_SHA,
  OUTBOX_CLI_REL,
  OUTBOX_PKG_REL,
  OUTBOX_PIN_SHA,
  OUTBOX_RECEIVER_REL,
  SDS_ROOT,
} from "./pins.mjs";

function git(args, cwd = SDS_ROOT) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function revParse(dir) {
  const result = git(["rev-parse", "HEAD"], dir);
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function fetchSha(sha) {
  const have = git(["cat-file", "-t", sha]);
  if (have.status === 0) return true;
  const fetched = git(["fetch", "--depth=1", "origin", sha]);
  return fetched.status === 0;
}

function attachWorktree(sha, dest) {
  if (existsSync(join(dest, ".git")) || existsSync(dest)) {
    const head = revParse(dest);
    if (head === sha) return dest;
  }
  if (!fetchSha(sha)) {
    throw new Error(`cannot fetch pin ${sha}`);
  }
  const add = git(["worktree", "add", "--detach", dest, sha]);
  if (add.status !== 0 && !existsSync(join(dest, ".git"))) {
    throw new Error(`worktree add failed for ${sha}: ${add.stderr || add.stdout}`);
  }
  const head = revParse(dest);
  if (head !== sha) {
    throw new Error(`worktree ${dest} head ${head} != ${sha}`);
  }
  return dest;
}

function mailboxPresent(root) {
  return existsSync(join(root, MAILBOX_CLI_REL));
}

function outboxPresent(root) {
  return existsSync(join(root, OUTBOX_CLI_REL));
}

function ensureOutboxPgDriver(outboxRoot) {
  const pkgDir = join(outboxRoot, OUTBOX_PKG_REL);
  if (existsSync(join(pkgDir, "node_modules/pg"))) return;
  const install = spawnSync("npm", ["install", "--omit=dev"], {
    cwd: pkgDir,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (install.status !== 0) {
    throw new Error(`npm install in ${pkgDir} failed: ${install.stderr || install.stdout}`);
  }
}

export function resolveMailbox() {
  const envRoot = process.env.W5_D20_MAILBOX_ROOT;
  if (envRoot && mailboxPresent(envRoot)) {
    return {
      root: envRoot,
      sha: revParse(envRoot),
      source: "env",
      cli: join(envRoot, MAILBOX_CLI_REL),
    };
  }
  if (mailboxPresent(SDS_ROOT)) {
    const sha = git(["log", "-1", "--format=%H", "--", "tools/result-mailbox"]).stdout.trim();
    return {
      root: SDS_ROOT,
      sha: sha || revParse(SDS_ROOT),
      source: "in-repo",
      cli: join(SDS_ROOT, MAILBOX_CLI_REL),
    };
  }
  const dest = process.env.W5_D20_MAILBOX_WORKTREE || join(tmpdir(), `w5-d20-mailbox-${MAILBOX_PIN_SHA.slice(0, 12)}`);
  const root = attachWorktree(MAILBOX_PIN_SHA, dest);
  return {
    root,
    sha: MAILBOX_PIN_SHA,
    source: "pin-worktree",
    cli: join(root, MAILBOX_CLI_REL),
  };
}

export function resolveOutbox() {
  const envRoot = process.env.W5_D20_OUTBOX_ROOT;
  if (envRoot && outboxPresent(envRoot)) {
    ensureOutboxPgDriver(envRoot);
    return {
      root: envRoot,
      sha: revParse(envRoot),
      source: "env",
      cli: join(envRoot, OUTBOX_CLI_REL),
      receiver: join(envRoot, OUTBOX_RECEIVER_REL),
    };
  }
  if (outboxPresent(SDS_ROOT)) {
    ensureOutboxPgDriver(SDS_ROOT);
    const sha = git(["log", "-1", "--format=%H", "--", "tools/job-delivery-outbox"]).stdout.trim();
    return {
      root: SDS_ROOT,
      sha: sha || revParse(SDS_ROOT),
      source: "in-repo",
      cli: join(SDS_ROOT, OUTBOX_CLI_REL),
      receiver: join(SDS_ROOT, OUTBOX_RECEIVER_REL),
    };
  }
  const dest = process.env.W5_D20_OUTBOX_WORKTREE || join(tmpdir(), `w5-d20-outbox-${OUTBOX_PIN_SHA.slice(0, 12)}`);
  const root = attachWorktree(OUTBOX_PIN_SHA, dest);
  ensureOutboxPgDriver(root);
  return {
    root,
    sha: OUTBOX_PIN_SHA,
    source: "pin-worktree",
    cli: join(root, OUTBOX_CLI_REL),
    receiver: join(root, OUTBOX_RECEIVER_REL),
  };
}

export function resolveF08() {
  const envRoot = process.env.W5_D20_F08_ROOT;
  if (envRoot && existsSync(join(envRoot, F08_CLI_REL))) {
    return { root: envRoot, sha: revParse(envRoot), source: "env", cli: join(envRoot, F08_CLI_REL) };
  }
  if (existsSync(join(SDS_ROOT, F08_CLI_REL))) {
    return {
      root: SDS_ROOT,
      sha: revParse(SDS_ROOT),
      source: "in-repo",
      cli: join(SDS_ROOT, F08_CLI_REL),
    };
  }
  const dest = join(tmpdir(), `w5-d20-f08-${F08_PIN_SHA.slice(0, 12)}`);
  const root = attachWorktree(F08_PIN_SHA, dest);
  return { root, sha: F08_PIN_SHA, source: "pin-worktree", cli: join(root, F08_CLI_REL) };
}

export function catalogJobIds(mailboxRoot) {
  const catalogPath = join(mailboxRoot, "client/public/for-agents/useful-jobs/catalog.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  return (catalog.jobs || []).map((job) => job.id);
}
