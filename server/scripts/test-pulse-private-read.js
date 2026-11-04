import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import express from "express";
import { executeReader, main } from "./pulse-private-read.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "0593026ad155352f263e4749dc889a1578d91675";
const TOKEN = "configured-pulse-read-test-token-32";
const WRONG_SAME = "configured-pulse-read-test-token-99";
const WRONG_LONG = "configured-pulse-read-test-token-32-no";
const READER_VAR = "PULSE_READER_TEST_TOKEN";
const readerPath = fileURLToPath(new URL("./pulse-private-read.js", import.meta.url));

const pulse = await import("../lib/pulse.js");
pulse.__pulseTestInternals().stopScheduledFlush();
const { default: pulseRouter } = await import("../routes/pulse.js");

function historicalLiteral() {
  const source = spawnSync("git", ["show", `${BASE}:server/routes/pulse.js`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(source.status, 0);
  const match = source.stdout.match(/process\.env\.PULSE_TOKEN\s*\|\|\s*"([^"]*)"/);
  if (!match?.[1]) throw new Error("historical literal unavailable");
  return match[1];
}

function leaks(text, secrets) {
  let redacted = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.digest?.hex) parsed.digest.hex = "";
    redacted = JSON.stringify(parsed);
  } catch {
    // Non-JSON output is checked as written.
  }
  if (redacted.includes("k=") || redacted.includes("?")) return true;
  return secrets.some((secret) => secret && redacted.includes(secret));
}

function readerEnv(token) {
  const env = { ...process.env };
  delete env[READER_VAR];
  if (token !== undefined) env[READER_VAR] = token;
  return env;
}

function captureMain(args, env) {
  let stdout = "";
  let stderr = "";
  const streams = {
    stdout: { write(chunk) { stdout += chunk; } },
    stderr: { write(chunk) { stderr += chunk; } },
  };
  return main(args, { env, stdout: streams.stdout, stderr: streams.stderr }).then((exitCode) => ({
    exitCode,
    stdout,
    stderr,
  }));
}

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function spawnReader(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [readerPath, ...args], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("pulse private reader", async (t) => {
  const historical = historicalLiteral();
  const secrets = [TOKEN, WRONG_SAME, WRONG_LONG, historical];
  const captured = [];
  const priorToken = Object.hasOwn(process.env, "PULSE_TOKEN") ? process.env.PULSE_TOKEN : undefined;
  let gets = 0;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.method === "GET" && req.path === "/api/pulse") gets += 1;
    next();
  });
  app.use("/api/pulse", pulseRouter);
  const server = await listen(app);
  t.after(async () => {
    if (priorToken === undefined) delete process.env.PULSE_TOKEN;
    else process.env.PULSE_TOKEN = priorToken;
    await close(server);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;
  process.env.PULSE_TOKEN = TOKEN;

  async function run(args, env = readerEnv()) {
    const before = gets;
    const result = await captureMain(args, env);
    const text = `${result.stdout}${result.stderr}`;
    assert.equal(leaks(text, secrets), false);
    assert.equal(result.stderr, "");
    captured.push(text);
    let body = null;
    if (result.stdout) body = JSON.parse(result.stdout);
    return { ...result, body, requested: gets > before };
  }

  await t.test("credential missing: no source and no request", async () => {
    const result = await run(["--origin", origin]);
    assert.equal(result.exitCode, 2);
    assert.deepEqual(result.body, { error: "missing_credential" });
    assert.equal(result.requested, false);
  });

  await t.test("credential unset: named variable absent", async () => {
    const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv());
    assert.equal(result.exitCode, 2);
    assert.deepEqual(result.body, { error: "missing_credential" });
    assert.equal(result.requested, false);
  });

  await t.test("credential empty: named variable is empty", async () => {
    const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv(""));
    assert.equal(result.exitCode, 2);
    assert.equal(result.body.error, "missing_credential");
    assert.equal(result.requested, false);
  });

  await t.test("credential empty: named variable is whitespace", async () => {
    const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv("   "));
    assert.equal(result.exitCode, 2);
    assert.equal(result.body.error, "missing_credential");
    assert.equal(result.requested, false);
  });

  await t.test("credential missing: token file path does not exist", async () => {
    const result = await run(["--origin", origin, "--token-file", join(root, "no-such-pulse-token-file")]);
    assert.equal(result.exitCode, 2);
    assert.equal(result.body.error, "missing_credential");
    assert.equal(result.requested, false);
  });

  await t.test("credential empty: token file is empty", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-reader-empty-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, "token");
    writeFileSync(file, " \n", { mode: 0o600 });
    const result = await run(["--origin", origin, "--token-file", file]);
    assert.equal(result.exitCode, 2);
    assert.equal(result.body.error, "missing_credential");
    assert.equal(result.requested, false);
  });

  await t.test("credential configured: explicit env var reads a useful result", async () => {
    const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv(TOKEN));
    assert.equal(result.exitCode, 0);
    assert.equal(result.body.status, 200);
    assert.equal(typeof result.body.counts.total, "number");
    assert.match(result.body.window.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(result.body.window.now, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(result.body.digest.hex, /^[0-9a-f]{64}$/);
    assert.equal(result.requested, true);
  });

  await t.test("credential configured: token file is trimmed and accepted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-reader-file-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, "token");
    writeFileSync(file, `${TOKEN}\n`, { mode: 0o600 });
    const result = await run(["--origin", origin, "--token-file", file]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.body.status, 200);
    assert.equal(result.body.digest.algorithm, "sha256");
  });

  await t.test("credential configured: an unnamed server variable is not borrowed", async () => {
    process.env.PULSE_TOKEN = TOKEN;
    const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv());
    assert.equal(result.exitCode, 2);
    assert.equal(result.body.error, "missing_credential");
    assert.equal(result.requested, false);
  });

  await t.test("credential conflict: two sources are refused without a choice", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-reader-both-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, "token");
    writeFileSync(file, TOKEN, { mode: 0o600 });
    const result = await run(
      ["--origin", origin, "--env-var", READER_VAR, "--token-file", file],
      readerEnv(TOKEN),
    );
    assert.equal(result.exitCode, 4);
    assert.equal(result.body.reason, "credential_source_conflict");
    assert.equal(result.requested, false);
  });

  await t.test("wrong token: same length is refused", async () => {
    const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv(WRONG_SAME));
    assert.equal(result.exitCode, 3);
    assert.deepEqual(result.body, { error: "auth_refused", status: 404 });
  });

  await t.test("wrong token: different length is refused", async () => {
    const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv(WRONG_LONG));
    assert.equal(result.exitCode, 3);
    assert.equal(result.body.status, 404);
  });

  await t.test("historical default: refused against a configured token", async () => {
    process.env.PULSE_TOKEN = TOKEN;
    const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv(historical));
    assert.equal(result.exitCode, 3);
    assert.equal(result.body.status, 404);
    assert.notEqual(result.body.status, 200);
  });

  await t.test("historical default: refused when the server variable is unset", async () => {
    delete process.env.PULSE_TOKEN;
    try {
      const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv(historical));
      assert.equal(result.exitCode, 3);
      assert.equal(result.body.status, 503);
    } finally {
      process.env.PULSE_TOKEN = TOKEN;
    }
  });

  await t.test("historical default: refused when it is the server variable", async () => {
    process.env.PULSE_TOKEN = historical;
    try {
      const result = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv(historical));
      assert.equal(result.exitCode, 3);
      assert.equal(result.body.status, 503);
    } finally {
      process.env.PULSE_TOKEN = TOKEN;
    }
  });

  await t.test("historical default: reader source does not embed a credential", async () => {
    const source = readFileSync(readerPath, "utf8");
    assert.equal(source.includes(historical), false);
    assert.equal(source.includes("PULSE_TOKEN"), false);
    assert.equal(/PULSE_TOKEN\s*(\|\||\?\?)/.test(readFileSync(new URL("../routes/pulse.js", import.meta.url), "utf8")), false);
  });

  await t.test("useful result: raw aggregate stays in a private file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-reader-raw-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const rawFile = join(dir, "aggregate.json");
    const result = await run(
      ["--origin", origin, "--env-var", READER_VAR, "--raw-file", rawFile],
      readerEnv(TOKEN),
    );
    assert.equal(result.exitCode, 0);
    const mode = statSync(rawFile).mode & 0o777;
    assert.equal(mode, 0o600);
    const bytes = readFileSync(rawFile);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), result.body.digest.hex);
    assert.equal(JSON.parse(bytes.toString("utf8")).classificationSchemaVersion !== undefined, true);
    assert.equal(result.stdout.includes("classificationSchemaVersion"), false);
    assert.equal(result.stdout.includes("byReferer"), false);
    assert.equal(result.stdout.includes("recent"), false);
  });

  await t.test("failure and recovery: closed port then the live server", async () => {
    const closed = await listen((_req, res) => res.end("no"));
    const closedPort = closed.address().port;
    await close(closed);
    const down = await run(
      ["--origin", `http://127.0.0.1:${closedPort}`, "--env-var", READER_VAR, "--timeout-ms", "1000"],
      readerEnv(TOKEN),
    );
    assert.equal(down.exitCode, 4);
    assert.equal(down.body.reason, "origin_unreachable");
    const up = await run(["--origin", origin, "--env-var", READER_VAR], readerEnv(TOKEN));
    assert.equal(up.exitCode, 0);
    assert.equal(up.body.status, 200);
  });

  await t.test("failure: redirect is refused and not followed", async () => {
    let followed = 0;
    const trap = await listen((_req, res) => {
      followed += 1;
      res.end("followed");
    });
    t.after(() => close(trap));
    const trapPort = trap.address().port;
    const redirector = await listen((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${trapPort}/stolen?k=not-a-token` });
      res.end();
    });
    t.after(() => close(redirector));
    const result = await run(
      ["--origin", `http://127.0.0.1:${redirector.address().port}`, "--env-var", READER_VAR],
      readerEnv(TOKEN),
    );
    assert.equal(result.exitCode, 4);
    assert.equal(result.body.reason, "redirect_refused");
    assert.equal(followed, 0);
    assert.equal(result.stdout.includes("stolen"), false);
    assert.equal(result.stdout.includes("not-a-token"), false);
  });

  await t.test("failure: oversize response is refused", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-reader-oversize-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const rawFile = join(dir, "should-not-exist.json");
    const result = await run(
      ["--origin", origin, "--env-var", READER_VAR, "--max-bytes", "64", "--raw-file", rawFile],
      readerEnv(TOKEN),
    );
    assert.equal(result.exitCode, 4);
    assert.equal(result.body.reason, "response_too_large");
    assert.equal(statSync(rawFile, { throwIfNoEntry: false }), undefined);
  });

  await t.test("post unchanged: public allowlisted write with no credential", async () => {
    delete process.env.PULSE_TOKEN;
    try {
      const response = await fetch(`${origin}/api/pulse/event`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "seller_repair_brief_viewed",
          props: { finding_id: "hypernatt-liq-radar-20260830", route_class: "paid_get" },
        }),
      });
      assert.equal(response.status, 204);
    } finally {
      process.env.PULSE_TOKEN = TOKEN;
    }
  });

  await t.test("post unchanged: unknown event is still rejected", async () => {
    const response = await fetch(`${origin}/api/pulse/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "other_event", props: {} }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Unsupported event" });
  });

  await t.test("post unchanged: allowlisted write stays public when a token is configured", async () => {
    process.env.PULSE_TOKEN = TOKEN;
    const response = await fetch(`${origin}/api/pulse/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "seller_repair_brief_viewed",
        props: { finding_id: "hypernatt-liq-radar-20260830", route_class: "paid_get" },
      }),
    });
    assert.equal(response.status, 204);
  });

  await t.test("cli entry: missing credential and configured read stay quiet", async () => {
    const missing = await spawnReader(["--origin", origin], readerEnv());
    const text = `${missing.stdout}${missing.stderr}`;
    assert.equal(leaks(text, secrets), false);
    assert.equal(missing.status, 2);
    captured.push(text);

    const ok = await spawnReader(["--origin", origin, "--env-var", READER_VAR], readerEnv(TOKEN));
    const okText = `${ok.stdout}${ok.stderr}`;
    assert.equal(leaks(okText, secrets), false);
    assert.equal(ok.status, 0);
    const body = JSON.parse(ok.stdout);
    assert.equal(body.status, 200);
    assert.equal(typeof body.counts.total, "number");
    captured.push(okText);
  });

  await t.test("leakage: every captured reader output omits tokens and queries", async () => {
    assert.ok(captured.length >= 20);
    assert.equal(captured.every((text) => leaks(text, secrets) === false), true);
  });

  await t.test("direct consumer agrees with the cli wrapper", async () => {
    const direct = await executeReader(
      ["--origin", origin, "--env-var", READER_VAR],
      readerEnv(WRONG_SAME),
    );
    assert.equal(direct.exitCode, 3);
    assert.equal(direct.body.status, 404);
    assert.equal(JSON.stringify(direct.body).includes(WRONG_SAME), false);
  });
});
