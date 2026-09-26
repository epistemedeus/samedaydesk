import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { hashToken } from "../src/hash.mjs";
import { TERMS_VERSION_RE } from "../src/constants.mjs";
import { createFixtureEarnedWorkServer } from "./fixture-http.mjs";
import { envWithoutOwner, runCli, tempDir, writeOwnerTokenFile } from "./helpers.mjs";

test("fixture journey: owner issues token, contributor claims reserved task (evidenceClass=fixture)", async () => {
  const planted = "ew_ctr_FIXTURE_JOURNEY_BEARER_XXXX";
  const ownerToken = "dev-owner-token-s275";
  const fixture = createFixtureEarnedWorkServer({
    ownerToken,
    plantedContributorToken: planted,
  });
  const { baseUrl, close } = await fixture.listen();
  try {
    const root = tempDir("csg-journey-");
    const ownerTokenFile = writeOwnerTokenFile(join(root, "owner"), ownerToken);
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
    assert.equal(owner.json.ok, true);
    assert.match(owner.json.termsVersion, TERMS_VERSION_RE);
    assert.ok(owner.json.tokenFile);
    assert.equal(owner.json.plaintextInState, false);

    const contrib = await runCli(
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
        join(root, "contrib"),
      ],
      { env: envWithoutOwner() },
    );
    assert.equal(contrib.code, 0, contrib.stdout);
    assert.equal(contrib.json.ok, true);
    assert.equal(contrib.json.reservationStatus, "active");
    assert.equal(contrib.json.tokenHash, hashToken(planted));

    const envDump = JSON.parse(readFileSync(join(root, "contrib/env-dump.json"), "utf8"));
    const state = JSON.parse(readFileSync(join(root, "contrib/contributor-state.json"), "utf8"));
    const blob = JSON.stringify({ envDump, state, stdout: contrib.stdout });
    assert.equal(blob.includes(planted), false);
    assert.equal(blob.includes(ownerToken), false);
    assert.equal(envDump.ownerTokenEnvPresent, false);
    assert.equal(state.plaintextInState, false);
  } finally {
    await close();
  }
});
