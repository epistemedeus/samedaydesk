import test from "node:test";
import assert from "node:assert/strict";
import { CODE, EXIT } from "../src/constants.mjs";
import {
  inspectContributorPayoutKey,
  inspectDeskAuthority,
  inspectFieldText,
  looksLikePayoutKeyMaterial,
} from "../src/authority.mjs";
import { createDesk } from "../src/desk.mjs";
import { openAdapter } from "../src/adapters/index.mjs";
import { runDesk } from "./helpers.mjs";

test("seeded failure: desk holds EARNED_WORK_OWNER_TOKEN and is rejected", () => {
  const run = runDesk(["browse"], {
    env: { EARNED_WORK_OWNER_TOKEN: "dev-owner-token-s275" },
  });
  assert.equal(run.status, EXIT.DESK_HOLDS_SECRET, run.stdout);
  assert.equal(run.json.ok, false);
  assert.equal(run.json.rejected, true);
  assert.equal(run.json.killed, false);
  assert.equal(run.json.code, CODE.DESK_HOLDS_EARNED_WORK_SECRET);
  assert.doesNotMatch(run.stdout, /dev-owner-token-s275/);
  assert.match(run.stdout, /"key": "EARNED_WORK_OWNER_TOKEN"/);
  assert.doesNotMatch(run.stdout, /EARNED_WORK_OWNER_TOKEN=<redacted>/);
});

test("seeded failure: --owner-token is the same refusal", () => {
  const run = runDesk(["browse", "--owner-token", "dev-owner-token-s275"]);
  assert.equal(run.status, EXIT.DESK_HOLDS_SECRET);
  assert.equal(run.json.code, CODE.DESK_HOLDS_EARNED_WORK_SECRET);
});

test("inspectDeskAuthority names the env key and not the secret", () => {
  const result = inspectDeskAuthority({
    env: { EARNED_WORK_OWNER_TOKEN: "dev-owner-token-s275" },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.hits, [{ source: "env", key: "EARNED_WORK_OWNER_TOKEN" }]);
  assert.equal(JSON.stringify(result.hits).includes("dev-owner-token"), false);
});

test("kill: contributor holds payout key", () => {
  const run = runDesk(["browse", "--payout-key", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]);
  assert.equal(run.status, EXIT.CONTRIBUTOR_HOLDS_PAYOUT_KEY, run.stdout);
  assert.equal(run.json.ok, false);
  assert.equal(run.json.killed, true);
  assert.equal(run.json.code, CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY);
});

test("kill: 64-hex destination is treated as a key, not a late address", async () => {
  const desk = createDesk();
  await assert.rejects(
    () =>
      desk.claim({
        taskId: "tsk_open_alpha",
        contributorPublicId: "ctr_walrus",
        payoutDestination: "abababababababababababababababababababababababababababababababab",
      }),
    (error) => error.killed === true && error.code === CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY,
  );
});

test("PAYOUT_KEY in env kills before browse", () => {
  const run = runDesk(["browse"], { env: { PAYOUT_KEY: "0x" + "ab".repeat(32) } });
  assert.equal(run.status, EXIT.CONTRIBUTOR_HOLDS_PAYOUT_KEY);
  assert.equal(run.json.code, CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY);
});

test("holdsPayoutKey flag kills", () => {
  const result = inspectContributorPayoutKey({ contributor: { holdsPayoutKey: true } });
  assert.equal(result.killed, true);
  assert.equal(result.code, CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY);
});

test("empty env is admitted", () => {
  const desk = inspectDeskAuthority({ env: { PATH: "/usr/bin", HOME: "/tmp" } });
  assert.equal(desk.ok, true);
  const contributor = inspectContributorPayoutKey({ env: { PATH: "/usr/bin" } });
  assert.equal(contributor.ok, true);
});

test("thirteen-word English appeal reason is not a seed-phrase kill", async () => {
  const reason = "please reverse the fail verdict on the bound digest for this fixture note";
  assert.equal(reason.split(/\s+/).length, 13);
  assert.equal(looksLikePayoutKeyMaterial(reason), true, "heuristic still flags destinations");
  assert.equal(inspectFieldText(reason).ok, true);
  const desk = createDesk({ env: {} });
  const appeal = await desk.appeal({
    taskId: "tsk_rejected_gamma",
    contributorPublicId: "ctr_gamma",
    reason,
  });
  assert.equal(appeal.result.appeal.status, "filed");
  assert.equal(appeal.result.notAnAccept, true);
});

test("appeal prose mentioning payout-key does not kill the session", async () => {
  const desk = createDesk({ env: {} });
  const appeal = await desk.appeal({
    taskId: "tsk_rejected_gamma",
    contributorPublicId: "ctr_gamma",
    reason: "The bound digest was labelled a payout-key by mistake.",
  });
  assert.equal(appeal.result.appeal.status, "filed");
});

test("a 64-hex appeal reason is still a payout-key kill", async () => {
  const desk = createDesk({ env: {} });
  await assert.rejects(
    () =>
      desk.appeal({
        taskId: "tsk_rejected_gamma",
        contributorPublicId: "ctr_gamma",
        reason: "ab".repeat(32),
      }),
    (error) => error.killed === true && error.code === CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY,
  );
});

test("twelve-word mnemonic as payout destination still kills", async () => {
  const desk = createDesk({ env: {} });
  const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  await assert.rejects(
    () =>
      desk.claim({
        taskId: "tsk_open_alpha",
        contributorPublicId: "ctr_walrus",
        payoutDestination: seed,
      }),
    (error) => error.killed === true && error.code === CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY,
  );
});

test("openAdapter defaults to process.env and refuses a desk-held secret", () => {
  const previous = process.env.EARNED_WORK_OWNER_TOKEN;
  process.env.EARNED_WORK_OWNER_TOKEN = "dev-owner-token-s275";
  try {
    assert.throws(
      () => openAdapter(),
      (error) => error.code === CODE.DESK_HOLDS_EARNED_WORK_SECRET,
    );
  } finally {
    if (previous === undefined) delete process.env.EARNED_WORK_OWNER_TOKEN;
    else process.env.EARNED_WORK_OWNER_TOKEN = previous;
  }
});
