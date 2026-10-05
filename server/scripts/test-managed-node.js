import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROFILE } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/contracts.mjs";
import { superviseProcess } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/supervisor.mjs";
import { planHostingerEnvPut } from "../foundry/hostinger-env.mjs";
import { materializeReferenceRuntime } from "../foundry/materialize-runtime.mjs";
import { collectProbe } from "../foundry/managed-node-probe.mjs";
import { appendSslRootCert, installVerifiedPgTls } from "../foundry/pg-tls.js";
import { materializePrivateProfiles } from "../foundry/private-materialize.js";
import { hostInputsFromEnv } from "../foundry/private-files.js";
import { foundryHostOptIn } from "../foundry/opt-in.js";
import { installation } from "../foundry/wasmtime49-embed/invoke.mjs";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";
import pg from "pg";
import pgConnectionString from "pg-connection-string";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const executionRoot = path.join(repoRoot, "vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution");
const python = path.join(executionRoot, ".runtime/bin/python");
const pythonChild = path.join(executionRoot, "src/child.py");
const embed = path.join(repoRoot, "server/foundry/wasmtime49-embed/bin/foundry-wasmtime49");
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
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
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

function embedLaunch(limits) {
  return [embed, [
    `--as=${limits.addressSpaceBytes}`,
    `--cpu=${limits.cpuSeconds}`,
    `--stack=${limits.hostStackBytes}`,
    `--fsize=${limits.fileBytes}`,
    `--nofile=${limits.openFiles}`,
  ]];
}

async function both(moduleBytes, input, limits = LIMITS) {
  const payload = JSON.stringify({
    module: Buffer.from(moduleBytes).toString("base64"),
    moduleDigest: digestOf(moduleBytes),
    input: Buffer.from(input).toString("base64"),
    limits,
  }) + "\n";
  const [reference, portable] = await Promise.all([
    spawnCollected(...pythonLaunch(limits), payload),
    spawnCollected(...embedLaunch(limits), payload),
  ]);
  return { reference: resultLine(reference.stdout), portable: resultLine(portable.stdout) };
}

function compileC(source, pages = 2) {
  const dir = spawnSync("mktemp", ["-d"], { encoding: "utf8" }).stdout.trim();
  const input = path.join(dir, "guest.c");
  const object = path.join(dir, "guest.o");
  const output = path.join(dir, "guest.wasm");
  spawnSync("bash", ["-c", `cat > ${JSON.stringify(input)}`], { input: source });
  const compiled = spawnSync("clang", ["--target=wasm32", "-O2", "-nostdlib", "-ffreestanding", "-c", input, "-o", object], { encoding: "utf8" });
  assert.equal(compiled.status, 0, compiled.stderr);
  const bytes = pages * 65536;
  const linked = spawnSync(linker, [
    "--no-entry", "--allow-undefined", "--export=alloc", "--export=transform", "--export-memory",
    `--initial-memory=${bytes}`, `--max-memory=${bytes}`, object, "-o", output,
  ], { encoding: "utf8" });
  assert.equal(linked.status, 0, linked.stderr);
  const wasm = spawnSync("cat", [output]).stdout;
  spawnSync("rm", ["-rf", dir]);
  return wasm;
}

test("reference profile stays the sealed wasmtime-py pin", () => {
  assert.equal(PROFILE.id, "vf08.wasmtime49-linux-x64-fixed.v1");
  assert.equal(PROFILE.runtime, "wasmtime-py");
  assert.equal(PROFILE.version, "49.0.0");
  assert.throws(() => installation(), /embed profile was not installed/);
});

test("default opt-in stays off", () => {
  assert.equal(foundryHostOptIn({}), false);
  assert.equal(foundryHostOptIn({ FOUNDRY_HOST_OPT_IN: "0" }), false);
});

test("hostinger put rejects masked values and a short backup", () => {
  const live = Array.from({ length: 16 }, (_, i) => `LIVE_${i}`);
  const backup = live.slice(0, 15);
  const desired = Object.fromEntries(live.map((key) => [key, `value-${key}`]));
  desired.FOUNDRY_HOST_OPT_IN = "1";
  assert.throws(() => planHostingerEnvPut({ liveKeys: live, backupKeys: backup, desired }), /stale_backup/);
  const masked = { ...desired, LIVE_0: "********" };
  assert.throws(() => planHostingerEnvPut({ liveKeys: live, desired: masked }), /masked_or_empty_value/);
  const omitted = { ...desired };
  delete omitted.LIVE_15;
  assert.throws(() => planHostingerEnvPut({ liveKeys: live, desired: omitted }), /live_key_omitted/);
  const plan = planHostingerEnvPut({ liveKeys: live, desired });
  assert.equal(plan.method, "PUT");
  assert.equal(plan.replaceAll, true);
  assert.equal(plan.variables.length, 17);
  assert.equal(plan.variables.some((item) => item.value === "********"), false);
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

test("verify-full appends the official CA and does not disable verification", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sds-ca-"));
  const file = path.join(dir, "ca.pem");
  const pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";
  await writeFile(file, pem, { mode: 0o600 });
  const original = "postgresql://user:secret@db.example:5432/app?sslmode=verify-full";
  const rewritten = appendSslRootCert(original, file);
  assert.match(rewritten, /sslrootcert=/);
  assert.equal(appendSslRootCert("postgres://sds@127.0.0.1:5432/correspondence", file), "postgres://sds@127.0.0.1:5432/correspondence");
  assert.equal(appendSslRootCert(`${original}&sslrootcert=${encodeURIComponent("/already.pem")}`, file).includes(file), false);
  const previous = process.env.CORRESPONDENCE_PGSSL_CA_FILE;
  process.env.CORRESPONDENCE_PGSSL_CA_FILE = file;
  try {
    installVerifiedPgTls();
    const pool = new pg.Pool({ connectionString: original, max: 1 });
    const parsed = pgConnectionString.parse(pool.options.connectionString);
    assert.equal(parsed.ssl.rejectUnauthorized, undefined);
    assert.match(String(parsed.ssl.ca), /BEGIN CERTIFICATE/);
    await pool.end();
  } finally {
    if (previous == null) delete process.env.CORRESPONDENCE_PGSSL_CA_FILE;
    else process.env.CORRESPONDENCE_PGSSL_CA_FILE = previous;
  }
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

test("same fixtures agree on the reference child and the embed child", async () => {
  const echo = compileC(`
    __attribute__((export_name("alloc"))) unsigned alloc(unsigned n) { return 0; }
    __attribute__((export_name("transform"))) unsigned long long transform(unsigned p, unsigned n) {
      return ((unsigned long long)n << 32) | p;
    }
    unsigned char guest_memory[1];
  `, 2);
  const first = await both(echo, Buffer.from("alpha"));
  const second = await both(echo, Buffer.from("beta"));
  assert.equal(first.reference.result.status, "ok");
  assert.equal(first.portable.result.status, "ok");
  assert.equal(first.portable.result.output, first.reference.result.output);
  assert.equal(Buffer.from(first.reference.result.output, "base64").toString(), "alpha");
  assert.notEqual(second.reference.result.output, first.reference.result.output);
  assert.equal(second.portable.result.output, second.reference.result.output);
  assert.equal(first.portable.result.usage.fuelUsed, first.reference.result.usage.fuelUsed);

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
  const fuel = await both(loop, Buffer.from("x"), fuelLimits);
  assert.equal(fuel.reference.result.status, "error");
  assert.equal(fuel.portable.result.status, "error");
  assert.equal(fuel.reference.result.code, "trap:TrapCode.OUT_OF_FUEL");
  assert.equal(fuel.portable.result.code, fuel.reference.result.code);

  const memory = compileC(`
    __attribute__((export_name("alloc"))) unsigned alloc(unsigned n) { return 0; }
    __attribute__((export_name("transform"))) unsigned long long transform(unsigned p, unsigned n) {
      volatile unsigned char *q = (volatile unsigned char *)131072;
      return q[0];
    }
    unsigned char guest_memory[1];
  `, 2);
  const oob = await both(memory, Buffer.from("x"));
  assert.equal(oob.reference.result.code, "trap:TrapCode.MEMORY_OUT_OF_BOUNDS");
  assert.equal(oob.portable.result.code, oob.reference.result.code);

  const huge = compileC(`
    __attribute__((export_name("alloc"))) unsigned alloc(unsigned n) { return 0; }
    __attribute__((export_name("transform"))) unsigned long long transform(unsigned p, unsigned n) {
      return (unsigned long long)100000 << 32;
    }
    unsigned char guest_memory[1];
  `, 2);
  const output = await both(huge, Buffer.from("x"), { ...LIMITS, outputBytes: 16 });
  assert.equal(output.reference.result.code, "output_size");
  assert.equal(output.portable.result.code, "output_size");

  const malformed = await both(Buffer.from("not-a-wasm-module!!"), Buffer.from("x"));
  assert.equal(malformed.reference.result.code, "binary_core_wasm_required");
  assert.equal(malformed.portable.result.code, malformed.reference.result.code);

  const imported = compileC(`
    extern void blocked(void);
    __attribute__((export_name("alloc"))) unsigned alloc(unsigned n) { return 0; }
    __attribute__((export_name("transform"))) unsigned long long transform(unsigned p, unsigned n) {
      blocked();
      return 0;
    }
    unsigned char guest_memory[1];
  `, 2);
  const imports = await both(imported, Buffer.from("x"));
  assert.equal(imports.reference.result.code, "imports_forbidden");
  assert.equal(imports.portable.result.code, "imports_forbidden");
});

test("useful structured result agrees, including the negative outcome", () => {
  const built = spawnSync(process.execPath, ["example/build.mjs"], { cwd: executionRoot, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const wasm = spawnSync("cat", [path.join(executionRoot, ".build/structured-result.wasm")]);
  return (async () => {
    const valid = await both(wasm.stdout, Buffer.from(JSON.stringify({
      structuredContent: { kept: true }, isError: false,
    })));
    const negative = await both(wasm.stdout, Buffer.from(JSON.stringify({ text: "no structured content" })));
    assert.equal(valid.reference.result.status, "ok");
    assert.equal(valid.portable.result.output, valid.reference.result.output);
    assert.equal(valid.portable.result.usage.fuelUsed, valid.reference.result.usage.fuelUsed);
    const validOut = JSON.parse(Buffer.from(valid.reference.result.output, "base64").toString());
    const negativeOut = JSON.parse(Buffer.from(negative.reference.result.output, "base64").toString());
    assert.equal(validOut.outcome, "observed");
    assert.equal(negativeOut.outcome, "unsupported");
    assert.equal(negative.portable.result.output, negative.reference.result.output);
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

test("receiver invoke agrees for the reference supervisor and the embed facade", () => {
  const built = spawnSync(process.execPath, ["example/build.mjs"], { cwd: executionRoot, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const wasmPath = path.join(executionRoot, ".build/structured-result.wasm");
  const run = (embedMode) => {
    const invokePath = embedMode
      ? path.join(repoRoot, "server/foundry/wasmtime49-embed/invoke.mjs")
      : path.join(executionRoot, "src/supervisor.mjs");
    const body = `
      import { readFileSync } from "node:fs";
      import { packageModule, bindingFor } from ${JSON.stringify(path.join(executionRoot, "example/package.mjs"))};
      import { invoke } from ${JSON.stringify(invokePath)};
      const moduleBytes = readFileSync(${JSON.stringify(wasmPath)});
      const artifact = packageModule(moduleBytes, { sourceRevision: "e1d03aedbc6a5a65b8d38ed11e8a09e475171231" });
      const binding = bindingFor(artifact);
      const input = ${JSON.stringify({ structuredContent: { kept: true }, isError: false })};
      const negative = ${JSON.stringify({ text: "no structured content" })};
      const ok = await invoke({ artifact, moduleBytes, input, binding });
      const bad = await invoke({ artifact, moduleBytes, input: negative, binding });
      process.stdout.write(JSON.stringify({
        status: ok.observation.status,
        output: ok.output,
        negative: bad.output,
        fuelUsed: ok.observation.usage.fuelUsed,
        runtime: artifact.profile.runtime,
      }));
    `;
    return spawnSync(process.execPath, [
      ...(embedMode ? ["--import", path.join(repoRoot, "server/foundry/wasmtime49-embed/register.mjs")] : []),
      "--input-type=module", "-e", body,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { PATH: process.env.PATH || "", LANG: "C" },
      timeout: 30000,
    });
  };
  const reference = run(false);
  const portable = run(true);
  assert.equal(reference.status, 0, reference.stderr);
  assert.equal(portable.status, 0, portable.stderr);
  const a = JSON.parse(reference.stdout);
  const b = JSON.parse(portable.stdout);
  assert.equal(a.status, "ok");
  assert.equal(b.status, "ok");
  assert.equal(a.runtime, "wasmtime-py");
  assert.equal(b.runtime, "wasmtime-capi");
  assert.deepEqual(b.output, a.output);
  assert.equal(a.output.outcome, "observed");
  assert.equal(b.negative.outcome, "unsupported");
  assert.deepEqual(b.negative, a.negative);
  assert.equal(b.fuelUsed, a.fuelUsed);
});

test("listener registers embed hooks before correspondence loads", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    process.env.FOUNDRY_EXECUTION_RUNTIME = "wasmtime49-embed";
    const { createSdsApp } = await import(${JSON.stringify(path.join(repoRoot, "server/app.js"))});
    createSdsApp();
    const { PROFILE } = await import(${JSON.stringify(path.join(executionRoot, "src/contracts.mjs"))});
    if (PROFILE.runtime !== "wasmtime-capi" || PROFILE.wasi !== false) process.exit(2);
    process.stdout.write(PROFILE.runtime);
  `], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "", LANG: "C" },
    timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "wasmtime-capi");
});

test("embed loader installs its own profile and does not fall through", async () => {
  const script = path.join(repoRoot, "server/foundry/wasmtime49-embed/register.mjs");
  const probe = `
    const { PROFILE } = await import(${JSON.stringify(path.join(executionRoot, "src/contracts.mjs"))});
    const { installation } = await import(${JSON.stringify(path.join(repoRoot, "server/foundry/wasmtime49-embed/invoke.mjs"))});
    const pin = installation();
    if (PROFILE.runtime !== "wasmtime-capi" || PROFILE.wasi !== false) process.exit(2);
    if (pin.pins.profile.distinctFrom !== "vf08.wasmtime49-linux-x64-fixed.v1") process.exit(3);
    process.stdout.write(JSON.stringify({ runtime: PROFILE.runtime, wasi: PROFILE.wasi }));
  `;
  const result = spawnSync(process.execPath, ["--import", script, "--input-type=module", "-e", probe], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "", LANG: "C", FOUNDRY_EXECUTION_RUNTIME: "wasmtime49-embed" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).runtime, "wasmtime-capi");
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

test("standalone cpython fallback imports the pinned wheel", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sds-standalone-"));
  const tarball = "/tmp/cpython-standalone.tar.gz";
  try {
    await accessTarball(tarball);
  } catch {
    await rm(dir, { recursive: true, force: true });
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
  assert.equal(report.embedProbe, true);
  assert.equal(report.embedLimits, true);
});
