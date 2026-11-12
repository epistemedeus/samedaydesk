// The tenant journey against the actual machine-gateway handlers at this
// release head (MachineGateway + SqliteStore + createHttpHandler from
// server/vendor/machine-gateway/src), with a local echo route and an unsigned
// local tenant. It needs the gateway's own dependencies (ajv), which are
// installed by the repository's normal `npm ci`; without them the test is
// skipped with that reason. It proves client behavior against the real
// handlers and store, not live hosted or funded execution.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { spawnCli } from "./server-fixture.mjs";

const CALLER = fileURLToPath(new URL("../../../server/vendor/machine-gateway/bin/caller.mjs", import.meta.url));

const GATEWAY = "../../../server/vendor/machine-gateway/src";
let mods = null;
let skip = false;
try {
  const [index, util, schemas] = await Promise.all([import(`${GATEWAY}/index.mjs`), import(`${GATEWAY}/util.mjs`), import(`${GATEWAY}/schemas.mjs`)]);
  mods = { ...index, ...util, ...schemas };
} catch (error) { skip = `machine-gateway dependencies not installed here (${error?.code ?? "import failed"}); run after the repository's npm ci`; }

const TOKEN = "local_unsigned_tenant_a_credential_000001";

async function realGateway() {
  const dir = mkdtempSync(join(tmpdir(), "sds-cli-real-gateway-"));
  const route = { id: "fixture.echo", version: "1", provider: "unsigned-local-fixture", description: "Local test handler", price: { amount: 0, unit: "usd-micros" },
    timeoutMs: 2000, maxOutputBytes: 4096, inputSchema: mods.object({ value: mods.text(128) }), outputSchema: mods.object({ value: mods.text(128) }),
    run: async input => ({ value: input.value }), test: () => ({ value: "fixture" }) };
  const store = new mods.SqliteStore(join(dir, "gateway.sqlite"));
  const gateway = new mods.MachineGateway({ store, registry: new mods.RouteRegistry([route]), environment: "test",
    tenants: [{ id: "tenant-a", tokenSha256: mods.sha256(TOKEN), routes: ["fixture.echo"], maxUnits: 0, maxCalls: 100, maxConcurrent: 2 }] });
  const handler = mods.createHttpHandler(gateway);
  const control = { loseNextExecuteResponse: false };
  const server = createServer((req, res) => {
    if (control.loseNextExecuteResponse && req.url.endsWith("/v1/execute")) {
      control.loseNextExecuteResponse = false;
      // The handler commits, then its reply is lost on the wire.
      res.writeHead = () => res;
      res.end = () => { req.socket.destroy(); return res; };
    }
    handler(req, res);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const credential = join(dir, "tenant.credential");
  writeFileSync(credential, `${TOKEN}\n`); chmodSync(credential, 0o600);
  const input = join(dir, "input.json");
  writeFileSync(input, JSON.stringify({ value: "real" }));
  return { dir, origin, credential, input, control, commits: () => store.db.prepare("SELECT count(*) AS n FROM attempts").get().n,
    close: async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); store.close(); } };
}

test("real gateway handlers: quote, execute, result; lost committed response recovered by resume in a fresh process", { skip }, async () => {
  const g = await realGateway();
  try {
    const loop = ["--origin", g.origin, "--allow-loopback", "--credential-file", g.credential];
    const ok = spawnCli(["gateway", "execute", "--route", "fixture.echo", "--input-file", g.input, "--state-file", join(g.dir, "ok.json"), ...loop]);
    assert.equal((await ok.exited).code, 0, ok.stdout());
    assert.deepEqual(ok.lines()[0].result.output, { value: "real" });
    assert.equal(g.commits(), 1);
    // The direct client (bin/caller.mjs) resumes the CLI's state file: same caller-state v1.
    const caller = await new Promise(done => execFile(process.execPath, [CALLER, "--base-url", `${g.origin}/api/machine-gateway`, "--token-file", g.credential, "--state-file", join(g.dir, "ok.json"), "--resume", "--allow-loopback"],
      { encoding: "utf8" }, (error, stdout, stderr) => done({ status: error ? error.code : 0, stdout, stderr })));
    assert.equal(caller.status, 0, caller.stderr);
    assert.equal(JSON.parse(caller.stdout).status, "completed");
    assert.equal(g.commits(), 1, "the direct client read back; nothing ran again");
    g.control.loseNextExecuteResponse = true;
    const lost = spawnCli(["gateway", "execute", "--route", "fixture.echo", "--input-file", g.input, "--state-file", join(g.dir, "lost.json"), ...loop]);
    assert.equal((await lost.exited).code, 2, lost.stdout());
    assert.equal(lost.lines()[0].error.evidence.recovery, "sent_unconfirmed");
    assert.equal(g.commits(), 2, "the server committed the second execution");
    const resumed = spawnCli(["gateway", "resume", "--state-file", join(g.dir, "lost.json"), ...loop]);
    assert.equal((await resumed.exited).code, 0, resumed.stdout());
    assert.equal(resumed.lines()[0].result.receipt.status, "completed");
    assert.equal(g.commits(), 2, "resume was answered from the stored receipt");
    const state = JSON.parse(readFileSync(join(g.dir, "lost.json"), "utf8"));
    assert.equal(state.schema, "neomorphic.machine-gateway.caller-state.v1");
  } finally { await g.close(); }
});
