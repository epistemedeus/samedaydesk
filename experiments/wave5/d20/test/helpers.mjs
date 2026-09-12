import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLOCK,
  EXPIRES,
  F08_AFTER_REL,
  F08_BEFORE_REL,
  F08_PAYMENT_REL,
  JOB_ID,
  SDS_ROOT,
} from "../lib/pins.mjs";
import { parseJsonStdout, runNode } from "../lib/spawn.mjs";
import { resolveF08, resolveMailbox, resolveOutbox } from "../lib/resolve.mjs";

let mailboxMemo = null;
let outboxMemo = null;
let f08Memo = null;

export function mailbox() {
  if (!mailboxMemo) mailboxMemo = mailboxResolve();
  return mailboxMemo;
}

function mailboxResolve() {
  return resolveMailbox();
}

export function outbox() {
  if (!outboxMemo) outboxMemo = resolveOutbox();
  return outboxMemo;
}

export function f08() {
  if (!f08Memo) f08Memo = resolveF08();
  return f08Memo;
}

export function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function envelopePath(mailboxDir, requestId) {
  return join(mailboxDir, requestId, "envelope.json");
}

export function readEnvelope(mailboxDir, requestId) {
  return JSON.parse(readFileSync(envelopePath(mailboxDir, requestId), "utf8"));
}

export function completeF08Job(outDir) {
  mkdirSync(outDir, { recursive: true });
  const wrapper = f08();
  const result = runNode(
    wrapper.cli,
    [
      "run",
      JOB_ID,
      "--before",
      join(wrapper.root, F08_BEFORE_REL),
      "--after",
      join(wrapper.root, F08_AFTER_REL),
      "--funding",
      "reserved-fixture",
      "--payment",
      join(wrapper.root, F08_PAYMENT_REL),
      "--out-dir",
      outDir,
    ],
    { cwd: wrapper.root, timeout: 120_000 },
  );
  if (result.status !== 0) {
    throw new Error(`F08 run failed status=${result.status} stderr=${result.stderr} stdout=${result.stdout}`);
  }
  const body = parseJsonStdout(result);
  const receiptPath = join(outDir, "receipt.json");
  if (!existsSync(receiptPath)) {
    throw new Error("F08 did not write receipt.json");
  }
  return {
    body,
    receipt: JSON.parse(readFileSync(receiptPath, "utf8")),
    receiptPath,
    outDir,
    f08: wrapper,
  };
}

export function runMailbox(args, extra = {}) {
  const impl = mailbox();
  return runNode(impl.cli, args, { cwd: SDS_ROOT, timeout: extra.timeout ?? 120_000 });
}

export function runOutbox(args, extra = {}) {
  const impl = outbox();
  return runNode(impl.cli, args, { cwd: SDS_ROOT, timeout: extra.timeout ?? 60_000 });
}

export function seedMailbox(args) {
  return runMailbox([
    "seed",
    "--clock",
    CLOCK,
    "--expires-at",
    EXPIRES,
    ...args,
  ]);
}

export function pickupMailbox(args) {
  return runMailbox(["pickup", "--clock", CLOCK, ...args]);
}

export async function spawnReceiver(args = []) {
  const impl = outbox();
  const child = spawn(process.execPath, [impl.receiver, ...args], {
    cwd: SDS_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const info = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`receiver start timeout stderr=${stderr}`));
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      const line = stdout.split("\n").find((row) => lStartsJson(row));
      if (line) {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      if (code && !stdout.includes("{")) {
        clearTimeout(timer);
        reject(new Error(`receiver exited ${code} stderr=${stderr}`));
      }
    });
  });
  return { child, ...info };
}

function lStartsJson(row) {
  return row.startsWith("{");
}

export function stopChild(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
}

export { CLOCK, EXPIRES, JOB_ID };
