import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { F08_PIN_SHA } from "../lib/pins.mjs";
import { DEFAULT_PIN_WORKTREE } from "../lib/adapters.mjs";

export const here = dirname(fileURLToPath(import.meta.url));
export const OWNED = join(here, "..");
export const CLI = join(OWNED, "bin/batch.mjs");
export const REPO_ROOT = join(OWNED, "../..");

export function ensurePr52Worktree() {
  const dest = process.env.F08_PIN_ROOT || DEFAULT_PIN_WORKTREE;
  const index = join(dest, "server/paid-useful-jobs/index.mjs");
  if (existsSync(index)) {
    process.env.F08_PIN_ROOT = dest;
    return dest;
  }
  const add = spawnSync("git", ["worktree", "add", "--detach", dest, F08_PIN_SHA], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (add.status !== 0) {
    const fetch = spawnSync("git", ["fetch", "origin", F08_PIN_SHA], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    if (fetch.status !== 0) {
      throw new Error(`git fetch PR52 pin failed: ${fetch.stderr || fetch.stdout}`);
    }
    const retry = spawnSync("git", ["worktree", "add", "--detach", dest, F08_PIN_SHA], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    if (retry.status !== 0 || !existsSync(index)) {
      throw new Error(`PR52 worktree missing at ${dest}: ${retry.stderr || add.stderr}`);
    }
  }
  if (!existsSync(index)) {
    throw new Error(`PR52 pin ${F08_PIN_SHA} did not contain server/paid-useful-jobs/index.mjs`);
  }
  process.env.F08_PIN_ROOT = dest;
  return dest;
}

ensurePr52Worktree();

export function callerBudget() {
  return {
    before: join(OWNED, "fixtures/caller/vendor-budget-impact/before.json"),
    after: join(OWNED, "fixtures/caller/vendor-budget-impact/after.json"),
  };
}

export function sampleBudget() {
  return {
    before: join(OWNED, "fixtures/seeded/sample-before.json"),
    after: join(OWNED, "fixtures/seeded/sample-after.json"),
  };
}

export function loadReservedPayment() {
  return JSON.parse(readFileSync(join(OWNED, "fixtures/payment/reserved-fixture.json"), "utf8"));
}

export function journeyRequest() {
  const files = callerBudget();
  return {
    schema: "samedaydesk.paid-batch-reconciler.request.v1",
    items: [
      {
        id: "ok-caller-pair",
        engineId: "vendor-budget-impact",
        files,
        funding: "reserved-fixture",
        payment: loadReservedPayment(),
      },
      {
        id: "missing-after",
        engineId: "vendor-budget-impact",
        files: { before: files.before },
        funding: "reserved-fixture",
        payment: loadReservedPayment(),
      },
    ],
  };
}

export function liveSettlePayload() {
  const payment = structuredClone(loadReservedPayment());
  delete payment.fixture;
  delete payment.label;
  delete payment.live;
  delete payment.purchaseAuthority;
  payment.accepted = {
    ...payment.accepted,
    payTo: "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee",
  };
  return payment;
}
