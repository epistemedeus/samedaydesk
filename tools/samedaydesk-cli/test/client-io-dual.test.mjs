// The same CLI behavior against both client-io versions: pinned
// (samedaydesk@32437117, in-tree) and repaired (draft PR #398 @7f270b23,
// byte-exact fixture). Injected fetch only; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as pinned from "../../../server/vendor/machine-gateway/bin/client-io.mjs";
import * as repaired from "./fixtures/client-io-7f270b23.mjs";
import { capabilitiesOf, createTransport } from "../src/transport.mjs";
import { EXIT } from "../src/errors.mjs";
import { json, run, REPORT } from "./helpers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSIONS = [["pinned", pinned], ["repaired", repaired]];
const refusal = code => json(400, { ok: false, code, message: "refused" });
const hang = (url, init) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true }));

test("repaired fixture bytes match FIXTURES.json and src never imports it", () => {
  const fixtures = JSON.parse(readFileSync(join(root, "test/fixtures/FIXTURES.json"), "utf8"));
  for (const file of fixtures.files) {
    const bytes = readFileSync(join(root, file.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    const blob = execFileSync("git", ["hash-object", "--stdin"], { input: bytes, encoding: "utf8" }).trim();
    assert.equal(blob, file.gitBlob);
  }
  for (const name of ["cli.mjs", "transport.mjs", "index.mjs", "manifest.mjs", "errors.mjs", "generate.mjs"]) {
    assert.ok(!readFileSync(join(root, "src", name), "utf8").includes("fixtures/"), name);
  }
  assert.deepEqual(capabilitiesOf(pinned), { version: "pinned", structuredErrors: false, abortSignal: false });
  assert.deepEqual(capabilitiesOf(repaired), { version: "repaired", structuredErrors: true, abortSignal: true });
});

for (const [version, clientIo] of VERSIONS) {
  test(`${version}: success, typed cursor codes, unknown server codes surfaced, no cursor retry`, async () => {
    const ok = await run(["readiness", "check", "--host", "example.com"], { clientIo, answers: [json(200, REPORT)] });
    assert.equal(ok.exit, EXIT.ok);
    for (const code of ["cursor_refused", "cursor_malformed", "cursor_unrecognized"]) {
      const direct = await run(["market", "discover", "--cursor", "mc1.x.y"], { clientIo, answers: [refusal(code)] });
      assert.equal(direct.exit, EXIT.input, code);
      assert.equal(direct.calls.length, 1, `${code} not retried`);
      const error = direct.out[0].error;
      assert.equal(error.code, code);
      assert.equal(error.nextAction, "market discover (restart without --cursor)");
      assert.equal(error.evidence.server.code, code);
      assert.equal(error.evidence.clientIo, version);
      assert.equal(error.evidence.recovery, "remote_refused");
      assert.equal(error.evidence.recoverySource, version === "repaired" ? "client-io" : "cli-inferred");
      if (version === "pinned") assert.deepEqual(error.evidence.server.body, { ok: false, code, message: "refused" });
      const page = json(200, { ok: true, value: { items: [{ taskId: "t1" }], nextCursor: "mc1.a.b" } });
      const streamed = await run(["market", "discover", "--stream", "--limit", "1"], { clientIo, answers: [page, refusal(code)] });
      const end = streamed.out.at(-1);
      assert.equal(end.error.code, code);
      assert.equal(end.resumeCursor, null);
      assert.equal(end.restartWithoutCursor, true);
    }
    const unknown = await run(["market", "discover"], { clientIo, answers: [refusal("brand_new_code")] });
    assert.equal(unknown.out[0].error.code, "http_refused");
    assert.equal(unknown.out[0].error.evidence.server.code, "brand_new_code", "a server code is never hidden");
  });

  test(`${version}: 5xx retries GET then reports unavailable with recovery sent_unconfirmed`, async () => {
    const down = () => json(503, { ok: false, code: "maintenance" });
    const { exit, out, calls } = await run(["market", "profile"], { clientIo, answers: [down(), down(), down()] });
    assert.equal(exit, EXIT.unavailable);
    assert.equal(calls.length, 3);
    assert.equal(out[0].error.evidence.recovery, "sent_unconfirmed");
    assert.equal(out[0].error.evidence.server.code, "maintenance");
  });

  test(`${version}: POST failure is not retried and keeps the client-io recovery class`, async () => {
    const { exit, out, calls } = await run(["gateway", "test", "--route", "lockfile.delta"], { clientIo, answers: [json(503, { ok: false })] });
    assert.equal(exit, EXIT.unavailable);
    assert.equal(calls.length, 1);
    assert.equal(out[0].error.evidence.recovery, "sent_unconfirmed");
  });

  test(`${version}: cancellation exits 130 with an honest recovery class`, async () => {
    const before = new AbortController();
    before.abort();
    const early = await run(["market", "profile"], { clientIo, signal: before.signal, answers: [json(200, {})] });
    assert.equal(early.exit, 130);
    assert.equal(early.calls.length, 0);
    assert.equal(early.out[0].error.code, "cancelled");
    assert.equal(early.out[0].error.evidence.recovery, "not_sent");

    const during = new AbortController();
    setTimeout(() => during.abort(Object.assign(new Error("interrupted"), { name: "AbortError" })), 20);
    const late = await run(["market", "profile"], { clientIo, signal: during.signal, answers: [hang] });
    assert.equal(late.exit, 130);
    assert.equal(late.calls.length, 1, "a cancelled GET is not retried");
    assert.equal(late.out[0].error.code, "cancelled");
    assert.equal(late.out[0].error.evidence.recovery, "sent_unconfirmed");
    assert.equal(late.out[0].error.evidence.abortSupported, version === "repaired");
  });
}

test("request_timeout is typed for both versions", async () => {
  const original = globalThis.fetch;
  const keepAlive = setInterval(() => {}, 1000); // AbortSignal.timeout timers do not hold the loop
  try {
    // Repaired: its own timeout fires (short timeoutMs through the transport).
    globalThis.fetch = hang;
    const structured = createTransport(repaired, { timeoutMs: 30 });
    await assert.rejects(structured.call("https://samedaydesk.com", "/x", { retry: { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 } }),
      error => error.code === "request_timeout" && error.evidence.clientIoCode === "request_timeout" && error.evidence.recovery === "sent_unconfirmed");
    // Pinned: its 15 s AbortSignal.timeout surfaces as a TimeoutError from fetch.
    globalThis.fetch = async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); };
    const legacy = createTransport(pinned);
    await assert.rejects(legacy.call("https://samedaydesk.com", "/x", { retry: { attempts: 1, baseDelayMs: 0, maxDelayMs: 0 } }),
      error => error.code === "request_timeout" && error.evidence.clientIo === "pinned");
  } finally { globalThis.fetch = original; clearInterval(keepAlive); }
});

test("bin: SIGINT during a request exits 130 with a cancelled envelope", async () => {
  const server = createServer(() => {}); // never answers
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  try {
    const child = spawn(process.execPath, [join(root, "bin/samedaydesk.mjs"), "market", "profile", "--origin", `http://127.0.0.1:${port}`, "--allow-loopback"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    await new Promise(resolveWait => setTimeout(resolveWait, 400));
    child.kill("SIGINT");
    const code = await new Promise(resolveExit => child.on("exit", resolveExit));
    assert.equal(code, 130);
    const envelope = JSON.parse(stdout.trim().split("\n")[0]);
    assert.equal(envelope.error.code, "cancelled");
    assert.equal(envelope.error.exit, 130);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
