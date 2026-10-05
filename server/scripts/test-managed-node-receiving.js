import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink, link, chmod, appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runBounded } from "../foundry/bounded-child.mjs";
import { download, installWheel, materializeReferenceRuntime } from "../foundry/materialize-runtime.mjs";
import { collectProbe } from "../foundry/managed-node-probe.mjs";
import { materializePrivateProfiles } from "../foundry/private-materialize.js";
import { readPrivateJson } from "../foundry/private-files.js";
import { appendSslRootCert, verifiedFoundryDatabaseUrl } from "../foundry/pg-tls.js";
import { inspectCorrespondenceEnv } from "../lib/correspondence-mount.js";
import { packageModule, bindingFor } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/example/package.mjs";
import { invoke } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/supervisor.mjs";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const isolated = async (fn) => {
  const dir = await mkdtemp(path.join(tmpdir(), "sds-receive-100501-"));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};
const alive = pid => {
  try { const row = fs.readFileSync(`/proc/${pid}/stat`, "utf8"); return row.slice(row.lastIndexOf(") ") + 2)[0] !== "Z"; }
  catch { return false; }
};
const nodeChild = (script, options = {}) => runBounded(process.execPath, ["-e", script], { timeoutMs: 1000, ...options });

test("setup drains noisy stdout and stderr without retaining or exposing stderr", async () => {
  const result = await nodeChild("process.stdout.write(Buffer.alloc(512*1024)); process.stderr.write(Buffer.alloc(512*1024));", { outputLimit: 2*1024*1024 });
  assert.equal(result.code, 0); assert.equal(result.reason, null); assert.equal(result.stdout, "");
  assert.equal(alive(result.pid), false);
});
for (const [name, script, reason, options] of [
  ["hang", "setInterval(()=>{},1000)", "deadline", { timeoutMs: 100 }],
  ["stdout overflow", "process.stdout.write(Buffer.alloc(100000));setInterval(()=>{},1000)", "stdout_limit", { capture: true, stdoutLimit: 256 }],
  ["stderr overflow", "process.stderr.write(Buffer.alloc(100000));setInterval(()=>{},1000)", "output_limit", { outputLimit: 256 }],
  ["input disconnect", "require('node:fs').closeSync(0);setInterval(()=>{},1000)", "input_disconnected", { input: Buffer.alloc(8*1024*1024) }],
]) test(`setup ${name} is bounded and its child exits`, async () => {
  const result = await nodeChild(script, options);
  assert.equal(result.reason, reason); assert.equal(result.exited, true); assert.equal(alive(result.pid), false);
  assert.equal(result.stdout, "");
});
test("setup nonzero/missing children return safe failure evidence", async () => {
  const result = await nodeChild("process.stderr.write('SECRET /private/file');process.exit(7)");
  assert.equal(result.code, 7); assert.equal(result.stdout, ""); assert.doesNotMatch(JSON.stringify(result), /SECRET|private/);
  assert.equal((await runBounded("/nonexistent/child", [])).reason, "spawn_failed");
});
test("setup cancellation and deadlines kill descendants with inherited pipes", async () => isolated(async dir => {
  const pidFile = path.join(dir, "descendant.pid");
  const script = `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});fs.writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000);`;
  const result = await nodeChild(script, { timeoutMs: 300 });
  const descendant = Number(await readFile(pidFile, "utf8"));
  assert.equal(result.reason, "deadline"); assert.equal(alive(result.pid), false); assert.equal(alive(descendant), false);
  const controller = new AbortController();
  const cancelled = await nodeChild("setInterval(()=>{},1000)", { signal: controller.signal, onSpawn: () => controller.abort() });
  assert.equal(cancelled.reason, "cancelled"); assert.equal(alive(cancelled.pid), false);
}));

test("download enforces the byte ceiling while streaming and cancels the body", async () => {
  const original = globalThis.fetch; let cancelled = false, reads = 0;
  globalThis.fetch = async () => ({ ok: true, headers: new Headers(), body: { getReader: () => ({
    async read() { reads++; return { done: false, value: new Uint8Array(700) }; }, async cancel() { cancelled = true; },
  }) }, arrayBuffer() { throw new Error("must not buffer an unbounded response"); } });
  try { await assert.rejects(download("https://installed.example", 1000), /runtime_download_failed/); }
  finally { globalThis.fetch = original; }
  assert.equal(reads, 2); assert.equal(cancelled, true);
});
test("download rejects oversized content-length without reading", async () => {
  const original = globalThis.fetch; let read = false, cancelled = false;
  globalThis.fetch = async () => ({ ok: true, headers: new Headers({ "content-length": "100000" }), body: { getReader: () => ({
    async read() { read = true; }, async cancel() { cancelled = true; },
  }) } });
  try { await assert.rejects(download("https://installed.example", 100), /runtime_download_failed/); }
  finally { globalThis.fetch = original; }
  assert.equal(read, false); assert.equal(cancelled, true);
});
test("download deadline and disconnected stream return secret-free failures", async () => {
  const original = globalThis.fetch;
  for (const mode of ["hang", "disconnect"]) {
    globalThis.fetch = async (_url, { signal }) => ({ ok: true, headers: new Headers(), body: { getReader: () => ({
      read() { return mode === "disconnect" ? Promise.reject(new Error("SECRET")) : new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("SECRET")), { once: true })); },
      async cancel() {},
    }) } });
    try { await assert.rejects(download("https://installed.example", 100, { timeoutMs: 30 }), e => e.message === "runtime_download_failed"); }
    finally { globalThis.fetch = original; }
  }
});

test("materializer terminates a noisy installed interpreter instead of deadlocking", async () => isolated(async dir => {
  const bin = path.join(dir, ".runtime/bin"); await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, "python"), `#!${process.execPath}\nprocess.stdout.write(Buffer.alloc(1024*1024));setInterval(()=>{},1000);`, { mode: 0o700 });
  await assert.rejects(materializeReferenceRuntime({ executionRoot: dir }), /runtime_child_output_limit/);
}));

test("materializer bounds a hanging readiness child and refuses nonzero partial runtime", async () => isolated(async dir => {
  const bin = path.join(dir, ".runtime/bin"); await mkdir(bin, { recursive: true });
  const file = path.join(bin, "python");
  await writeFile(file, `#!${process.execPath}\nsetInterval(()=>{},1000);`, { mode: 0o700 });
  await assert.rejects(materializeReferenceRuntime({ executionRoot: dir, childTimeoutMs: 100 }), /runtime_child_deadline/);
  await writeFile(file, `#!${process.execPath}\nprocess.stderr.write('SECRET');process.exit(9);`, { mode: 0o700 });
  await assert.rejects(materializeReferenceRuntime({ executionRoot: dir }), /runtime_incomplete/);
  assert.equal(fs.existsSync(file), true);
}));
test("purelib stdout/stderr discovery is bounded and refuses malformed/nonzero paths", async () => isolated(async dir => {
  const file = path.join(dir, "python");
  for (const [source, failure] of [
    ["process.stdout.write(Buffer.alloc(10000));setInterval(()=>{},1000)", /runtime_child_stdout_limit/],
    ["process.stderr.write(Buffer.alloc(200000));setInterval(()=>{},1000)", /runtime_child_output_limit/],
    ["setInterval(()=>{},1000)", /runtime_child_deadline/],
    ["process.stdout.write('/private/site\\n');process.exit(8)", /runtime_setup_failed/],
    ["process.stdout.write('/private/site\\n/other')", /runtime_setup_failed/],
  ]) {
    await writeFile(file, `#!${process.execPath}\n${source}\n`, { mode: 0o700 });
    await assert.rejects(installWheel(file, "/unused/pinned.whl", { timeoutMs: 200 }), failure);
  }
}));

test("managed diagnostics drain stderr, time out, and never print child secrets", async () => isolated(async dir => {
  const child = path.join(dir, "diagnostic");
  for (const [source, failure] of [
    ["/usr/bin/head -c 1048576 /dev/zero >&2\nexec /bin/sleep 30", "output_limit"],
    ["printf 'SECRET /private/file' >&2\nexec /bin/sleep 30", "deadline"],
    ["printf 'reference-executed\\n'\nexit 9", "execution_failed"],
  ]) {
    await writeFile(child, `#!/bin/sh\n${source}\n`, { mode: 0o700 });
    const report = await collectProbe({ pythonCommand: child, referencePython: child, timeoutMs: 150 });
    assert.equal(report.ok, false); assert.equal(report.referenceExecution, false);
    assert.equal(report.pythonFailure, failure); assert.equal(report.referenceFailure, failure);
    assert.doesNotMatch(JSON.stringify(report), /SECRET|\/private\/file|sds-receive/);
  }
}));

function fixtureCa() {
  const result = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "/dev/null", "-days", "1", "-subj", "/CN=Original fixture CA", "-addext", "basicConstraints=critical,CA:TRUE"], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0);
  return result.stdout;
}
const payloads = {
  FOUNDRY_HOST_PROFILE_JSON: '{"id":"original"}',
  FOUNDRY_PRIVATE_PROFILE_JSON: '{"id":"private-original"}',
  FOUNDRY_PARTICIPATION_KEY: "original-participation-key-32-characters",
  FOUNDRY_PGSSL_CA_PEM: fixtureCa(),
};
const differentCa = fixtureCa();
test("private JSON/key/CA replay checks content with implicit and explicit filenames", async () => isolated(async dir => {
  const env = { FOUNDRY_PRIVATE_DIR: dir, ...payloads };
  const first = materializePrivateProfiles(env, { repoRoot });
  assert.deepEqual(materializePrivateProfiles(env, { repoRoot }).wrote, []);
  for (const key of Object.keys(payloads)) for (const explicit of [false, true]) {
    const before = Object.fromEntries(Object.values(first.assigned).map(file => [file, fs.readFileSync(file, "utf8")]));
    assert.throws(() => materializePrivateProfiles({ ...env, ...(explicit ? first.assigned : {}), [key]: key === "FOUNDRY_PGSSL_CA_PEM" ? differentCa : payloads[key].replace("original", "different") }, { repoRoot }), /private_content_mismatch/);
    for (const [file, bytes] of Object.entries(before)) assert.equal(await readFile(file, "utf8"), bytes);
  }
}));
test("private materialization never chmods a linked public directory or writes through ancestors", async () => isolated(async dir => {
  const publicDir = path.join(dir, "public_html"); await mkdir(publicDir, { mode: 0o755 });
  const linked = path.join(dir, "linked"); await symlink(publicDir, linked);
  for (const destination of [publicDir, linked, path.join(linked, "nested")]) {
    assert.throws(() => materializePrivateProfiles({ FOUNDRY_PRIVATE_DIR: destination, FOUNDRY_HOST_PROFILE_JSON: payloads.FOUNDRY_HOST_PROFILE_JSON }, { repoRoot }));
    assert.equal((await stat(publicDir)).mode & 0o777, 0o755);
    assert.deepEqual(fs.readdirSync(publicDir), []);
  }
}));
test("private reads and replay refuse file links, hardlinks, FIFOs, and unsafe modes", async () => isolated(async dir => {
  const target = path.join(dir, "target.json"), file = path.join(dir, "host-profile.json");
  await writeFile(target, payloads.FOUNDRY_HOST_PROFILE_JSON, { mode: 0o600 });
  const env = { FOUNDRY_PRIVATE_DIR: dir, FOUNDRY_HOST_PROFILE_JSON: payloads.FOUNDRY_HOST_PROFILE_JSON };
  await symlink(target, file);
  assert.throws(() => materializePrivateProfiles(env, { repoRoot })); assert.throws(() => readPrivateJson(file));
  await rm(file); await link(target, file);
  assert.throws(() => materializePrivateProfiles(env, { repoRoot }), /private_input_not_file/);
  await rm(file); assert.equal(spawnSync("mkfifo", [file]).status, 0);
  assert.throws(() => materializePrivateProfiles(env, { repoRoot }), /private_input_not_file/);
  await rm(file); await writeFile(file, payloads.FOUNDRY_HOST_PROFILE_JSON, { mode: 0o644 });
  assert.throws(() => materializePrivateProfiles(env, { repoRoot }), /private_input_mode/);
  assert.equal((await stat(file)).mode & 0o777, 0o644);
  await chmod(dir, 0o755); assert.throws(() => materializePrivateProfiles(env, { repoRoot }), /private_dir_mode/);
  assert.equal((await stat(dir)).mode & 0o777, 0o755);
}));
test("private invalid later payload creates no partial secrets", async () => isolated(async dir => {
  assert.throws(() => materializePrivateProfiles({ FOUNDRY_PRIVATE_DIR: dir, ...payloads, FOUNDRY_PRIVATE_PROFILE_JSON: "invalid" }, { repoRoot }), /private_profile_json_invalid/);
  assert.deepEqual(fs.readdirSync(dir), []);
}));
test("private malformed CA creates no files", async () => isolated(async dir => {
  assert.throws(() => materializePrivateProfiles({ FOUNDRY_PRIVATE_DIR: dir, ...payloads, FOUNDRY_PGSSL_CA_PEM: "-----BEGIN CERTIFICATE-----invalid" }, { repoRoot }), /pg_ca_unreadable/);
  assert.deepEqual(fs.readdirSync(dir), []);
}));
test("private write failure removes only this invocation's new files", async () => isolated(async dir => {
  const existing = path.join(dir, "private-profile.json"); await writeFile(existing, payloads.FOUNDRY_PRIVATE_PROFILE_JSON, { mode: 0o600 });
  const original = fs.writeFileSync; let writes = 0;
  fs.writeFileSync = function(...args) { if (typeof args[0] === "number" && ++writes === 2) throw Object.assign(new Error("SECRET"), { code: "ENOSPC" }); return original.apply(this, args); };
  syncBuiltinESMExports();
  try { assert.throws(() => materializePrivateProfiles({ FOUNDRY_PRIVATE_DIR: dir, ...payloads }, { repoRoot }), e => e.message === "private_materialize_failed"); }
  finally { fs.writeFileSync = original; syncBuiltinESMExports(); }
  assert.deepEqual(fs.readdirSync(dir), ["private-profile.json"]);
  assert.equal(await readFile(existing, "utf8"), payloads.FOUNDRY_PRIVATE_PROFILE_JSON);
}));
test("private file reads bound allocation before loading oversized JSON", async () => isolated(async dir => {
  const file = path.join(dir, "big.json"); await writeFile(file, Buffer.alloc(65537), { mode: 0o600 });
  assert.throws(() => readPrivateJson(file), /private_input_size/);
}));

test("optional foundry CA never changes the pg constructor or product/Pulse configuration", async () => {
  const Pool = pg.Pool;
  assert.throws(() => verifiedFoundryDatabaseUrl("postgres://foundry@db.invalid/app?sslmode=verify-full", { CORRESPONDENCE_PGSSL_CA_FILE: "/missing" }), /pg_ca_unreadable/);
  for (const url of ["postgres://product@db.invalid/app", "postgres://pulse@db.invalid/pulse?sslmode=verify-full"]) {
    const pool = new pg.Pool({ connectionString: url }); assert.equal(pool.options.connectionString, url); await pool.end();
  }
  assert.equal(pg.Pool, Pool);
  assert.equal(inspectCorrespondenceEnv({ CORRESPONDENCE_PGSSL_CA_FILE: "/missing" }).kind, "unconfigured");
});
test("configured CA requires verify-full and refuses conflicting TLS options", () => {
  const base = "postgres://foundry@db.invalid/app";
  for (const query of ["", "?sslmode=require", "?sslmode=no-verify", "?sslmode=verify-full&sslmode=disable", "?sslmode=verify-full&uselibpqcompat=true", "?sslmode=verify-full&ssl=false"]) {
    assert.throws(() => appendSslRootCert(base + query, "/private/ca.pem"), /pg_tls_verify_full_required/);
  }
  assert.throws(() => appendSslRootCert(base + "?sslmode=verify-full&sslrootcert=%2Fother.pem", "/private/ca.pem"), /pg_ca_conflict/);
  for (const url of ["postgres://foundry@127.0.0.1/app", "postgres://foundry@[::1]/app", "postgres:///app", base + "?host=127.0.0.1"]) {
    const separator = url.includes("?") ? "&" : "?";
    assert.throws(() => appendSslRootCert(url + separator + "sslmode=verify-full", "/private/ca.pem"), /pg_tls_hostname_required/);
  }
});

function openssl(dir, args) {
  const run = spawnSync("openssl", args, { cwd: dir, encoding: "utf8", timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
}
test("real PostgreSQL TLS retains certificate-chain and hostname verification", async () => isolated(async dir => {
  openssl(dir, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=Receive test CA", "-addext", "basicConstraints=critical,CA:TRUE"]);
  openssl(dir, ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=localhost"]);
  await writeFile(path.join(dir, "extensions"), "subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\n");
  openssl(dir, ["x509", "-req", "-in", "server.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.pem", "-days", "1", "-extfile", "extensions"]);
  openssl(dir, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "other.key", "-out", "other.pem", "-days", "1", "-subj", "/CN=Wrong CA", "-addext", "basicConstraints=critical,CA:TRUE"]);
  for (const file of ["ca.pem", "other.pem", "server.key"]) await chmod(path.join(dir, file), 0o600);
  const cluster = await startDisposablePg();
  const bin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(d => fs.existsSync(path.join(d, "pg_ctl")));
  try {
    await appendFile(path.join(cluster.dir, "pg/postgresql.conf"), `\nssl=on\nssl_cert_file='${dir}/server.pem'\nssl_key_file='${dir}/server.key'\n`);
    assert.equal(spawnSync(path.join(bin, "pg_ctl"), ["-D", path.join(cluster.dir, "pg"), "reload"]).status, 0);
    // Wait until reload has enabled TLS rather than relying on a fixed sleep.
    let enabled = false;
    for (let i = 0; i < 20; i++) {
      const client = new pg.Client({ connectionString: cluster.url }); await client.connect();
      try { enabled = (await client.query("SHOW ssl")).rows[0].ssl === "on"; } finally { await client.end(); }
      if (enabled) break;
      await new Promise(r => setTimeout(r, 25));
    }
    assert.equal(enabled, true);
    const good = cluster.url.replace("127.0.0.1", "localhost") + "?sslmode=verify-full";
    assert.throws(() => verifiedFoundryDatabaseUrl(good, { CORRESPONDENCE_PGSSL_CA_FILE: path.join(dir, "ca.pem"), NODE_TLS_REJECT_UNAUTHORIZED: "0" }), /pg_tls_verification_disabled/);
    const client = new pg.Client({ connectionString: verifiedFoundryDatabaseUrl(good, { CORRESPONDENCE_PGSSL_CA_FILE: path.join(dir, "ca.pem") }) });
    await client.connect();
    try { assert.equal((await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0].ssl, true); } finally { await client.end(); }
    for (const [url, ca, expected] of [[good, "other.pem", /certificate|issuer|verify/i]]) {
      const bad = new pg.Client({ connectionString: verifiedFoundryDatabaseUrl(url, { CORRESPONDENCE_PGSSL_CA_FILE: path.join(dir, ca) }), connectionTimeoutMillis: 2000 });
      try { await assert.rejects(bad.connect(), expected); } finally { await bad.end().catch(() => {}); }
    }
    assert.throws(() => verifiedFoundryDatabaseUrl(cluster.url+"?sslmode=verify-full", { CORRESPONDENCE_PGSSL_CA_FILE: path.join(dir, "ca.pem") }), /pg_tls_hostname_required/);
    await writeFile(path.join(dir, "extensions"), "subjectAltName=DNS:wrong-host.example\nbasicConstraints=CA:FALSE\n");
    openssl(dir, ["x509", "-req", "-in", "server.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "wrong-server.pem", "-days", "1", "-extfile", "extensions"]);
    await appendFile(path.join(cluster.dir, "pg/postgresql.conf"), `\nssl_cert_file='${dir}/wrong-server.pem'\n`);
    // Restart only this disposable cluster to witness the changed certificate.
    assert.equal(spawnSync(path.join(bin, "pg_ctl"), ["-D", path.join(cluster.dir, "pg"), "-l", path.join(cluster.dir, "pg.log"), "-w", "restart"]).status, 0);
    const mismatch = new pg.Client({ connectionString: verifiedFoundryDatabaseUrl(good, { CORRESPONDENCE_PGSSL_CA_FILE: path.join(dir, "ca.pem") }), connectionTimeoutMillis: 2000 });
    try { await assert.rejects(mismatch.connect(), /hostname|altnames/i); } finally { await mismatch.end().catch(() => {}); }
  } finally { await cluster.stop(); }
}));

test("removed runtime selector cannot silently rename or load the sealed profile", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, "server/foundry/wasmtime49-embed")), false);
  const result = spawnSync(process.execPath, ["server/foundry/worker.mjs", "dispatch", "fixture"], {
    cwd: repoRoot, env: { PATH: process.env.PATH, FOUNDRY_EXECUTION_RUNTIME: "wasmtime49-embed", FOUNDRY_HOST_OPT_IN: "1" }, encoding: "utf8", timeout: 2000,
  });
  assert.equal(result.status, 2); assert.match(result.stderr, /runtime_selection_unsupported/);
});

test("sealed invocation witnesses compile/instantiate/execute for changed input and rejects mixed pins before spawn", async () => {
  const execution = path.join(repoRoot, "vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution");
  const built = spawnSync(process.execPath, ["example/build.mjs"], { cwd: execution, encoding: "utf8", timeout: 10000 });
  assert.equal(built.status, 0, built.stderr);
  const moduleBytes = await readFile(path.join(execution, ".build/structured-result.wasm"));
  const artifact = packageModule(moduleBytes, { sourceRevision: "0e491bc5307b32a40a1117752859b0ad45db5013" });
  const binding = bindingFor(artifact);
  const inputs = [{ structuredContent: { value: "alpha" } }, { structuredContent: { value: "beta" } }, { content: [] }];
  const outputs = [];
  for (const input of inputs) {
    const result = await invoke({ artifact, moduleBytes, input, binding });
    assert.equal(result.observation.status, "ok");
    assert.deepEqual(result.observation.phasesObserved.map(p => p.phase), ["compile", "instantiate", "execute"]);
    assert.equal(result.observation.termination.exited, true); assert.equal(result.observation.termination.code, 0);
    assert.equal(alive(result.observation.processIdentity.pid), false);
    outputs.push(result.output);
  }
  assert.equal(outputs[0].payload.value, "alpha"); assert.equal(outputs[1].payload.value, "beta"); assert.equal(outputs[2].outcome, "unsupported");
  let launches = 0;
  const onSpawn = () => launches++;
  for (const changes of [
    { moduleBytes: Buffer.from("changed") },
    { artifact: { ...artifact, profile: { ...artifact.profile, runtime: "wasmtime-capi" } } },
    { binding: { ...binding, moduleDigest: "sha256:"+"a".repeat(64) } },
    { artifact: { ...artifact, limits: { ...artifact.limits, moduleBytes: 1000000 } } },
  ]) await assert.rejects(invoke({ artifact, moduleBytes, input: inputs[0], binding, onSpawn, ...changes }));
  assert.equal(launches, 0);
});

test("SIGTERM on a diagnostic parent kills and reaps its owned child group", async () => isolated(async dir => {
  const script = path.join(dir, "parent.mjs"), pidFile = path.join(dir, "pid");
  await writeFile(script, `import fs from 'node:fs';import {runBounded} from ${JSON.stringify(path.join(repoRoot, "server/foundry/bounded-child.mjs"))};const result=await runBounded(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:10000,onSpawn:pid=>{fs.writeFileSync(${JSON.stringify(pidFile)},String(pid));process.kill(process.pid,'SIGTERM')}});console.log(JSON.stringify(result));`);
  const result = await runBounded(process.execPath, [script], { capture: true, timeoutMs: 2000 });
  assert.equal(result.code, 0); assert.equal(JSON.parse(result.stdout).reason, "interrupted");
  assert.equal(alive(Number(await readFile(pidFile, "utf8"))), false);
}));
