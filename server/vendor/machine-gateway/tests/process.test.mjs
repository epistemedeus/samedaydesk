import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launch } from "./process-helpers.mjs";
import { TOKEN_A, TOKEN_B, until, delay } from "./helpers.mjs";

const script = fileURLToPath(new URL("./process-fixture.mjs", import.meta.url));
async function post(base, path, body, token = TOKEN_A, key = "owned-process-key-001") {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: {
    "content-type": "application/json", authorization: `Bearer ${token}`, "idempotency-key": key,
    "payment-signature": "unsigned-local-fixture-process1",
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "machine-gateway-process-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, env: { GATEWAY_TEST_FILE: join(dir, "machine-gateway.sqlite"), GATEWAY_TEST_LOG: join(dir, "calls.log") } };
}

test("real process crash after possible-spend commit cannot resend on restart or changed key/quote", async t => {
  const { env } = await setup(t);
  const first = await launch(t, script, { ...env, GATEWAY_TEST_HANG: "1" });
  const input = { value: "owned process crash test" };
  const quote = await post(first.base, "/v1/quote", { routeId: "fixture.paid", input });
  const body = { quoteId: quote.body.quoteId, input, maxUnits: 5 };
  const pending = post(first.base, "/v1/execute", body).catch(() => null);
  await until(async () => { try { return (await readFile(env.GATEWAY_TEST_LOG, "utf8")).includes("settle"); } catch { return false; } });
  const db = new DatabaseSync(env.GATEWAY_TEST_FILE);
  const receipt = JSON.parse(db.prepare("SELECT body FROM attempts").get().body);
  assert.equal(receipt.payment.state, "possible"); db.close();
  // Deliberately crash only the child PID created by this test.
  await first.stop("SIGKILL"); await pending;
  const second = await launch(t, script, env);
  await delay(Math.max(0, receipt.deadlineAt - Date.now() + 20));
  const replay = await post(second.base, "/v1/execute", body);
  assert.equal(replay.body.id, receipt.id); assert.equal(replay.body.status, "uncertain");
  assert.equal(replay.body.payment.state, "possible");
  assert.equal((await post(second.base, "/v1/execute", body, TOKEN_A, "new-process-key-0001")).status, 409);
  const newQuote = await post(second.base, "/v1/quote", { routeId: "fixture.paid", input });
  assert.equal((await post(second.base, "/v1/execute", { ...body, quoteId: newQuote.body.quoteId }, TOKEN_A, "new-process-key-0002")).body.error.code, "payment_reused");
  assert.equal((await readFile(env.GATEWAY_TEST_LOG, "utf8")).trim(), "verify\nsettle");
  const read = await fetch(`${second.base}/v1/receipts/${receipt.id}`, { headers: { authorization: `Bearer ${TOKEN_A}` } }).then(r => r.json());
  assert.deepEqual(read, replay.body);
  assert.equal((await fetch(`${second.base}/v1/receipts/${receipt.id}`, { headers: { authorization: `Bearer ${TOKEN_B}` } })).status, 404);
});

test("independent Node processes share SQLite budget and credential admission atomically", async t => {
  const { env } = await setup(t);
  const first = await launch(t, script, env), second = await launch(t, script, env);
  const input = { value: "two processes one purchase" };
  const quote = await post(first.base, "/v1/quote", { routeId: "fixture.paid", input });
  const body = { quoteId: quote.body.quoteId, input, maxUnits: 5 };
  const replies = await Promise.all([post(first.base, "/v1/execute", body), post(second.base, "/v1/execute", body)]);
  assert.ok(replies.every(r => [200, 202].includes(r.status)));
  assert.equal(replies[0].body.id, replies[1].body.id);
  assert.equal((await post(second.base, "/v1/execute", body)).body.status, "completed");
  assert.equal((await readFile(env.GATEWAY_TEST_LOG, "utf8")).trim(), "verify\nsettle\nprovider");
});
