import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { before } from "node:test";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packRoot, "../..");
const bin = join(packRoot, "bin/lifecycle.mjs");
const fixturePath = join(packRoot, "fixtures/lifecycle-caller.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

before(() => {
  const materialized = spawnSync(process.execPath, ["scripts/materialize-pins.mjs"], {
    cwd: join(repoRoot, "packs/dispute-experience"),
    encoding: "utf8",
  });
  assert.equal(materialized.status, 0, materialized.stderr || materialized.stdout);
});

function run(value, { cwd = "/tmp", env = process.env, inputPath } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "lifecycle-case-"));
  const out = join(dir, "out");
  const input = inputPath ?? join(dir, "input.json");
  if (!inputPath) writeFileSync(input, JSON.stringify(value ?? fixture));
  const result = spawnSync(process.execPath, [bin, "--input", input, "--out", out], {
    cwd,
    env: { ...env, NODE_NO_WARNINGS: "1" },
    encoding: "utf8",
  });
  return { dir, out, result };
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function assertRefusal(value, code, extra = {}) {
  const { dir, out, result } = run(value, extra);
  try {
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(out), false);
    const body = JSON.parse(result.stderr);
    assert.equal(body.ok, false);
    assert.equal(body.code, code);
    assert.equal(body.paymentAuthority, false);
    assert.equal(body.entitlement, false);
    assert.equal(body.paid, false);
    assert.equal(body.payout, null);
    assert.equal(body.deployment, false);
    return body;
  } finally {
    cleanup(dir);
  }
}

test("help exits 0 and does not write a receipt", () => {
  const result = spawnSync(process.execPath, [bin, "--help"], {
    cwd: "/tmp",
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /not entitlement/);
  assert.equal(result.stdout.includes("dev-owner-token"), false);
});

test("cold cwd happy path inspects terms, grants, submits, and keeps dispute separate", () => {
  const { dir, out, result } = run(fixture, { cwd: "/tmp", inputPath: fixturePath });
  try {
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    const file = JSON.parse(readFileSync(join(out, "receipt.json"), "utf8"));
    assert.deepEqual(file, receipt);
    assert.equal(receipt.paymentAuthority, false);
    assert.equal(receipt.entitlement, false);
    assert.equal(receipt.earnedMoney, false);
    assert.equal(receipt.paid, false);
    assert.equal(receipt.settled, false);
    assert.equal(receipt.payout, null);
    assert.equal(receipt.deployment, false);
    assert.equal(receipt.kernelContacted, false);
    assert.equal(receipt.kernel.accepted, false);
    assert.equal(receipt.kernel.pr, 109);
    assert.equal(receipt.kernel.sha, "c4048401fa42e1272e61edf983afbf39a3e04555");
    assert.equal(receipt.kernel.contacted, false);
    assert.equal(receipt.terms.termsVersion.startsWith("sha256:"), true);
    assert.equal(typeof receipt.terms.reward.amount, "string");
    assert.equal(receipt.terms.artifactFetched, false);
    assert.equal(receipt.termsLifecycle["earned-survives-cancel"], true);
    assert.equal(receipt.termsLifecycle.meansEntitlement, false);
    assert.equal(receipt.termsLifecycle.meansEarnedMoney, false);
    assert.equal(receipt.submission.earned, false);
    assert.equal(receipt.submission.accepted, false);
    assert.equal(receipt.submission.termsVersion, receipt.terms.termsVersion);
    assert.equal(receipt.claim.claimedTermsVersion, receipt.terms.termsVersion);
    assert.equal(receipt.claim.evidenceClass, "fixture");
    assert.notEqual(receipt.dispute.taskId, receipt.terms.taskId);
    assert.equal(receipt.dispute.reviewsSubmittedResult, false);
    assert.equal(receipt.dispute.finalDecision, "affirmed");
    assert.equal(receipt.dispute.financials.paid, false);
    assert.equal(receipt.dispute.financials.settled, false);
    assert.equal(receipt.dispute.owedInferred, false);
    assert.equal(receipt.grant.plaintextInReceipt, false);
    assert.equal(receipt.grant.kernelExpiresAt, null);
    assert.equal(receipt.grant.expirySource, "caller-policy");
    const tokenPath = join(out, receipt.grant.tokenFile);
    const token = readFileSync(tokenPath, "utf8").trim();
    assert.equal(token.length > 0, true);
    assert.equal((statSync(tokenPath).mode & 0o077) === 0, true);
    const published = `${result.stdout}\n${readFileSync(join(out, "receipt.json"), "utf8")}`;
    assert.equal(published.includes(token), false);
    assert.equal(published.includes("fixture_owner_"), false);
    assert.equal(result.stderr.includes(token), false);
  } finally {
    cleanup(dir);
  }
});

test("overturned dispute stays unpaid and separate", () => {
  const { dir, out, result } = run({ ...fixture, disputeResolution: "overturned" }, { cwd: "/tmp" });
  try {
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(out, "receipt.json"), "utf8"));
    assert.equal(receipt.dispute.finalDecision, "overturned");
    assert.equal(receipt.dispute.financials.paid, false);
    assert.equal(receipt.submission.earned, false);
    assert.equal(receipt.paymentAuthority, false);
  } finally {
    cleanup(dir);
  }
});

test("grant expiry writes nothing", () => {
  assertRefusal({ ...fixture, grant: { ttlSeconds: 0, revoked: false } }, "grant_expired");
});

test("grant revocation writes nothing", () => {
  assertRefusal({ ...fixture, grant: { ttlSeconds: 3600, revoked: true } }, "grant_revoked");
});

test("double earning is refused and not persisted", () => {
  const body = assertRefusal({ ...fixture, probe: "double-earn" }, "double_earn");
  assert.equal(body.details.persisted, false);
  assert.equal(body.details.entitlement, false);
  assert.equal(body.details.paymentAuthority, false);
});

test("a different principal cannot submit", () => {
  const body = assertRefusal({ ...fixture, submitAs: "ctr_someone_else" }, "different_principal");
  assert.equal(body.details.submitAs, "ctr_someone_else");
});

test("a changed terms version is refused", () => {
  assertRefusal({ ...fixture, submitTermsVersion: `sha256:${"ab".repeat(32)}` }, "terms_changed");
});

test("untrusted origin is refused before any request", () => {
  const body = assertRefusal(
    { ...fixture, kernelOrigin: "http://169.254.169.254/latest/meta-data" },
    "untrusted_origin",
  );
  assert.equal(body.details.requests, 0);
});

test("public http origin and embedded credentials are refused", () => {
  assertRefusal({ ...fixture, kernelOrigin: "http://example.com" }, "untrusted_origin");
  assertRefusal({ ...fixture, kernelOrigin: "https://user:pass@example.com/" }, "untrusted_origin");
});

test("redirects are refused and a loopback origin is still not contacted", () => {
  const redirected = assertRefusal(
    { ...fixture, kernelOrigin: "http://127.0.0.1:9", followRedirects: true },
    "redirect_refused",
  );
  assert.equal(redirected.details.requests, 0);
  const trusted = assertRefusal({ ...fixture, kernelOrigin: "http://127.0.0.1:9/" }, "missing_kernel_acceptance");
  assert.equal(trusted.details.requests, 0);
  assert.equal(trusted.details.accepted, false);
  assert.equal(trusted.details.sha, "c4048401fa42e1272e61edf983afbf39a3e04555");
});

test("https origin is syntactically trusted and still not contacted", () => {
  const body = assertRefusal({ ...fixture, kernelOrigin: "https://example.com" }, "missing_kernel_acceptance");
  assert.equal(body.details.requests, 0);
  assert.equal(body.details.contacted, false);
});

test("ambient earned-work secret is refused and is not echoed", () => {
  const secret = "SENTINEL_OWNER_TOKEN_SHOULD_NOT_LEAK";
  const { dir, out, result } = run(fixture, {
    cwd: "/tmp",
    env: { ...process.env, EARNED_WORK_OWNER_TOKEN: secret },
  });
  try {
    assert.equal(result.status, 2, result.stderr);
    assert.equal(existsSync(out), false);
    assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
    assert.equal(JSON.parse(result.stderr).code, "desk_holds_earned_work_secret");
  } finally {
    cleanup(dir);
  }
});

test("payout key kills before a grant", () => {
  assertRefusal({ ...fixture, payoutKey: "a".repeat(64) }, "contributor_holds_payout_key");
});

test("requesting payment authority is refused", () => {
  assertRefusal({ ...fixture, paymentAuthority: true }, "no_payment_authority");
  assertRefusal({ ...fixture, paid: true }, "no_payment_authority");
  assertRefusal({ ...fixture, deploy: true }, "no_payment_authority");
});

test("seeded failure: forged paid=false, settled=false, transfer=null writes nothing", () => {
  const forged = { ...fixture, paid: false, settled: false, transfer: null };
  const body = assertRefusal(forged, "forged_settlement_evidence");
  assert.deepEqual(body.details.fields, ["paid", "settled", "transfer"]);
  assert.equal(body.details.persisted, false);
  assert.equal(body.details.requests, 0);
  assert.equal(body.settled, false);
  assert.equal(body.payout, null);

  const paidOnly = assertRefusal({ ...fixture, paid: false }, "forged_settlement_evidence");
  assert.deepEqual(paidOnly.details.fields, ["paid"]);
  assert.equal(paidOnly.details.persisted, false);

  const settledOnly = assertRefusal({ ...fixture, settled: false, transfer: null }, "forged_settlement_evidence");
  assert.deepEqual(settledOnly.details.fields, ["settled", "transfer"]);
  assert.equal(settledOnly.details.persisted, false);
});

test("malformed JSON, URL input, integer terms, and a bad digest write nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "lifecycle-bad-"));
  const badJson = join(dir, "bad.json");
  const out = join(dir, "out");
  writeFileSync(badJson, "{");
  const parsed = spawnSync(process.execPath, [bin, "--input", badJson, "--out", out], {
    cwd: "/tmp",
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(parsed.status, 2);
  assert.equal(existsSync(out), false);
  assert.equal(JSON.parse(parsed.stderr).code, "malformed_input");

  const url = spawnSync(process.execPath, [bin, "--input", "https://example.com/caller.json", "--out", out], {
    cwd: "/tmp",
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(url.status, 2);
  assert.equal(existsSync(out), false);
  assert.match(url.stderr, /refusing to fetch a URL/);
  cleanup(dir);

  assertRefusal({ ...fixture, submitTermsVersion: 1 }, "malformed_input");
  assertRefusal({ ...fixture, result: { artifactDigest: "nope", note: "too short" } }, "malformed_input");
  assertRefusal({ ...fixture, synthetic: false }, "malformed_input");
  assertRefusal({ ...fixture, provenance: "production" }, "malformed_input");
});

test("missing requester-decision pin is named and not invented", () => {
  const body = assertRefusal({ ...fixture, decisionRoot: null }, "missing_dependency");
  assert.equal(body.details.pin, "0c1440fe46f8fe1fa744b9e67c82b26d702728b7");
  assert.equal(body.details.pr, 57);
  assert.equal(body.details.openHead, "7449e676925ae834c4a7d2dd4d6d724b87cbd42b");
  assert.equal(body.details.openHeadMatchesPin, false);
  assert.equal(body.details.copiedIntoProductTree, false);
  assert.equal(body.details.onMain, false);
});

test("unknown flag and a missing file write nothing", () => {
  const unknown = spawnSync(process.execPath, [bin, "--inpt", fixturePath], {
    cwd: "/tmp",
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(unknown.status, 2);
  assert.equal(unknown.stdout, "");
  assert.equal(JSON.parse(unknown.stderr).code, "malformed_input");

  const missing = spawnSync(process.execPath, [bin, "--input", "/tmp/does-not-exist-lifecycle.json", "--out", "/tmp/lifecycle-should-not-exist"], {
    cwd: "/tmp",
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  assert.equal(missing.status, 2);
  assert.equal(existsSync("/tmp/lifecycle-should-not-exist"), false);
});
