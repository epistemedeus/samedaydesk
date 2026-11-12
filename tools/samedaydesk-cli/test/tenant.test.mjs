// Configured-tenant journey against the inert authority port (exact gateway
// contract, no provider, no money). These tests show client behavior: stage
// separation, binding, persisted recovery and idempotent resume. They are not
// evidence of live funded execution.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { main } from "../src/cli.mjs";
import { EXIT } from "../src/errors.mjs";
import { expectedRequestDigest } from "../src/tenant.mjs";
import { sink, tempDir } from "./helpers.mjs";
import { spawnCli, startServer, waitFor } from "./server-fixture.mjs";
import { startAuthority, TOKEN_A, TOKEN_B } from "./gateway-authority.mjs";
import { sha256 } from "../../../server/vendor/machine-gateway/src/util.mjs";

function setup() {
  const dir = tempDir();
  const credential = (token = TOKEN_A, name = "tenant.credential") => { const path = join(dir, name); writeFileSync(path, `${token}\n`); chmodSync(path, 0o600); return path; };
  const input = (value = { value: "actual" }, name = "input.json") => { const path = join(dir, name); writeFileSync(path, JSON.stringify(value)); return path; };
  return { dir, credential, input };
}
async function cli(args) {
  const stdout = sink(); const stderr = sink();
  const exit = await main(args, { stdout, stderr, sleep: async () => {} });
  const raw = stdout.chunks.join("") + stderr.chunks.join("");
  return { exit, out: stdout.lines()[0], err: stderr.lines(), raw };
}
const loop = origin => ["--origin", origin, "--allow-loopback"];
const readState = file => JSON.parse(readFileSync(file, "utf8"));

test("tenant: server quote, execute, verified result; caller-state v1 persisted 0600 with the key before execution", async () => {
  const authority = await startAuthority();
  try {
    const { dir, credential, input } = setup();
    const quote = await cli(["gateway", "quote", "--route", "fixture.echo", "--input-file", input(), "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(quote.exit, 0);
    assert.equal(quote.out.result.kind, "remote_quote");
    assert.equal(quote.out.result.anonymous, false);
    assert.equal(quote.out.result.tenantBound, true);
    assert.equal(quote.out.result.credential.value, "[redacted]");
    const anonymous = await cli(["gateway", "quote", "--route", "fixture.echo", "--input-file", input(), ...loop(authority.origin)]);
    assert.equal(anonymous.out.result.anonymous, true);
    assert.equal(anonymous.out.result.tenantBound, false);
    const preview = await cli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", join(dir, "p.json"), "--dry-run", ...loop(authority.origin)]);
    assert.equal(preview.out.result.kind, "local_preview");
    assert.equal(preview.out.result.sent, false);
    const sentBefore = authority.requests.length;
    assert.equal(sentBefore, 2, "dry run sent nothing");
    const state = join(dir, "state.json");
    let stateAtExecute = null;
    authority.control.onAdmit = () => { stateAtExecute = existsSync(state) ? readState(state) : null; };
    const run = await cli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", state, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(run.exit, 0, JSON.stringify(run.out));
    const result = run.out.result;
    assert.equal(result.schema, "samedaydesk.cli.tenant-result.v1");
    assert.equal(result.receipt.status, "completed");
    assert.deepEqual(result.output, { value: "actual" });
    assert.equal(result.acceptance.kind, "local_verification");
    assert.equal(result.acceptance.requestDigestMatches, true);
    assert.equal(result.stages.serverQuote.route, "quoteRoute");
    assert.equal(result.stages.execution.route, "executeBoundQuote");
    assert.equal(result.stages.result.route, "readPersistedReceipt");
    assert.equal(result.singleExecutionClaimed, false);
    assert.equal(authority.control.commits, 1);
    assert.equal(statSync(state).mode & 0o777, 0o600);
    const saved = readState(state);
    assert.equal(saved.schema, "neomorphic.machine-gateway.caller-state.v1");
    assert.equal(saved.tenantBinding, sha256(TOKEN_A));
    assert.equal(saved.receipt.id, result.receipt.id);
    assert.equal(saved.dispatch.recovery, "remote_committed");
    assert.ok(stateAtExecute, "state existed when the server admitted the execution");
    assert.equal(stateAtExecute.key, saved.key);
    assert.equal(stateAtExecute.dispatch.recovery, "sent_unconfirmed");
    const execute = authority.requests.find(request => request.url.endsWith("/v1/execute"));
    assert.equal(execute.headers["idempotency-key"], saved.key);
    const handback = JSON.parse(readFileSync(`${state}.handback.json`, "utf8"));
    assert.equal(statSync(`${state}.handback.json`).mode & 0o777, 0o600);
    assert.equal(handback.schema, "task-continuation.handback.v1");
    assert.equal(handback.state, "acceptance");
    assert.equal(handback.result.stepEventId, saved.key, "the idempotency key is the handback stepEventId");
    assert.equal(result.handback.state, "acceptance");
    assert.ok(!readFileSync(`${state}.handback.json`, "utf8").includes(TOKEN_A) && !readFileSync(`${state}.handback.json`, "utf8").includes("actual"), "no token or raw input in the handback");
    assert.equal(execute.headers.authorization, `Bearer ${TOKEN_A}`);
    for (const text of [run.raw, quote.raw, JSON.stringify(saved)]) assert.ok(!text.includes(TOKEN_A));
    const again = await cli(["gateway", "result", "--state-file", state, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(again.exit, 0);
    assert.equal(authority.control.commits, 1, "result never executes");
    const exists = await cli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", state, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(exists.out.error.code, "state_exists");
  } finally { await authority.close(); }
});

test("tenant: a paid route stops before execution with the payment handoff; nothing executed or paid", async () => {
  const authority = await startAuthority();
  try {
    const { dir, credential, input } = setup();
    const state = join(dir, "paid.json");
    const run = await cli(["gateway", "execute", "--route", "fixture.paid", "--input-file", input(), "--state-file", state, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(run.exit, EXIT.funding);
    assert.equal(run.out.error.code, "paid_route_requires_payment_authority");
    assert.equal(run.out.error.evidence.price.amount, 5);
    assert.equal(authority.control.executeRequests, 0);
    assert.equal(authority.control.commits, 0);
    assert.equal(existsSync(state), false);
  } finally { await authority.close(); }
});

test("tenant child: lost committed response, then resume in a fresh process recovers the same receipt (server commit count stays 1)", async () => {
  const authority = await startAuthority();
  try {
    const { dir, credential, input } = setup();
    const state = join(dir, "lost.json");
    authority.control.loseNextExecuteResponse = true;
    const first = spawnCli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", state, "--credential-file", credential(), ...loop(authority.origin)]);
    const { code } = await first.exited;
    assert.equal(code, EXIT.transport, first.stdout());
    const failure = first.lines()[0].error;
    assert.ok(["transport_failed", "response_interrupted"].includes(failure.code), failure.code);
    assert.equal(failure.evidence.recovery, "sent_unconfirmed");
    assert.equal(authority.control.commits, 1, "the server committed the execution");
    const persisted = readState(state);
    assert.equal(persisted.receipt, null);
    assert.equal(persisted.dispatch.recovery, "sent_unconfirmed");
    assert.equal(JSON.parse(readFileSync(`${state}.handback.json`, "utf8")).state, "result_unknown");
    const premature = spawnCli(["gateway", "result", "--state-file", state, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal((await premature.exited).code, EXIT.input);
    assert.equal(premature.lines()[0].error.code, "receipt_unknown");
    const resumed = spawnCli(["gateway", "resume", "--state-file", state, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal((await resumed.exited).code, 0, resumed.stdout());
    const result = resumed.lines()[0].result;
    assert.equal(result.receipt.status, "completed");
    assert.equal(authority.control.commits, 1, "resume was answered from the stored receipt; the route did not run again");
    assert.equal(JSON.parse(readFileSync(`${state}.handback.json`, "utf8")).state, "acceptance");
    assert.equal(authority.control.executeRequests, 2);
    const keys = authority.requests.filter(request => request.url.endsWith("/v1/execute")).map(request => request.headers["idempotency-key"]);
    assert.equal(keys[0], keys[1], "same key on resume");
    assert.ok(!first.stdout().includes(TOKEN_A) && !first.stderr().includes(TOKEN_A) && !resumed.stdout().includes(TOKEN_A));
  } finally { await authority.close(); }
});

test("tenant child: SIGINT during execution is cancelled with sent_unconfirmed; resume recovers without a second execution", async () => {
  const authority = await startAuthority();
  try {
    const { dir, credential, input } = setup();
    const state = join(dir, "int.json");
    let release;
    authority.control.holdExecute = new Promise(done => { release = done; });
    const first = spawnCli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", state, "--credential-file", credential(), ...loop(authority.origin)]);
    await waitFor(() => authority.control.commits === 1);
    first.child.kill("SIGINT");
    const { code } = await first.exited;
    assert.equal(code, 130);
    const error = first.lines()[0].error;
    assert.equal(error.code, "cancelled");
    assert.equal(error.evidence.recovery, "sent_unconfirmed");
    assert.equal(readState(state).dispatch.recovery, "sent_unconfirmed");
    release();
    authority.control.holdExecute = null;
    await waitFor(() => [...authority.attempts.values()][0].receipt.status === "completed");
    const resumed = spawnCli(["gateway", "resume", "--state-file", state, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal((await resumed.exited).code, 0, resumed.stdout());
    assert.equal(authority.control.commits, 1);
  } finally { await authority.close(); }
});

test("tenant: resume of a direct-client (caller.mjs) state file; changed terms and another credential are refused locally", async () => {
  const authority = await startAuthority();
  try {
    const { dir, credential, input } = setup();
    const quote = await cli(["gateway", "quote", "--route", "fixture.echo", "--input-file", input({ value: "old" }), "--credential-file", credential(), ...loop(authority.origin)]);
    const base = `${authority.origin}/api/machine-gateway`;
    const callerState = { schema: "neomorphic.machine-gateway.caller-state.v1", base, tenantBinding: sha256(TOKEN_A), route: "fixture.echo",
      request: { quoteId: quote.out.result.quote.quoteId, input: { value: "old" }, maxUnits: 0 }, key: randomUUID(), receipt: null };
    const file = join(dir, "caller.json");
    writeFileSync(file, JSON.stringify(callerState), { mode: 0o600 });
    const resumed = await cli(["gateway", "resume", "--state-file", file, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(resumed.exit, 0, JSON.stringify(resumed.out));
    assert.equal(resumed.out.result.receipt.requestDigest, expectedRequestDigest(callerState.request));
    const other = await cli(["gateway", "resume", "--state-file", file, "--credential-file", credential(TOKEN_B, "b.credential"), ...loop(authority.origin)]);
    assert.equal(other.out.error.code, "state_binding_conflict");
    const sent = authority.requests.length;
    const executed = join(dir, "exec.json");
    await cli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", executed, "--credential-file", credential(), ...loop(authority.origin)]);
    const tampered = readState(executed);
    tampered.request.input = { value: "changed" };
    tampered.receipt = null;
    writeFileSync(executed, JSON.stringify(tampered));
    const refused = await cli(["gateway", "resume", "--state-file", executed, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(refused.out.error.code, "state_binding_conflict");
    assert.equal(authority.requests.filter(request => request.url.endsWith("/v1/execute")).length, 2, "a changed request is never sent");
    assert.ok(authority.requests.length > sent);
  } finally { await authority.close(); }
});

test("tenant: a changed task against its handback is continuation_task_changed and nothing is sent", async () => {
  const authority = await startAuthority();
  try {
    const { dir, credential, input } = setup();
    const file = join(dir, "t.json");
    authority.control.loseNextExecuteResponse = true;
    const first = await cli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", file, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(first.exit, EXIT.transport);
    const state = readState(file);
    delete state.cli.expectedRequestDigest;
    delete state.cli.serverQuote.inputDigest;
    state.request.input = { value: "changed" };
    writeFileSync(file, JSON.stringify(state));
    const executes = authority.control.executeRequests;
    const refused = await cli(["gateway", "resume", "--state-file", file, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(refused.exit, EXIT.conflict);
    assert.equal(refused.out.error.code, "continuation_task_changed");
    assert.deepEqual(refused.out.error.evidence.changed, ["subject"]);
    assert.equal(refused.out.error.evidence.continuation.exitCode, 5, "the module's own exit row is carried");
    assert.equal(authority.control.executeRequests, executes);
    const missing = join(dir, "m.json");
    writeFileSync(missing, JSON.stringify({ ...readState(file), request: { ...readState(file).request, input: { value: "actual" } } }), { mode: 0o600 });
    const noHandback = await cli(["gateway", "resume", "--state-file", missing, "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(noHandback.out.error.code, "continuation_handback_invalid");
  } finally { await authority.close(); }
});

test("tenant: failed receipt is execution_failed (exit 15) with the server code; missing credential is typed", async () => {
  const authority = await startAuthority();
  try {
    const { dir, credential, input } = setup();
    const failed = await cli(["gateway", "execute", "--route", "fixture.fail", "--input-file", input(), "--state-file", join(dir, "f.json"), "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(failed.exit, EXIT.remote_failed);
    assert.equal(failed.out.error.code, "execution_failed");
    assert.equal(failed.out.error.evidence.receiptError.code, "provider_failed");
    const none = await cli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", join(dir, "n.json"), ...loop(authority.origin)]);
    assert.equal(none.exit, EXIT.auth);
    assert.equal(none.out.error.code, "credential_required");
    const unknown = await cli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", join(dir, "u.json"), "--credential-file", credential("x".repeat(40), "unknown.credential"), ...loop(authority.origin)]);
    assert.equal(unknown.out.error.code, "unauthorized");
  } finally { await authority.close(); }
});

test("tenant: a cross-origin redirect is refused and the credential never reaches the other origin", async () => {
  const other = await startServer(async (req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  const authority = await startAuthority();
  try {
    const { dir, credential, input } = setup();
    authority.control.redirectTo = other.origin;
    const run = await cli(["gateway", "execute", "--route", "fixture.echo", "--input-file", input(), "--state-file", join(dir, "r.json"), "--credential-file", credential(), ...loop(authority.origin)]);
    assert.equal(run.out.error.code, "origin_refused");
    assert.equal(other.requests.length, 0);
    assert.equal(existsSync(join(dir, "r.json")), false);
  } finally { await authority.close(); await other.close(); }
});
