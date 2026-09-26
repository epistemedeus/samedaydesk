import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createEarnedWorkHttpAdapter } from "../src/adapters/earned-work.mjs";
import { ERROR_CODE, OUTCOME } from "../src/constants.mjs";
import { GrantError } from "../src/errors.mjs";
import { classifyHttpSuccess } from "../src/http.mjs";
import { createFixtureEarnedWorkServer } from "./fixture-http.mjs";
import { envWithoutOwner, runCli, tempDir, writeOwnerTokenFile } from "./helpers.mjs";

const PLANTED_OWNER = "dev-owner-token-s275";

test("classifyHttpSuccess: empty or non-object 2xx is unknown, not success", () => {
  assert.throws(
    () => classifyHttpSuccess({ status: 201, text: "", parsed: null }),
    (error) => error instanceof GrantError && error.code === ERROR_CODE.UNKNOWN_OUTCOME && error.outcome === OUTCOME.UNKNOWN,
  );
  assert.throws(
    () => classifyHttpSuccess({ status: 201, text: "[]", parsed: [] }),
    (error) => error instanceof GrantError && error.code === ERROR_CODE.UNKNOWN_OUTCOME,
  );
});

test("HTTP 201 contributor-tokens object without token is unknown", async () => {
  const adapter = createEarnedWorkHttpAdapter({
    baseUrl: "http://127.0.0.1:9",
    fetchImpl: async () =>
      new Response("{}", { status: 201, headers: { "content-type": "application/json" } }),
  });
  await assert.rejects(
    () =>
      adapter.issueContributorToken(
        { contributorPublicId: "fixture-contrib", provenance: "fixture" },
        { ownerToken: PLANTED_OWNER },
      ),
    (error) => error instanceof GrantError && error.code === ERROR_CODE.UNKNOWN_OUTCOME && error.outcome === OUTCOME.UNKNOWN,
  );
});

test("empty 201 on contributor-tokens is unknown, not success", async () => {
  const fixture = createFixtureEarnedWorkServer({
    ownerToken: PLANTED_OWNER,
    emptyGrant201: true,
  });
  const { baseUrl, close, grantRequests } = await fixture.listen();
  try {
    const root = tempDir("csg-empty-grant-");
    const ownerTokenFile = writeOwnerTokenFile(join(root, "owner"), PLANTED_OWNER);
    const outDir = join(root, "grant");
    const issued = await runCli(
      [
        "--role",
        "owner",
        "issue",
        "--base-url",
        baseUrl,
        "--owner-token-file",
        ownerTokenFile,
        "--out-dir",
        outDir,
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(issued.code, 1, issued.stdout);
    assert.equal(issued.json.ok, false);
    assert.equal(issued.json.outcome, OUTCOME.UNKNOWN);
    assert.equal(issued.json.error.code, ERROR_CODE.UNKNOWN_OUTCOME);
    assert.equal(existsSync(join(outDir, "contributor.token")), false);
    assert.equal(grantRequests[0].hasIdempotencyHeader, false);

    const reconcile = await runCli(
      ["--role", "owner", "reconcile", "--out-dir", outDir],
      { env: envWithoutOwner() },
    );
    assert.equal(reconcile.code, 1);
    assert.equal(reconcile.json.outcome, OUTCOME.UNKNOWN);
    assert.equal(reconcile.json.usedOwnerToken, false);
    assert.equal(reconcile.json.grantPosted, false);
    assert.equal(grantRequests.length, 1);

    const retry = await runCli(
      [
        "--role",
        "owner",
        "issue",
        "--base-url",
        baseUrl,
        "--owner-token-file",
        ownerTokenFile,
        "--out-dir",
        outDir,
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(retry.code, 1);
    assert.equal(retry.json.error.code, ERROR_CODE.GRANT_OUT_DIR_NOT_EMPTY);
    assert.equal(grantRequests.length, 1);
  } finally {
    await close();
  }
});

test("owner issue does not send a made-up Idempotency-Key", async () => {
  const fixture = createFixtureEarnedWorkServer({ ownerToken: PLANTED_OWNER });
  const { baseUrl, close, grantRequests } = await fixture.listen();
  try {
    const root = tempDir();
    const ownerTokenFile = writeOwnerTokenFile(join(root, "ot"), PLANTED_OWNER);
    const forbidden = await runCli(
      [
        "--role",
        "owner",
        "issue",
        "--idempotency-key",
        "made-up-grant-key",
        "--out-dir",
        join(root, "g"),
      ],
      { env: envWithoutOwner({ EARNED_WORK_OWNER_TOKEN: PLANTED_OWNER }) },
    );
    assert.equal(forbidden.code, 1);
    assert.equal(forbidden.json.error.code, ERROR_CODE.GRANT_IDEMPOTENCY_HEADER_FORBIDDEN);

    const issued = await runCli(
      [
        "--role",
        "owner",
        "issue",
        "--base-url",
        baseUrl,
        "--owner-token-file",
        ownerTokenFile,
        "--out-dir",
        join(root, "grant"),
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(issued.code, 0, issued.stdout);
    assert.equal(grantRequests.length, 1);
    assert.equal(grantRequests[0].hasIdempotencyHeader, false);
    assert.equal(grantRequests[0].idempotencyKey, null);
  } finally {
    await close();
  }
});

test("non-idempotent grant reconciles from the token file without owner credentials", async () => {
  const fixture = createFixtureEarnedWorkServer({ ownerToken: PLANTED_OWNER });
  const { baseUrl, close, grantRequests } = await fixture.listen();
  try {
    const root = tempDir();
    const ownerTokenFile = writeOwnerTokenFile(join(root, "ot"), PLANTED_OWNER);
    const outDir = join(root, "grant");
    const issued = await runCli(
      [
        "--role",
        "owner",
        "issue",
        "--base-url",
        baseUrl,
        "--owner-token-file",
        ownerTokenFile,
        "--out-dir",
        outDir,
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(issued.code, 0, issued.stdout);
    const reconciled = await runCli(["--role", "owner", "reconcile", "--out-dir", outDir], {
      env: envWithoutOwner(),
    });
    assert.equal(reconciled.code, 0, reconciled.stdout);
    assert.equal(reconciled.json.ok, true);
    assert.equal(reconciled.json.outcome, OUTCOME.SUCCESS);
    assert.equal(reconciled.json.usedOwnerToken, false);
    assert.equal(reconciled.json.grantPosted, false);
    assert.equal(reconciled.json.tokenHash, issued.json.tokenHash);
    assert.equal(grantRequests.length, 1);
    assert.equal(JSON.stringify(reconciled.json).includes(PLANTED_OWNER), false);
  } finally {
    await close();
  }
});

test("empty 201 on claim is unknown, then contributor reconcile replays the stored key", async () => {
  const planted = "ew_ctr_EMPTY_CLAIM_BEARER_XXXXXX";
  const fixture = createFixtureEarnedWorkServer({
    ownerToken: PLANTED_OWNER,
    plantedContributorToken: planted,
    emptyClaim201: true,
  });
  const { baseUrl, close } = await fixture.listen();
  try {
    const root = tempDir("csg-empty-claim-");
    const ownerTokenFile = writeOwnerTokenFile(join(root, "owner"), PLANTED_OWNER);
    const outDir = join(root, "owner-out");
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
    const stateDir = join(root, "contrib");
    const claimed = await runCli(
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
        stateDir,
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(claimed.code, 1, claimed.stdout);
    assert.equal(claimed.json.ok, false);
    assert.equal(claimed.json.outcome, OUTCOME.UNKNOWN);
    assert.equal(claimed.json.error.code, ERROR_CODE.UNKNOWN_OUTCOME);
    const pending = JSON.parse(readFileSync(join(stateDir, "contributor-state.json"), "utf8"));
    assert.equal(pending.outcome, OUTCOME.UNKNOWN);
    assert.equal(typeof pending.claimIdempotencyKey, "string");
    assert.ok(pending.claimIdempotencyKey.length >= 8);

    const withOwner = await runCli(
      [
        "--role",
        "contributor",
        "reconcile",
        "--base-url",
        baseUrl,
        "--token-file",
        owner.json.tokenFile,
        "--task-id",
        owner.json.taskId,
        "--terms-version",
        owner.json.termsVersion,
        "--state-dir",
        stateDir,
      ],
      { env: { ...envWithoutOwner(), EARNED_WORK_OWNER_TOKEN: PLANTED_OWNER } },
    );
    assert.equal(withOwner.code, 1);
    assert.equal(withOwner.json.error.code, ERROR_CODE.OWNER_TOKEN_IN_CONTRIBUTOR_PROCESS);

    const reconciled = await runCli(
      [
        "--role",
        "contributor",
        "reconcile",
        "--base-url",
        baseUrl,
        "--token-file",
        owner.json.tokenFile,
        "--task-id",
        owner.json.taskId,
        "--terms-version",
        owner.json.termsVersion,
        "--state-dir",
        stateDir,
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(reconciled.code, 0, reconciled.stdout);
    assert.equal(reconciled.json.ok, true);
    assert.equal(reconciled.json.reservationStatus, "active");
    assert.equal(reconciled.json.usedOwnerToken, false);
    assert.equal(reconciled.json.replayed, true);
    assert.equal(reconciled.stdout.includes(planted), false);
  } finally {
    await close();
  }
});

test("help names empty-201 unknown and grant reconcile", () => {
  return import("../src/cli.mjs").then(({ helpRecord }) => {
    const help = helpRecord();
    assert.ok(help.grantRules.some((rule) => /empty body is unknown/i.test(rule)));
    assert.ok(help.ownerCommands.includes("reconcile"));
    assert.ok(help.contributorCommands.includes("reconcile"));
  });
});
