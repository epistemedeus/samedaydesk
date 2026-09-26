import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ERROR_CODE, PINS, TERMS_VERSION_RE, WAVE5_ID } from "../src/constants.mjs";
import { helpRecord, parseCli } from "../src/cli.mjs";
import { hashToken } from "../src/hash.mjs";
import { parseClaimTermsVersion } from "../src/terms-version.mjs";
import { GrantError } from "../src/errors.mjs";
import { PACK_ROOT } from "./helpers.mjs";

function gitBlobSha(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

test("help names split-process public interface", () => {
  const help = helpRecord();
  assert.equal(help.ok, true);
  assert.deepEqual(help.roles, ["owner", "contributor"]);
  assert.ok(help.ownerCommands.includes("issue"));
  assert.ok(help.ownerCommands.includes("reconcile"));
  assert.ok(help.contributorCommands.includes("claim"));
  assert.ok(help.contributorCommands.includes("reconcile"));
  assert.equal(help.wave5, WAVE5_ID);
  assert.equal(help.authoritativeRuntime.sourceSha, PINS.inTree.sourceSha);
  assert.equal(help.authoritativeRuntime.entry, "services/earned-work/dist/index.js");
  assert.equal(PINS.e01.sha, "c4048401fa42e1272e61edf983afbf39a3e04555");
  assert.equal(PINS.e01.tree, "1a5dad7755fb81c75564dbc9d3667ab16db9bbcd");
  assert.equal(PINS.i01.sha, "346bbd3cbe6943a83b2077c455174d74b7a493ad");
  assert.equal(help.nonsettling, true);
});

test("PIN.json matches the E01 pin SHA; I01 OpenAPI remains comparison-only", () => {
  const pin = JSON.parse(readFileSync(join(PACK_ROOT, "pins/PIN.json"), "utf8"));
  assert.equal(pin.authoritativeRuntime.sha, PINS.e01.sha);
  assert.equal(pin.authoritativeRuntime.tree, PINS.e01.tree);
  assert.equal(pin.inTreeKernel.sourceSha, PINS.inTree.sourceSha);
  assert.equal(pin.inTreeKernel.entry, PINS.inTree.entry);
  assert.equal(pin.authoritativeRuntime.idempotencyKey, undefined);
  assert.equal(pin.authoritativeRuntime.contributorTokens.idempotencyKey, false);
  const bytes = readFileSync(join(PACK_ROOT, "pins/i01-earned-work.openapi.json"));
  assert.equal(gitBlobSha(bytes), pin.authoritativeRuntime.gitBlobSha);
  const e02 = JSON.parse(readFileSync(join(PACK_ROOT, "pins/e02-createContributorToken.json"), "utf8"));
  assert.equal(e02.sha, PINS.e02.sha);
  assert.equal(e02.operation.idempotency, false);
});

test("parseCli --role owner issue", () => {
  const parsed = parseCli(["--role", "owner", "issue", "--out-dir", "./grant"]);
  assert.equal(parsed.role, "owner");
  assert.equal(parsed.command, "issue");
});

test("parseCli accepts --task-file on prepare-and-issue", () => {
  const parsed = parseCli([
    "--role",
    "owner",
    "prepare-and-issue",
    "--out-dir",
    "./owner-out",
    "--task-file",
    "./fixtures/i01-journey-task.json",
  ]);
  assert.equal(parsed.role, "owner");
  assert.equal(parsed.command, "prepare-and-issue");
  assert.equal(parsed.flags["task-file"], "./fixtures/i01-journey-task.json");
});

test("I01 pin OpenAPI documents POST /v1/contributor-tokens", () => {
  const openapi = JSON.parse(
    readFileSync(join(PACK_ROOT, "pins/i01-earned-work.openapi.json"), "utf8"),
  );
  const path = openapi.paths["/v1/contributor-tokens"].post;
  assert.deepEqual(path.security, [{ OwnerBearer: [] }]);
  assert.match(path.summary, /Token plaintext returned once/);
  assert.equal(path.parameters, undefined);
  const headerParams = (path.parameters || []).filter((p) => p.in === "header" || p.$ref);
  assert.equal(headerParams.length, 0);
  assert.equal(openapi.components.schemas.TermsVersion.pattern, "^sha256:[0-9a-f]{64}$");
  const claim = openapi.paths["/v1/tasks/{taskId}/claims"].post;
  assert.ok(JSON.stringify(claim.parameters).includes("IdempotencyKey"));
});

test("original F01 OpenAPI is comparison-only and lacks TermsVersion hash schema", () => {
  const f01 = JSON.parse(readFileSync(join(PACK_ROOT, "pins/f01-s275.openapi.json"), "utf8"));
  assert.equal(f01.components.schemas.TermsVersion, undefined);
  assert.ok(f01.paths["/v1/contributor-tokens"].post);
});

test("hashToken matches I01 utf8 SHA-256, not F07 prefix", () => {
  const token = "ew_ctr_example_token_value";
  assert.equal(hashToken(token).length, 64);
  const f07style = createHash("sha256").update(`earned-work-token:${token}`, "utf8").digest("hex");
  assert.notEqual(hashToken(token), f07style);
  assert.equal(hashToken(token), createHash("sha256").update(token, "utf8").digest("hex"));
});

test("parseClaimTermsVersion rejects original F01 integer residual", () => {
  assert.throws(
    () => parseClaimTermsVersion(1),
    (error) => error instanceof GrantError && error.code === ERROR_CODE.INTEGER_TERMS_VERSION,
  );
  assert.throws(
    () => parseClaimTermsVersion("1"),
    (error) => error instanceof GrantError && error.code === ERROR_CODE.INTEGER_TERMS_VERSION,
  );
  const hash = "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f";
  assert.match(hash, TERMS_VERSION_RE);
  assert.equal(parseClaimTermsVersion(hash), hash);
});
