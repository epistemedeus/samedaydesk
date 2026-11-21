import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// The canonical acquisition path is the installed 0.3.1 client whose bytes
// match its descriptor. A different byte identity is not that version.
// Signup is not success without the descriptor. Historical-authority custody
// and the financial sources stay unchanged.

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const installed = join(repo, "server/scripts/fixtures/h142010-cold-requester-0.3.1.mjs");
const oldClient = join(repo, "vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs");
const descriptorPath = join(repo, "docs/machine-promotion/evidence/private-successor-descriptor.json");
const stub = join(here, "profile-stub.mjs");
const historical = join(repo, "vendor/hosted-wallet-market/test/historical-authority.test.mjs");
const ORIGIN = "https://127.0.0.1:9";
const INSTALLED_SHA = "accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9";
const OLD_SHA = "38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4";
const DESCRIPTOR_SHA = "2edea980c57909e8715cac1c899c1e4886f418614a71a79e50df113e4bd28d25";
const MONEY_SHA = "059ac16fc3f4a8855bfa4e9d0c5c14840586d648247f66f5c6b0b5997396e54d";
const SEED_SHA = "ecf605d362916ba1e00f718c4b5167d8945d514820c78f104d7435a4ff355c4c";
const HISTORICAL_SHA = "35a7a975339b38915aeba7c6c8edf582f11a82e25f94d884c3c92fa1779b5d81";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(client, args, { stubbed = false, log } = {}) {
  const nodeArgs = stubbed ? ["--import", stub, client, ...args] : [client, ...args];
  const env = { ...process.env };
  if (stubbed) {
    env.H154540_DESCRIPTOR = descriptorPath;
    env.H154540_HTTP_LOG = log;
  }
  const result = spawnSync(process.execPath, nodeArgs, { encoding: "utf8", env, timeout: 8000 });
  let body = {};
  try { body = JSON.parse(result.stdout || "{}"); } catch { body = { parse: false, stdout: result.stdout }; }
  return { status: result.status, body, stderr: result.stderr };
}

function requests(log) {
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function acquireArgs(descriptorSha) {
  const pinned = JSON.parse(readFileSync(descriptorPath, "utf8"));
  return [
    "--origin", ORIGIN,
    "--descriptor", descriptorPath,
    "--descriptor-sha256", descriptorSha,
    "--source-repository", pinned.source.repository,
    "--source-commit", pinned.source.commit,
    "--source-path", pinned.source.path,
  ];
}

test("installed client bytes, old client bytes and financial sources stay put", () => {
  const installedBytes = readFileSync(installed);
  assert.equal(installedBytes.length, 30187);
  assert.equal(sha256(installed), INSTALLED_SHA);
  assert.equal(sha256(oldClient), OLD_SHA);
  assert.equal(sha256(descriptorPath), DESCRIPTOR_SHA);
  assert.equal(sha256(join(repo, "vendor/hosted-wallet-market/src/machine-money.mjs")), MONEY_SHA);
  assert.equal(sha256(join(repo, "vendor/hosted-wallet-market/src/seed.mjs")), SEED_SHA);
  const authority = readFileSync(historical, "utf8");
  assert.equal(sha256(historical), HISTORICAL_SHA);
  assert.match(authority, /fixturePath\('H103010_OPERATOR_ENTRY', \{ file: true \}\)/);
  assert.match(authority, /fixturePath\('H103010_HISTORICAL_CACHE', \{ file: true \}\)/);
  assert.equal(authority.includes("skip"), false);
  const descriptor = JSON.parse(readFileSync(descriptorPath, "utf8"));
  assert.equal(descriptor.version, "0.3.1");
  assert.equal(descriptor.sha256, INSTALLED_SHA);
  assert.equal(descriptor.bytes, 30187);
  assert.equal(descriptor.publicationStatus, "private_unreleased");
  assert.equal(descriptor.hostedAcquisitionVerified, false);
});

test("acquire without a descriptor is a refusal and opens no account", () => {
  const dir = mkdtempSync(join(tmpdir(), "h154540-acquire-"));
  const log = join(dir, "http.jsonl");
  writeFileSync(log, "");
  const out = run(installed, ["acquire", "--origin", ORIGIN], { stubbed: true, log });
  assert.equal(out.status, 1, JSON.stringify(out.body));
  assert.equal(out.body.ok, false);
  assert.equal(out.body.code, "acquisition_required");
  assert.equal(out.body.accountCreated, undefined);
  assert.equal(requests(log).length, 0);
});

test("the installed client acquires against its own descriptor and readback identity", () => {
  const dir = mkdtempSync(join(tmpdir(), "h154540-acquire-"));
  const log = join(dir, "http.jsonl");
  writeFileSync(log, "");
  const descriptorSha = sha256(descriptorPath);
  const out = run(installed, ["acquire", ...acquireArgs(descriptorSha)], { stubbed: true, log });
  assert.equal(out.status, 0, JSON.stringify(out.body));
  assert.equal(out.body.ok, true);
  assert.equal(out.body.accountCreated, false);
  assert.equal(out.body.version, "0.3.1");
  assert.equal(out.body.clientSha256, INSTALLED_SHA);
  assert.equal(out.body.money, "unfunded");
  assert.equal(out.body.participation, "voluntary-artifact-v1");
  const sent = requests(log);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, "GET");
  assert.equal(sent[0].path, "/v1/market/profile");
});

test("a different byte identity labeled 0.3.1 does not acquire", () => {
  const dir = mkdtempSync(join(tmpdir(), "h154540-acquire-"));
  const log = join(dir, "http.jsonl");
  writeFileSync(log, "");
  const copy = join(dir, "cold-requester-0.3.1.mjs");
  writeFileSync(copy, readFileSync(installed, "utf8").replace("HTTPS client", "HTTPX client"));
  assert.notEqual(sha256(copy), INSTALLED_SHA);
  const out = run(copy, ["acquire", ...acquireArgs(sha256(descriptorPath))], { stubbed: true, log });
  assert.equal(out.status, 1, JSON.stringify(out.body));
  assert.equal(out.body.code, "acquisition_client_mismatch");
  assert.equal(out.body.accountCreated, undefined);
  assert.equal(requests(log).length, 0);
});

test("signup without a descriptor does not create an account", () => {
  const dir = mkdtempSync(join(tmpdir(), "h154540-acquire-"));
  const log = join(dir, "http.jsonl");
  writeFileSync(log, "");
  const secret = join(dir, "requester.json");
  const out = run(installed, [
    "signup", "--origin", ORIGIN, "--secret-file", secret, "--display-name", "Unqualified", "--role", "requester",
  ], { stubbed: true, log });
  assert.equal(out.status, 1, JSON.stringify(out.body));
  assert.equal(out.body.code, "acquisition_required");
  assert.equal(existsSync(secret), false);
  assert.equal(requests(log).length, 0);
});

test("the 0.3.0 client refuses the 0.3.1 descriptor and fund stays unpaid", () => {
  const dir = mkdtempSync(join(tmpdir(), "h154540-acquire-"));
  const log = join(dir, "http.jsonl");
  writeFileSync(log, "");
  const old = run(oldClient, ["acquire", ...acquireArgs(sha256(descriptorPath))], { stubbed: true, log });
  assert.equal(old.status, 1, JSON.stringify(old.body));
  assert.equal(old.body.code, "acquisition_refused");
  assert.equal(requests(log).length, 0);
  const version = run(oldClient, ["version"]);
  assert.equal(version.status, 0, JSON.stringify(version.body));
  assert.equal(version.body.version, "0.3.0");

  const secret = join(dir, "requester.json");
  writeFileSync(secret, `${JSON.stringify({
    schema: "ae.password-file.v1",
    origin: ORIGIN,
    password: "0123456789abcdef",
    displayName: "Fixture",
    role: "requester",
    taskId: "market-" + "ab".repeat(32),
  })}\n`, { mode: 0o600 });
  const fund = run(installed, ["fund", "--origin", ORIGIN, "--secret-file", secret], { stubbed: true, log });
  assert.equal(fund.body.ok, false);
  assert.equal(fund.body.paidWork, false);
  assert.equal(fund.body.code, "not_found");
  const sent = requests(log).filter((row) => row.path === "/v1/market/fund");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.proofId, "unfunded");
  assert.equal(sha256(join(repo, "vendor/hosted-wallet-market/src/machine-money.mjs")), MONEY_SHA);
});
