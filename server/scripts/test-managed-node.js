import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROFILE } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/contracts.mjs";
import { superviseProcess } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/supervisor.mjs";
import { materializeReferenceRuntime } from "../foundry/materialize-runtime.mjs";
import { collectProbe } from "../foundry/managed-node-probe.mjs";
import { materializePrivateProfiles } from "../foundry/private-materialize.js";
import { hostInputsFromEnv } from "../foundry/private-files.js";
import { foundryHostOptIn } from "../foundry/opt-in.js";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const executionRoot = path.join(repoRoot, "vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution");
const python = path.join(executionRoot, ".runtime/bin/python");
const pythonChild = path.join(executionRoot, "src/child.py");
const linker = "/usr/local/rustup/toolchains/1.83.0-x86_64-unknown-linux-gnu/lib/rustlib/x86_64-unknown-linux-gnu/bin/gcc-ld/wasm-ld";

const LIMITS = {
  moduleBytes: 262144, inputBytes: 16384, outputBytes: 32768,
  memoryBytes: 262144, tableElements: 128, stackBytes: 65536, fuel: 1_000_000,
  compileMs: 1500, instantiateMs: 500, executeMs: 500, wallMs: 4000,
  addressSpaceBytes: 536870912, cpuSeconds: 2, hostStackBytes: 8388608,
  fileBytes: 1048576, openFiles: 32,
};

function digestOf(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function spawnCollected(command, args, input, env = { LANG: "C", LC_ALL: "C" }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, cwd: "/", stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => { stdout += buf; });
    child.stderr.on("data", (buf) => { stderr += buf; });
    child.once("error", (error) => resolve({ code: null, stdout, stderr, error: error.code || "spawn_error" }));
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    child.once("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    if (input == null) child.stdin.end();
    else child.stdin.end(input);
  });
}

function resultLine(stdout) {
  const lines = stdout.trim().split("\n").filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

function pythonLaunch(limits) {
  return ["/usr/bin/prlimit", [
    `--as=${limits.addressSpaceBytes}:${limits.addressSpaceBytes}`,
    `--cpu=${limits.cpuSeconds}:${limits.cpuSeconds}`,
    `--stack=${limits.hostStackBytes}:${limits.hostStackBytes}`,
    `--fsize=${limits.fileBytes}:${limits.fileBytes}`,
    `--nofile=${limits.openFiles}:${limits.openFiles}`,
    "--core=0:0", "--", python, "-I", "-B", pythonChild,
  ]];
}

async function referenceResult(moduleBytes, input, limits = LIMITS) {
  const payload = JSON.stringify({
    module: Buffer.from(moduleBytes).toString("base64"), moduleDigest: digestOf(moduleBytes),
    input: Buffer.from(input).toString("base64"), limits,
  }) + "\n";
  const reference = await spawnCollected(...pythonLaunch(limits), payload);
  return { reference: resultLine(reference.stdout) };
}

function compileC(source, pages = 2) {
  const dir = mkdtempSync(path.join(tmpdir(), "sds-reference-guest-"));
  const input = path.join(dir, "guest.c");
  const object = path.join(dir, "guest.o");
  const output = path.join(dir, "guest.wasm");
  writeFileSync(input, source);
  const compiled = spawnSync("clang", ["--target=wasm32", "-O2", "-nostdlib", "-ffreestanding", "-c", input, "-o", object], { encoding: "utf8" });
  assert.equal(compiled.status, 0, compiled.stderr);
  const bytes = pages * 65536;
  const linked = spawnSync(linker, [
    "--no-entry", "--allow-undefined", "--export=alloc", "--export=transform", "--export-memory",
    `--initial-memory=${bytes}`, `--max-memory=${bytes}`, object, "-o", output,
  ], { encoding: "utf8" });
  assert.equal(linked.status, 0, linked.stderr);
  const wasm = readFileSync(output);
  rmSync(dir, { recursive: true, force: true });
  return wasm;
}

test("reference profile stays the sealed wasmtime-py pin", () => {
  assert.equal(PROFILE.id, "vf08.wasmtime49-linux-x64-fixed.v1");
  assert.equal(PROFILE.runtime, "wasmtime-py");
  assert.equal(PROFILE.version, "49.0.0");
});

test("default opt-in stays off", () => {
  assert.equal(foundryHostOptIn({}), false);
  assert.equal(foundryHostOptIn({ FOUNDRY_HOST_OPT_IN: "0" }), false);
});

test("private files are materialized outside the repo and JSON stays off the listener", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sds-private-"));
  const env = {
    FOUNDRY_PRIVATE_DIR: dir,
    FOUNDRY_HOST_PROFILE_JSON: "{\"id\":\"host:test\",\"maxAdmissions\":1,\"maxPhysical\":1}",
    FOUNDRY_PARTICIPATION_KEY: "participation-key-for-managed-node-test",
    FOUNDRY_PRIVATE_PROFILE_JSON: "{\"id\":\"vf10:private-test\"}",
  };
  const first = materializePrivateProfiles(env, { repoRoot });
  assert.deepEqual(first.wrote.sort(), ["host-profile.json", "participation.key", "private-profile.json"]);
  const second = materializePrivateProfiles({ ...env, ...first.assigned }, { repoRoot });
  assert.deepEqual(second.wrote, []);
  const mode = (await import("node:fs")).statSync(first.assigned.FOUNDRY_HOST_PROFILE_FILE).mode & 0o777;
  assert.equal(mode, 0o600);
  assert.equal((await import("node:fs")).statSync(dir).mode & 0o077, 0);
  assert.equal(hostInputsFromEnv({ ...first.assigned, FOUNDRY_HOST_PROFILE_JSON: "{\"id\":\"x\"}" }).reason, "profile_json_in_listener");
  assert.throws(() => materializePrivateProfiles({
    FOUNDRY_PRIVATE_DIR: path.join(dir, "public_html"),
    FOUNDRY_HOST_PROFILE_JSON: env.FOUNDRY_HOST_PROFILE_JSON,
  }, { repoRoot }), /private_path_refused/);
  assert.throws(() => materializePrivateProfiles({
    FOUNDRY_PRIVATE_DIR: path.join(repoRoot, "secrets"),
    FOUNDRY_HOST_PROFILE_JSON: env.FOUNDRY_HOST_PROFILE_JSON,
  }, { repoRoot }), /private_path_refused/);
  await rm(dir, { recursive: true, force: true });
});

test("product database url is refused before connect", () => {
  const result = spawnSync(process.execPath, ["server/foundry/install.mjs", "--migrate", "--install"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH || "",
      CORRESPONDENCE_DATABASE_URL: "postgres://postgres:pw@db.arvmcttdegqwiwdaembr.supabase.co:5432/postgres",
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /correspondence_reuses_product_data_service/);
  assert.doesNotMatch(result.stderr, /arvmcttdegqwiwdaembr/);
});

test("reference child enforces fuel, memory, imports, output, and malformed-module limits", async () => {
  const echo = compileC(`
    __attribute__((export_name("alloc"))) unsigned alloc(unsigned n) { return 0; }
    __attribute__((export_name("transform"))) unsigned long long transform(unsigned p, unsigned n) {
      return ((unsigned long long)n << 32) | p;
    }
    unsigned char guest_memory[1];
  `, 2);
  const first = await referenceResult(echo, Buffer.from("alpha"));
  const second = await referenceResult(echo, Buffer.from("beta"));
  assert.equal(first.reference.result.status, "ok");
  assert.equal(Buffer.from(first.reference.result.output, "base64").toString(), "alpha");
  assert.notEqual(second.reference.result.output, first.reference.result.output);

  const fuelLimits = { ...LIMITS, fuel: 2000, executeMs: 2000, wallMs: 4000 };
  const loop = compileC(`
    static volatile unsigned spin;
    __attribute__((export_name("alloc"))) unsigned alloc(unsigned n) { return 0; }
    __attribute__((export_name("transform"))) unsigned long long transform(unsigned p, unsigned n) {
      while (spin == 0) {}
      return 0;
    }
    unsigned char guest_memory[1];
  `, 2);
  const fuel = await referenceResult(loop, Buffer.from("x"), fuelLimits);
  assert.equal(fuel.reference.result.status, "error");
  assert.equal(fuel.reference.result.code, "trap:TrapCode.OUT_OF_FUEL");

  const memory = compileC(`
    __attribute__((export_name("alloc"))) unsigned alloc(unsigned n) { return 0; }
    __attribute__((export_name("transform"))) unsigned long long transform(unsigned p, unsigned n) {
      volatile unsigned char *q = (volatile unsigned char *)131072;
      return q[0];
    }
    unsigned char guest_memory[1];
  `, 2);
  const oob = await referenceResult(memory, Buffer.from("x"));
  assert.equal(oob.reference.result.code, "trap:TrapCode.MEMORY_OUT_OF_BOUNDS");

  const huge = compileC(`
    __attribute__((export_name("alloc"))) unsigned alloc(unsigned n) { return 0; }
    __attribute__((export_name("transform"))) unsigned long long transform(unsigned p, unsigned n) {
      return (unsigned long long)100000 << 32;
    }
    unsigned char guest_memory[1];
  `, 2);
  const output = await referenceResult(huge, Buffer.from("x"), { ...LIMITS, outputBytes: 16 });
  assert.equal(output.reference.result.code, "output_size");

  const malformed = await referenceResult(Buffer.from("not-a-wasm-module!!"), Buffer.from("x"));
  assert.equal(malformed.reference.result.code, "binary_core_wasm_required");

  const imported = compileC(`
    extern void blocked(void);
    __attribute__((export_name("alloc"))) unsigned alloc(unsigned n) { return 0; }
    __attribute__((export_name("transform"))) unsigned long long transform(unsigned p, unsigned n) {
      blocked();
      return 0;
    }
    unsigned char guest_memory[1];
  `, 2);
  const imports = await referenceResult(imported, Buffer.from("x"));
  assert.equal(imports.reference.result.code, "imports_forbidden");
});

test("reference child executes useful and negative structured results", () => {
  const built = spawnSync(process.execPath, ["example/build.mjs"], { cwd: executionRoot, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const wasm = spawnSync("cat", [path.join(executionRoot, ".build/structured-result.wasm")]);
  return (async () => {
    const valid = await referenceResult(wasm.stdout, Buffer.from(JSON.stringify({
      structuredContent: { kept: true }, isError: false,
    })));
    const negative = await referenceResult(wasm.stdout, Buffer.from(JSON.stringify({ text: "no structured content" })));
    assert.equal(valid.reference.result.status, "ok");
    const validOut = JSON.parse(Buffer.from(valid.reference.result.output, "base64").toString());
    const negativeOut = JSON.parse(Buffer.from(negative.reference.result.output, "base64").toString());
    assert.equal(validOut.outcome, "observed");
    assert.equal(negativeOut.outcome, "unsupported");
    assert.notEqual(negative.reference.result.output, valid.reference.result.output);
  })();
});

test("process witness rejects unknown, cancelled, missing, and phase timeout", async () => {
  const limits = { wallMs: 40, compileMs: 5000, instantiateMs: 5000, executeMs: 5000, outputBytes: 32 };
  const hanging = new EventEmitter();
  hanging.pid = process.pid;
  hanging.stdin = { end() {}, on() {}, destroy() {} };
  hanging.stdout = new EventEmitter();
  hanging.stderr = new EventEmitter();
  hanging.stdout.destroy = () => {};
  hanging.stderr.destroy = () => {};
  hanging.stdin.destroy = () => {};
  hanging.kill = () => {};
  hanging.unref = () => {};
  process.nextTick(() => hanging.emit("spawn"));
  const unknown = await superviseProcess({ launch: () => hanging, payload: { ok: 1 }, limits, exitGraceMs: 30 });
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.code, "wall_timeout");
  assert.equal(unknown.termination.exited, false);

  const controller = new AbortController();
  const cancelled = await superviseProcess({
    launch: () => spawn("/bin/sleep", ["30"], { stdio: ["pipe", "pipe", "pipe"] }),
    payload: {},
    limits: { wallMs: 5000, compileMs: 5000, instantiateMs: 5000, executeMs: 5000, outputBytes: 32 },
    signal: controller.signal,
    onSpawn: () => controller.abort(),
    exitGraceMs: 1000,
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.termination.exited, true);

  const missing = await superviseProcess({
    launch: () => spawn("/no/such/foundry-wasmtime49", ["--probe"], { stdio: ["pipe", "pipe", "pipe"] }),
    payload: {},
    limits: { wallMs: 1000, compileMs: 1000, instantiateMs: 1000, executeMs: 1000, outputBytes: 32 },
  });
  assert.equal(missing.status, "incomplete");
  assert.equal(missing.termination.noLaunch, true);

  const phase = await superviseProcess({
    launch: () => spawn(process.execPath, ["-e", "console.log(JSON.stringify({phase:'compile'})); setTimeout(() => {}, 10000);"], {
      stdio: ["pipe", "pipe", "pipe"],
    }),
    payload: {},
    limits: { wallMs: 5000, compileMs: 80, instantiateMs: 5000, executeMs: 5000, outputBytes: 32 },
    exitGraceMs: 500,
  });
  assert.equal(phase.status, "compile_timeout");
  assert.equal(phase.termination.exited, true);
});

test("installer replay does not drift on a disposable database", async () => {
  const pgCluster = await startDisposablePg();
  const dir = await mkdtemp(path.join(tmpdir(), "sds-install-"));
  try {
    const examples = path.join(repoRoot, "vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry");
    const host = path.join(dir, "host-profile.json");
    const key = path.join(dir, "participation.key");
    const profile = path.join(dir, "private-profile.json");
    await writeFile(host, await readFile(path.join(examples, "host-profile.example.json")));
    await writeFile(profile, await readFile(path.join(examples, "private-profile.example.json")));
    await writeFile(key, "participation-key-for-installer-replay\n");
    await chmod(host, 0o600);
    await chmod(profile, 0o600);
    await chmod(key, 0o600);
    const env = {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      LANG: "C",
      CORRESPONDENCE_DATABASE_URL: pgCluster.url,
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      FOUNDRY_HOST_PROFILE_FILE: host,
      FOUNDRY_PARTICIPATION_KEY_FILE: key,
      FOUNDRY_PRIVATE_PROFILE_FILE: profile,
    };
    const run = () => spawnSync(process.execPath, ["server/foundry/install.mjs", "--migrate", "--install"], {
      cwd: repoRoot, encoding: "utf8", env, timeout: 120000,
    });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    const a = JSON.parse(first.stdout);
    const b = JSON.parse(second.stdout);
    assert.equal(a.ok, true);
    assert.equal(b.configId, a.configId);
    assert.equal(b.termsHash, a.termsHash);
    assert.equal(b.charged, a.charged);
    assert.equal(b.maxEnrollments, a.maxEnrollments);
    assert.equal(a.configId.startsWith("sha256:"), true);
  } finally {
    await pgCluster.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("standalone cpython fallback imports the pinned wheel", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "sds-standalone-"));
  const tarball = "/tmp/cpython-standalone.tar.gz";
  try {
    await accessTarball(tarball);
  } catch {
    await rm(dir, { recursive: true, force: true });
    t.skip("pinned standalone archive unavailable");
    return;
  }
  try {
    const created = await materializeReferenceRuntime({
      forceStandalone: true,
      runtimeDir: path.join(dir, ".runtime"),
      standaloneDir: path.join(dir, ".python-standalone"),
      tarball,
    });
    assert.equal(created.action, "cpython-standalone");
    const again = await materializeReferenceRuntime({
      forceStandalone: true,
      runtimeDir: path.join(dir, ".runtime"),
      standaloneDir: path.join(dir, ".python-standalone"),
      tarball,
    });
    assert.equal(again.action, "present");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function accessTarball(file) {
  await readFile(file);
}

test("managed probe stays non-secret and off", async () => {
  const report = await collectProbe();
  const text = JSON.stringify(report);
  assert.equal(report.productionActivate, "HOLD");
  assert.equal(report.activation, false);
  assert.equal(report.privatePythonWebServer, false);
  assert.equal(report.wholeHostSandbox, false);
  assert.equal(text.includes("postgres"), false);
  assert.equal(text.includes("/home/"), false);
  assert.equal(report.ok, true);
  assert.equal(report.referenceRuntime, true);
  assert.equal(report.referenceExecution, true);
});

for (const phase of ["instantiate", "execute"]) test(`sealed supervisor enforces ${phase} deadline and waits for exit`, async () => {
  const phases = phase === "instantiate" ? ["compile", "instantiate"] : ["compile", "instantiate", "execute"];
  const body = phases.map(p => `console.log(JSON.stringify({phase:${JSON.stringify(p)}}));`).join("")+"setInterval(()=>{},1000);";
  const limits = { wallMs: 2000, compileMs: 1000, instantiateMs: 1000, executeMs: 1000, outputBytes: 32, [phase+"Ms"]: 60 };
  const observation = await superviseProcess({ launch: () => spawn(process.execPath, ["-e", body], { stdio: ["pipe", "pipe", "pipe"] }), payload: {}, limits });
  assert.equal(observation.status, phase+"_timeout"); assert.equal(observation.termination.exited, true);
  assert.deepEqual(observation.phasesObserved.map(p => p.phase), phases);
});
test("sealed supervisor never treats an ok result without exit as execution completion", async () => {
  const body = "for (const phase of ['compile','instantiate','execute']) console.log(JSON.stringify({phase})); console.log(JSON.stringify({result:{status:'ok'}}));setInterval(()=>{},1000);";
  const observation = await superviseProcess({ launch: () => spawn(process.execPath, ["-e", body], { stdio: ["pipe", "pipe", "pipe"] }), payload: {}, limits: { wallMs: 1000, compileMs: 1000, instantiateMs: 1000, executeMs: 80, outputBytes: 32 } });
  assert.equal(observation.status, "execute_timeout"); assert.equal(observation.termination.exited, true);
});
test("reference child bounds raw parsing and rejects WASI, variable memory, and invalid pointers", async () => {
  const raw = await spawnCollected(...pythonLaunch(LIMITS), "x".repeat(450000)+"\n");
  assert.equal(resultLine(raw.stdout).result.code, "request_size");
  const wat = text => {
    const result = spawnSync(python, ["-I", "-c", "import sys,wasmtime as w;sys.stdout.buffer.write(w.wat2wasm(sys.argv[1]))", text], { encoding: null, timeout: 5000 });
    assert.equal(result.status, 0); return result.stdout;
  };
  const alloc = '(func (export "alloc") (param i32) (result i32) i32.const 0)';
  const transform = '(func (export "transform") (param i32 i32) (result i64) i64.const 0)';
  for (const [source, expected] of [
    [`(module (import "wasi_snapshot_preview1" "proc_exit" (func (param i32))) (memory (export "memory") 2 2) ${alloc} ${transform})`, "imports_forbidden"],
    [`(module (memory (export "memory") 2) ${alloc} ${transform})`, "fixed_limits_required"],
    [`(module (memory (export "memory") 2 2) (func (export "alloc") (param i32) (result i32) i32.const -1) ${transform})`, "input_pointer"],
    [`(module (memory (export "memory") 2 2) ${alloc} (func (export "transform") (param i32 i32) (result i64) i64.const 8589934591))`, "output_pointer"],
  ]) assert.equal((await referenceResult(wat(source), Buffer.from("x"))).reference.result.code, expected);
  const unchecked = await spawnCollected(python, ["-I", "-B", pythonChild], JSON.stringify({limits:LIMITS})+"\n");
  assert.equal(resultLine(unchecked.stdout).result.code, "os_limits_unavailable");
});
