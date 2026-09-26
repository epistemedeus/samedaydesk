import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ERROR_CODE } from "../src/constants.mjs";
import { hashToken } from "../src/hash.mjs";
import { createFixtureEarnedWorkServer } from "./fixture-http.mjs";
import { envWithoutOwner, runCli, tempDir, writeOwnerTokenFile } from "./helpers.mjs";

const PLANTED_OWNER = "dev-owner-token-s275";
const PLANTED_CONTRIB = "ew_ctr_PLANTED_CONTRIBUTOR_BEARER_VALUE";

test("contributor process started with EARNED_WORK_OWNER_TOKEN set is rejected", async () => {
  const dir = tempDir();
  const result = await runCli(
    [
      "--role",
      "contributor",
      "claim",
      "--base-url",
      "http://127.0.0.1:9",
      "--token-file",
      join(dir, "missing.token"),
      "--task-id",
      "tsk_x",
      "--terms-version",
      "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f",
      "--state-dir",
      join(dir, "state"),
    ],
    {
      env: {
        ...process.env,
        EARNED_WORK_OWNER_TOKEN: PLANTED_OWNER,
      },
    },
  );
  assert.equal(result.code, 1);
  assert.equal(result.json.error.code, ERROR_CODE.OWNER_TOKEN_IN_CONTRIBUTOR_PROCESS);
  assert.equal(result.stdout.includes(PLANTED_OWNER), false);
  assert.equal(result.stderr.includes(PLANTED_OWNER), false);
});

test("token plaintext in usability/state logs is rejected", async () => {
  const fixture = createFixtureEarnedWorkServer({
    ownerToken: PLANTED_OWNER,
    plantedContributorToken: PLANTED_CONTRIB,
  });
  const { baseUrl, close } = await fixture.listen();
  try {
    const root = tempDir();
    const ownerTokenFile = writeOwnerTokenFile(dirWith(root, "owner-secret"), PLANTED_OWNER);
    const outDir = join(root, "grant");
    const owner = await runCli(
      [
        "--role",
        "owner",
        "prepare-and-issue",
        "--base-url",
        baseUrl,
        "--owner-token-file",
        ownerTokenFile,
        "--out-dir",
        outDir,
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(owner.code, 0, owner.stdout);
    assert.equal(owner.stdout.includes(PLANTED_CONTRIB), false);
    assert.equal(owner.stdout.includes(PLANTED_OWNER), false);
    const grantDir = join(outDir, "grant");
    const ownerState = JSON.parse(readFileSync(join(grantDir, "owner-state.json"), "utf8"));
    const usability = JSON.parse(readFileSync(join(grantDir, "usability.json"), "utf8"));
    assert.equal(ownerState.plaintextInState, false);
    assert.equal(ownerState.tokenHash, hashToken(PLANTED_CONTRIB));
    assert.equal(JSON.stringify(ownerState).includes(PLANTED_CONTRIB), false);
    assert.equal(JSON.stringify(usability).includes(PLANTED_CONTRIB), false);

    const contribStateDir = join(root, "contributor");
    const claim = await runCli(
      [
        "--role",
        "contributor",
        "claim",
        "--base-url",
        baseUrl,
        "--token-file",
        owner.json.tokenFile,
        "--task-id",
        owner.json.taskId,
        "--terms-version",
        owner.json.termsVersion,
        "--state-dir",
        contribStateDir,
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(claim.code, 0, claim.stdout);
    assert.equal(claim.stdout.includes(PLANTED_CONTRIB), false);
    const contribState = JSON.parse(readFileSync(join(contribStateDir, "contributor-state.json"), "utf8"));
    const contribUsability = JSON.parse(readFileSync(join(contribStateDir, "usability.json"), "utf8"));
    const envDump = JSON.parse(readFileSync(join(contribStateDir, "env-dump.json"), "utf8"));
    assert.equal(contribState.plaintextInState, false);
    assert.equal(JSON.stringify(contribState).includes(PLANTED_CONTRIB), false);
    assert.equal(JSON.stringify(contribUsability).includes(PLANTED_CONTRIB), false);
    assert.equal(JSON.stringify(envDump).includes(PLANTED_CONTRIB), false);
    assert.equal(JSON.stringify(envDump).includes(PLANTED_OWNER), false);
    assert.equal(contribState.tokenHash, hashToken(PLANTED_CONTRIB));
  } finally {
    await close();
  }
});

function dirWith(root, name) {
  return join(root, name);
}

test("retrying grant issuance as automatic contributor retry is rejected", async () => {
  const dir = tempDir();
  const asContributor = await runCli(
    ["--role", "contributor", "issue", "--out-dir", join(dir, "grant")],
    { env: envWithoutOwner() },
  );
  assert.equal(asContributor.code, 1);
  assert.equal(asContributor.json.error.code, ERROR_CODE.OWNER_ONLY_GRANT);

  const autoRetry = await runCli(
    ["--role", "owner", "issue", "--auto-retry-unknown-grant", "--out-dir", join(dir, "retry")],
    { env: envWithoutOwner({ EARNED_WORK_OWNER_TOKEN: PLANTED_OWNER }) },
  );
  assert.equal(autoRetry.code, 1);
  assert.equal(autoRetry.json.error.code, ERROR_CODE.UNKNOWN_GRANT_NO_AUTO_RETRY);

  const fixture = createFixtureEarnedWorkServer({ ownerToken: PLANTED_OWNER });
  const { baseUrl, close } = await fixture.listen();
  try {
    const ownerTokenFile = writeOwnerTokenFile(join(dir, "ot"), PLANTED_OWNER);
    const firstDir = join(dir, "first-grant");
    const first = await runCli(
      [
        "--role",
        "owner",
        "issue",
        "--base-url",
        baseUrl,
        "--owner-token-file",
        ownerTokenFile,
        "--out-dir",
        firstDir,
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(first.code, 0, first.stdout);
    const replay = await runCli(
      [
        "--role",
        "owner",
        "issue",
        "--base-url",
        baseUrl,
        "--owner-token-file",
        ownerTokenFile,
        "--out-dir",
        firstDir,
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(replay.code, 1);
    assert.equal(replay.json.error.code, ERROR_CODE.GRANT_OUT_DIR_NOT_EMPTY);
  } finally {
    await close();
  }
});
