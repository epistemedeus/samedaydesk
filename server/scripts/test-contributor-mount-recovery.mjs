import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import net from "node:net";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import express from "express";
import pg from "pg";
import { createSdsApp } from "../app.js";
import { mountNeomorphicContributorJourney } from "../lib/neomorphic-contributor-journey-mount.js";
import { contributorFailure } from "../lib/contributor-mount-recovery.js";
import { issueContributorHttpsQualification, readContributorEdgeIdentity } from "../lib/contributor-https-qualification.js";
import { hashRequest, hashToken } from "../../vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services/earned-work/src/crypto.js";

const exec = promisify(execFile);
const pgBin = "/usr/lib/postgresql/16/bin";
const manifest = JSON.parse(await readFile(new URL("../../vendor/neomorphic-contributor-journey/SOURCE.json", import.meta.url), "utf8"));
const sourceCommit = manifest.sourceCommit;
const OWNER = "cj227-fixture-owner-not-a-production-token";
const ADMIN = "cj227-fixture-correspondence-not-a-production-token";
const ARTIFACT_BYTES = Buffer.from("bounded useful output for synthetic staging\n");
const ARTIFACT = {
  ref: "inline:synthetic-contributor-evidence",
  digestSha256: createHash("sha256").update(ARTIFACT_BYTES).digest("hex"),
  mediaType: "text/plain",
  bytes: ARTIFACT_BYTES.length,
};
const TRANSIENT = new Set([
  "ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
  "EPIPE", "ENETUNREACH", "EHOSTUNREACH", "57P01", "57P02", "57P03", "53300",
  "08000", "08001", "08003", "08004", "08006", "08P01", "57014", "40P01", "55P03", "25006",
  "unknown",
]);

function secretFree(value, secret) {
  const stack = [value];
  const seen = new Set();
  while (stack.length) {
    const item = stack.pop();
    if (item == null || typeof item === "number" || typeof item === "boolean") continue;
    if (typeof item === "string") {
      if (item.includes(secret)) return false;
      continue;
    }
    if (typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    if (item instanceof Error) stack.push(item.message, item.code);
    else stack.push(...Object.values(item));
  }
  return true;
}

test("startup classes keep the cause and drop the message", () => {
  const secret = "postgres://sds:wrongpass7f3a9c@localhost/contributor_journey_staging";
  const credential = contributorFailure("store_create", Object.assign(new Error(secret), { code: "28P01" }));
  assert.deepEqual(credential, { stage: "store_create", code: "28P01", permanent: true });
  assert.equal(secretFree(credential, "wrongpass7f3a9c"), true);
  const source = contributorFailure("source_verify", new Error(secret));
  assert.equal(source.permanent, true);
  assert.equal(source.code, "installed_source_changed");
  assert.equal(secretFree(source, "wrongpass7f3a9c"), true);
  const down = contributorFailure("store_create", Object.assign(new Error(secret), { code: "ECONNREFUSED" }));
  assert.deepEqual(down, { stage: "store_create", code: "ECONNREFUSED", permanent: false });
  const qualification = contributorFailure("qualification_load", new Error("controller qualification signature refused"));
  assert.equal(qualification.permanent, true);
  assert.equal(qualification.code, "installed_verification_changed");
  const config = contributorFailure("service_config", new Error("explicit journey database URL is required"));
  assert.equal(config.permanent, true);
  assert.equal(config.code, "INVALID_INPUT");
  const enrollment = contributorFailure("store_create", new Error("deployment is not enrolled for these exact store, origin and stable keys"));
  assert.equal(enrollment.permanent, true);
  assert.equal(enrollment.code, "INVALID_INPUT");
  const edge = contributorFailure("qualification_load", Object.assign(new Error("qualified source/origin/store differs"), { code: "installed_source_changed" }));
  assert.deepEqual(edge, { stage: "qualification_load", code: "installed_source_changed", permanent: true });
  assert.equal(JSON.stringify(edge).includes("qualified source"), false);
});

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startTlsPg(options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "sds-root129-pg-"));
  const data = path.join(dir, "data");
  const ca = path.join(dir, "ca.pem");
  const key = path.join(dir, "server.key");
  const cert = path.join(dir, "server.pem");
  await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "ca.key"),
    "-out", ca, "-days", "1", "-subj", "/CN=ROOT129 disposable CA", "-addext", "basicConstraints=critical,CA:TRUE"]);
  await exec("openssl", ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
    "-out", path.join(dir, "server.csr"), "-subj", "/CN=localhost"]);
  await writeFile(path.join(dir, "extensions"), "subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n");
  await exec("openssl", ["x509", "-req", "-in", path.join(dir, "server.csr"), "-CA", ca, "-CAkey", path.join(dir, "ca.key"),
    "-CAcreateserial", "-out", cert, "-days", "1", "-extfile", path.join(dir, "extensions")]);
  await chmod(ca, 0o600);
  await chmod(key, 0o600);
  const init = await exec(path.join(pgBin, "initdb"), ["-D", data, "-U", "sds", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8", "--locale=C"]);
  if (init && false) throw new Error("initdb");
  const port = await freePort();
  await writeFile(path.join(data, "pg_hba.conf"), [
    "local all all trust",
    "hostnossl all all 0.0.0.0/0 reject",
    "hostnossl all all ::/0 reject",
    `hostssl all all 127.0.0.1/32 ${options.auth || "trust"}`,
    `hostssl all all ::1/128 ${options.auth || "trust"}`,
    "",
  ].join("\n"), { mode: 0o600 });
  await writeFile(path.join(data, "postgresql.auto.conf"), `
listen_addresses = '127.0.0.1,::1'
port = ${port}
unix_socket_directories = '${dir}'
ssl = on
ssl_cert_file = '${cert}'
ssl_key_file = '${key}'
max_connections = 40
fsync = on
synchronous_commit = on
`, { mode: 0o600 });
  let running = false;
  async function start() {
    const started = await exec(path.join(pgBin, "pg_ctl"), ["-D", data, "-l", path.join(dir, "pg.log"), "-w", "-t", "20", "start"]);
    if (started.stderr && started.code) throw new Error("pg_start_failed");
    running = true;
    if (!options.databaseReady) {
      await exec(path.join(pgBin, "createdb"), ["-h", "127.0.0.1", "-p", String(port), "-U", "sds", "contributor_journey_staging"]);
      options.databaseReady = true;
    }
  }
  async function stop() {
    if (!running) return;
    await exec(path.join(pgBin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "-t", "20", "stop"]);
    running = false;
  }
  const user = encodeURIComponent(options.user || "sds");
  const password = options.password ? `:${encodeURIComponent(options.password)}` : "";
  const url = `postgres://${user}${password}@localhost:${port}/contributor_journey_staging?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}`;
  return {
    dir, ca, port, url, start, stop,
    async destroy() {
      await stop().catch(() => {});
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function profile(url, overrides = {}) {
  return {
    CONTRIBUTOR_JOURNEY_MODE: "staging",
    CONTRIBUTOR_JOURNEY_INSTALLED: "1",
    CONTRIBUTOR_DESK_MANAGED_ENABLED: "1",
    CONTRIBUTOR_DESK_ASSETS_ENABLED: "0",
    CONTRIBUTOR_JOURNEY_PUBLIC_READS: "0",
    CONTRIBUTOR_JOURNEY_TRUST_PROXY: "0",
    CONTRIBUTOR_DESK_INGRESS_MODE: "trusted-tcp",
    CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS: '["127.0.0.1"]',
    CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN: "https://desk.invalid",
    CONTRIBUTOR_JOURNEY_SOURCE_COMMIT: sourceCommit,
    CONTRIBUTOR_JOURNEY_DATABASE_URL: url,
    CONTRIBUTOR_JOURNEY_OWNER_TOKEN: OWNER,
    CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
    CONTRIBUTOR_JOURNEY_REPLAY_KEY: "11".repeat(32),
    CONTRIBUTOR_JOURNEY_INTEGRITY_KEY: "22".repeat(32),
    CONTRIBUTOR_JOURNEY_CURSOR_KEY: "33".repeat(32),
    CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS: "[]",
    CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX: "10000",
    CONTRIBUTOR_JOURNEY_POOL_MAX: "2",
    ...overrides,
  };
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  app.get("neoContributorJourney").bindListener(server);
  return server;
}

function request(server, method, route, { cookie, body, origin = true } = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  const headers = {
    host: "desk.invalid",
    "x-forwarded-proto": "https",
    ...(origin ? { origin: "https://desk.invalid" } : {}),
    ...(cookie ? { cookie } : {}),
    ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
  };
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port: server.address().port, path: route, method, headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        resolve({ status: res.statusCode, json: parsed, setCookie: res.headers["set-cookie"] || [] });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function safeView(response) {
  const body = response.json && typeof response.json === "object" ? response.json : {};
  return {
    status: response.status,
    code: body.error && typeof body.error.code === "string" ? body.error.code : null,
    ready: typeof body.ready === "boolean" ? body.ready : null,
    publicEnabled: body.publicEnabled === false ? false : body.publicEnabled === true ? true : null,
    releaseAccepted: body.releaseAccepted === false ? false : body.releaseAccepted === true ? true : null,
    ok: body.ok === false ? false : body.ok === true ? true : null,
    accountId: body.account && typeof body.account.accountId === "string" ? body.account.accountId : null,
    claimsArray: Array.isArray(body.claims) || Array.isArray(body.value),
    keys: Object.keys(body).sort(),
  };
}

async function mountManaged(env, now) {
  const app = createSdsApp({ neomorphicContributorJourney: { env, now } });
  const handle = app.get("neoContributorJourney");
  const server = await listen(app);
  return {
    app, handle, server,
    async close() {
      await handle.close();
      if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test("verified TLS outage stays unavailable, then one init recovers the same account, claim, terms and debt", { timeout: 120_000 }, async () => {
  const clock = { now: 1_000_000 };
  const cluster = await startTlsPg();
  const mounted = await mountManaged(profile(cluster.url), () => clock.now);
  try {
    await mounted.handle.ready();
    const failed = mounted.handle.state;
    assert.equal(failed.status, "disabled");
    assert.equal(failed.reason, "unavailable");
    assert.equal(failed.terminal, false);
    assert.equal(failed.diagnostic.stage, "store_create");
    assert.equal(TRANSIENT.has(failed.diagnostic.code), true, failed.diagnostic.code);
    assert.equal(failed.attempts, 1);
    assert.equal(failed.initializations, 1);
    process.stdout.write(`ROOT129_INITIAL stage=${failed.diagnostic.stage} code=${failed.diagnostic.code} attempts=${failed.attempts} inits=${failed.initializations}\n`);
    const early = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/healthz", { origin: false }));
    const session = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/v1/account/session", { origin: false }));
    assert.deepEqual(early, {
      status: 503, code: "unavailable", ready: false, publicEnabled: false, releaseAccepted: false,
      ok: null, accountId: null, claimsArray: false, keys: ["error", "publicEnabled", "ready", "releaseAccepted"],
    });
    assert.deepEqual(session, early);
    assert.equal(mounted.handle.state.initializations, 1);

    clock.now = failed.nextAttemptAt;
    const concurrent = await Promise.all(Array.from({ length: 8 }, () =>
      request(mounted.server, "GET", "/api/neomorphic-contributor-journey/healthz", { origin: false })));
    assert.equal(mounted.handle.state.initializations, 2);
    assert.equal(concurrent.every((response) => response.status === 503), true);
    assert.equal(mounted.handle.state.terminal, false);

    await cluster.start();
    clock.now = mounted.handle.state.nextAttemptAt;
    const recovered = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/healthz", { origin: false }));
    assert.equal(recovered.status, 200);
    assert.equal(recovered.ready, true);
    assert.equal(mounted.handle.state.status, "ready");
    assert.equal(mounted.handle.state.initializations, 3);
    process.stdout.write(`ROOT129_RECOVERED status=${mounted.handle.state.status} inits=${mounted.handle.state.initializations}\n`);
    const during = mounted.handle.state.initializations;
    await Promise.all(Array.from({ length: 8 }, () =>
      request(mounted.server, "GET", "/api/neomorphic-contributor-journey/healthz", { origin: false })));
    assert.equal(mounted.handle.state.initializations, during);

    const proof = randomBytes(32).toString("base64url");
    const password = randomBytes(18).toString("base64url");
    const signupHeaders = {
      host: "desk.invalid",
      origin: "https://desk.invalid",
      "x-forwarded-proto": "https",
      "content-type": "application/json",
      "idempotency-key": "signup-root129-fixture",
      "x-account-operation-proof": proof,
    };
    const signupBody = JSON.stringify({ password, displayName: "Synthetic Owner" });
    signupHeaders["content-length"] = Buffer.byteLength(signupBody);
    const signed = await new Promise((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1", port: mounted.server.address().port,
        path: "/api/neomorphic-contributor-journey/v1/account/signup", method: "POST", headers: signupHeaders,
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8"), setCookie: res.headers["set-cookie"] || [] }));
      });
      req.on("error", reject);
      req.end(signupBody);
    });
    assert.equal(signed.status, 200);
    const signedJson = JSON.parse(signed.raw);
    const accountId = signedJson.account.accountId;
    assert.match(accountId, /^acc_[A-Za-z0-9_-]{16}$/);
    const cookie = signed.setCookie.map((value) => value.split(";")[0]).find((value) => value.startsWith("__Host-neo_contributor="));
    assert.ok(cookie);
    const seen = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/v1/account/session", { cookie, origin: false }));
    assert.equal(seen.status, 200);
    assert.equal(seen.accountId, accountId);

    const store = mounted.handle.state.runtime.services.earnedWork.store;
    const token = `tok_${randomBytes(18).toString("base64url")}`;
    const contributor = await store.createContributorToken({
      publicId: "synthetic-owner", payoutDestination: null, taskScope: null, provenance: "test",
      tokenHash: hashToken(token), expiresAt: null,
    });
    const created = await store.createTask({
      title: "synthetic-root129-task", summary: "Synthetic staging only", provenance: "test",
      budget: { amount: "0.10", asset: "USDC", network: "base" }, correctionMaxRevisions: 1,
      terms: {
        summary: "Synthetic exact terms", reward: { amount: "0.10", asset: "USDC", network: "base" },
        claimTtlSeconds: 3600, maxArtifactBytes: 1024, allowedMediaTypes: ["text/plain"], slotLimit: 1,
      },
      idempotencyKey: "root129-create", requestHash: hashRequest({ purpose: "synthetic-only" }),
    });
    const taskId = created.body.task.id;
    const termsVersion = created.body.task.termsVersion;
    await store.reserveFunding(taskId, "root129-reserve", hashRequest({ purpose: "reserve" }));
    const principal = { id: contributor.id, publicId: contributor.publicId, taskScope: null };
    const claimed = await store.claim({
      taskId, contributor: principal, termsVersion, idempotencyKey: "root129-claim", requestHash: hashRequest({ purpose: "claim" }),
    });
    const reservationId = claimed.body.reservation.id;
    await store.submit({
      taskId, reservationId, contributor: principal, artifact: ARTIFACT, evidenceBytes: ARTIFACT_BYTES,
      idempotencyKey: "root129-submit", requestHash: hashRequest({ purpose: "submit" }),
    });
    const verdict = await store.createVerdict({
      taskId, reservationId, artifactDigestSha256: ARTIFACT.digestSha256, verifierVersion: "synthetic-owner-qa",
      outcome: "pass", reasons: ["synthetic"], idempotencyKey: "root129-verdict", requestHash: hashRequest({ purpose: "verdict" }),
    });
    const accepted = await store.accept({
      taskId, reservationId, verdictId: verdict.body.verdict.id, artifactDigestSha256: ARTIFACT.digestSha256,
      idempotencyKey: "root129-accept", requestHash: hashRequest({ purpose: "accept" }),
    });
    const obligationId = accepted.body.obligation.id;
    assert.equal(accepted.body.obligation.payoutState, "owed");
    assert.equal(accepted.body.obligation.termsVersion, termsVersion);

    await cluster.stop();
    const downSession = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/v1/account/session", { cookie, origin: false }));
    const downClaims = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/v1/claims/claims", { cookie, origin: false }));
    assert.equal(downSession.status, 503);
    assert.equal(downSession.code, "unavailable");
    assert.equal(downSession.accountId, null);
    assert.equal(downClaims.status, 503);
    assert.equal(downClaims.code, "unavailable");
    assert.equal(downClaims.claimsArray, false);
    assert.notEqual(downClaims.ok, true);
    assert.equal(mounted.handle.state.initializations, during);

    await cluster.start();
    const back = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/v1/account/session", { cookie, origin: false }));
    assert.equal(back.status, 200);
    assert.equal(back.accountId, accountId);
    const probe = new pg.Client({ connectionString: cluster.url, options: "-c search_path=cj227_earned_work" });
    await probe.connect();
    try {
      const account = await probe.query("SELECT id FROM journey_accounts WHERE id = $1", [accountId]);
      const reservation = await probe.query("SELECT terms_version, status FROM earned_work_reservations WHERE id = $1", [reservationId]);
      const debt = await probe.query("SELECT payout_state, terms_version FROM earned_work_obligations WHERE id = $1", [obligationId]);
      assert.equal(account.rows[0].id, accountId);
      assert.equal(reservation.rows[0].terms_version, termsVersion);
      assert.equal(reservation.rows[0].status, "completed");
      assert.equal(debt.rows[0].payout_state, "owed");
      assert.equal(debt.rows[0].terms_version, termsVersion);
      await mounted.close();
      let leftover = 1;
      for (let attempt = 0; attempt < 20 && leftover !== 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        leftover = (await probe.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")).rows[0].n;
      }
      assert.equal(leftover, 0);
    } finally {
      await probe.end();
    }
  } finally {
    await mounted.close().catch(() => {});
    await cluster.destroy();
  }
});

test("shutdown during recovery does not resume", { timeout: 30_000 }, async () => {
  const clock = { now: 5_000_000 };
  const port = await freePort();
  const paused = new Set();
  const blocker = net.createServer((socket) => {
    paused.add(socket);
    socket.on("close", () => paused.delete(socket));
    socket.pause();
  });
  await new Promise((resolve) => blocker.listen(port, "127.0.0.1", resolve));
  const caDir = await mkdtemp(path.join(tmpdir(), "sds-root129-ca-"));
  const ca = path.join(caDir, "ca.pem");
  await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(caDir, "ca.key"),
    "-out", ca, "-days", "1", "-subj", "/CN=ROOT129 disposable CA"]);
  const url = `postgres://sds@localhost:${port}/contributor_journey_staging?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}`;
  const mounted = await mountManaged(profile(url), () => clock.now);
  try {
    const pending = mounted.handle.ready();
    await mounted.handle.close();
    await pending;
    assert.equal(mounted.handle.state.reason, "disabled");
    assert.equal(mounted.handle.state.terminal, true);
    const frozen = mounted.handle.state.initializations;
    clock.now += 60_000;
    for (const socket of paused) socket.destroy();
    await new Promise((resolve) => blocker.close(resolve));
    const server = http.createServer(mounted.app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    mounted.handle.bindListener(server);
    const response = safeView(await request(server, "GET", "/api/neomorphic-contributor-journey/healthz", { origin: false }));
    assert.equal(response.status, 503);
    assert.equal(response.code, "disabled");
    assert.equal(mounted.handle.state.initializations, frozen);
    assert.notEqual(mounted.handle.state.status, "ready");
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  } finally {
    await mounted.close().catch(() => {});
    await new Promise((resolve) => blocker.close(resolve));
    await rm(caDir, { recursive: true, force: true });
  }
});

test("bad artifact, qualification, config and credentials stay closed", { timeout: 60_000 }, async (t) => {
  const lines = [];
  t.mock.method(console, "error", (...args) => { lines.push(args); });
  const clock = { now: 9_000_000 };
  const unreachable = "postgres://sds@localhost:9/contributor_journey_staging?sslmode=verify-full&sslrootcert=/tmp/root129-unused-ca.pem";
  await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", "/tmp/root129-unused-ca.key", "-out", "/tmp/root129-unused-ca.pem", "-days", "1", "-subj", "/CN=unused"]);

  async function onceRefused(env) {
    const before = lines.length;
    const started = clock.now;
    const mounted = await mountManaged(env, () => clock.now);
    try {
      await mounted.handle.ready();
      assert.equal(mounted.handle.state.terminal, true);
      assert.equal(mounted.handle.state.reason, "unavailable");
      assert.ok(mounted.handle.state.diagnostic);
      const inits = mounted.handle.state.initializations;
      clock.now = started + 120_000;
      const again = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/v1/account/session", { origin: false }));
      assert.equal(again.status, 503);
      assert.equal(again.code, "unavailable");
      assert.equal(again.accountId, null);
      assert.equal(mounted.handle.state.initializations, inits);
      assert.equal(mounted.handle.state.terminal, true);
      const fresh = lines.slice(before);
      assert.ok(fresh.length >= 1);
      assert.equal(fresh.every((args) => secretFree(args, "wrongpass7f3a9c")), true);
      return mounted.handle.state.diagnostic;
    } finally {
      await mounted.close();
    }
  }

  const artifact = await onceRefused(profile(unreachable, { CONTRIBUTOR_JOURNEY_SOURCE_COMMIT: "a".repeat(40) }));
  assert.equal(artifact.stage, "source_verify");
  assert.equal(artifact.code, "installed_source_changed");

  const qualification = await onceRefused(profile(unreachable, {
    CONTRIBUTOR_DESK_INGRESS_MODE: "litespeed-https-only",
    CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS: "[]",
    CONTRIBUTOR_DESK_HTTPS_QUALIFICATION: "not-a-qualification",
  }));
  assert.equal(qualification.stage, "qualification_load");

  const config = await onceRefused(profile(unreachable, { CONTRIBUTOR_JOURNEY_MODE: "production" }));
  assert.equal(config.stage, "ingress_profile");
  assert.equal(config.code, "INVALID_INPUT");

  const cluster = await startTlsPg({ auth: "trust" });
  await cluster.start();
  await exec(path.join(pgBin, "psql"), ["-h", "127.0.0.1", "-p", String(cluster.port), "-U", "sds", "-d", "contributor_journey_staging",
    "-c", "ALTER USER sds PASSWORD 'correct-root129-password'"]);
  await writeFile(path.join(cluster.dir, "data", "pg_hba.conf"), [
    "local all all trust",
    "hostnossl all all 0.0.0.0/0 reject",
    "hostnossl all all ::/0 reject",
    "hostssl all all 127.0.0.1/32 scram-sha-256",
    "hostssl all all ::1/128 scram-sha-256",
    "",
  ].join("\n"));
  await exec(path.join(pgBin, "pg_ctl"), ["-D", path.join(cluster.dir, "data"), "-m", "fast", "-w", "-t", "20", "reload"]);
  const wrongUrl = cluster.url.replace("postgres://sds@", "postgres://sds:wrongpass7f3a9c@");
  try {
    const credential = await onceRefused(profile(wrongUrl));
    assert.equal(credential.stage, "store_create");
    assert.equal(credential.code, "28P01");
  } finally {
    await cluster.destroy();
    await rm("/tmp/root129-unused-ca.pem", { force: true });
    await rm("/tmp/root129-unused-ca.key", { force: true });
  }
});

test("direct journey mount records a transient store failure and does not replace invalid config", async () => {
  let clock = 20_000_000;
  const app = express();
  const handle = mountNeomorphicContributorJourney(app, {
    env: { CONTRIBUTOR_JOURNEY_MODE: "production" },
    now: () => clock,
    loadService: () => { throw new Error("must not load"); },
  });
  await handle.ready();
  assert.equal(handle.state.reason, "invalid_config");
  assert.equal(handle.state.terminal, true);
  assert.equal(handle.state.initializations, 0);
  clock += 60_000;
  await handle.ensure();
  assert.equal(handle.state.initializations, 0);
  await handle.close();
});

test("a valid older edge qualification stays closed and is not retried", async (t) => {
  const lines = [];
  t.mock.method(console, "error", (...args) => { lines.push(args); });
  const olderEdge = "bb5b9a7c2bc03f183af22ba8d1edcd6a9c46a976cf5b6478fe6b7c51686ec13d";
  const sdsCommit = "5".repeat(40);
  const database = "postgres://sds@127.0.0.1:9/contributor_journey_staging";
  const issueEnv = profile(database, {
    CONTRIBUTOR_JOURNEY_MODE: "disabled",
    CONTRIBUTOR_DESK_MANAGED_ENABLED: "0",
    CONTRIBUTOR_JOURNEY_PUBLIC_READS: "0",
    CONTRIBUTOR_DESK_INSTALLATION_ID: "synthetic-installation-v2",
    CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT: sdsCommit,
  });
  const checks = Object.fromEntries(["providerHttpsPolicy", "certificateVerifiedHttps", "plaintextRefusal", "backendIsolation"]
    .map((name) => [name, {
      receivedAt: new Date().toISOString(),
      receiptSha256: createHash("sha256").update(`distinct owner QA receipt ${name}`).digest("hex"),
    }]));
  const { payload } = await issueContributorHttpsQualification({
    schema: "sds.contributor-https-only-receiving.v2",
    profile: "staging",
    installationId: "synthetic-installation-v2",
    sdsCommit,
    loaderSha256: createHash("sha256").update("owner QA loader, not provider bytes").digest("hex"),
    checks,
  }, issueEnv);
  const identity = await readContributorEdgeIdentity(sourceCommit);
  assert.equal(payload.binding.sdsCommit, sdsCommit);
  assert.equal(payload.binding.productCommit, identity.productCommit);
  assert.notEqual(identity.edgeSha256, olderEdge);
  const stale = { ...payload, binding: { ...payload.binding, edgeSha256: olderEdge } };
  const encoded = Buffer.from(JSON.stringify(stale)).toString("base64url");
  const qualification = `${encoded}.${createHmac("sha256", Buffer.from(issueEnv.CONTRIBUTOR_JOURNEY_INTEGRITY_KEY, "hex")).update(`${stale.schema}\0${encoded}`).digest("hex")}`;
  const serving = profile(database, {
    CONTRIBUTOR_DESK_INGRESS_MODE: "litespeed-https-only",
    CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS: "[]",
    CONTRIBUTOR_DESK_HTTPS_QUALIFICATION: qualification,
    CONTRIBUTOR_DESK_INSTALLATION_ID: "synthetic-installation-v2",
    CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT: sdsCommit,
  });
  const mounted = await mountManaged(serving, () => 3_000_000);
  try {
    await mounted.handle.ready();
    assert.equal(mounted.handle.state.terminal, true);
    assert.equal(mounted.handle.state.reason, "unavailable");
    assert.equal(mounted.handle.state.status, "disabled");
    assert.deepEqual(mounted.handle.state.diagnostic, { stage: "qualification_load", code: "installed_source_changed" });
    const inits = mounted.handle.state.initializations;
    assert.equal(inits, 0);
    const session = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/v1/account/session", { origin: false }));
    const claims = safeView(await request(mounted.server, "GET", "/api/neomorphic-contributor-journey/v1/claims/claims", { origin: false }));
    assert.equal(session.status, 503);
    assert.equal(session.code, "unavailable");
    assert.equal(session.ready, false);
    assert.equal(session.publicEnabled, false);
    assert.equal(session.releaseAccepted, false);
    assert.equal(session.claimsArray, false);
    assert.deepEqual(session.keys, ["error", "publicEnabled", "ready", "releaseAccepted"]);
    assert.equal(claims.status, 503);
    assert.equal(claims.code, "unavailable");
    assert.equal(claims.claimsArray, false);
    assert.equal(mounted.handle.state.initializations, inits);
    assert.equal(mounted.handle.state.terminal, true);
    assert.equal(mounted.handle.state.attempts, 0);
    const cause = lines.flat().find((item) => item && item.stage);
    assert.deepEqual(cause, { stage: "qualification_load", code: "installed_source_changed" });
    const rendered = JSON.stringify(lines);
    assert.equal(rendered.includes(olderEdge), false);
    assert.equal(rendered.includes(sdsCommit), false);
    assert.equal(rendered.includes(qualification), false);
    assert.equal(rendered.includes(issueEnv.CONTRIBUTOR_JOURNEY_INTEGRITY_KEY), false);
    assert.equal(rendered.includes("no claim"), false);
  } finally {
    await mounted.close();
  }
});

test("recovery modules do not schedule a resident timer", async () => {
  for (const file of ["contributor-mount-recovery.js", "contributor-managed-mount.js", "neomorphic-contributor-journey-mount.js"]) {
    const source = await readFile(new URL(`../lib/${file}`, import.meta.url), "utf8");
    assert.equal(/\bset(?:Timeout|Interval|Immediate)\b/.test(source), false, file);
  }
});

void once;
