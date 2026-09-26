import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EVIDENCE_CLASS } from "../src/constants.mjs";

const PACK_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(PACK_ROOT, "../..");

export const E01_SHA = "c4048401fa42e1272e61edf983afbf39a3e04555";
export const E01_TREE = "1a5dad7755fb81c75564dbc9d3667ab16db9bbcd";
export const REJECTED_I01_SHAS = Object.freeze([
  "819fa637ecf5e5177c84efc16fcaa18d57017631",
  "346bbd3cbe6943a83b2077c455174d74b7a493ad",
]);
/** Historical I01 pin. Comparison only. Live boot is E01 compiled dist/index.js. */
export const I01_SHA = E01_SHA;
export const PROTOCOL_SOURCE_SHA = E01_SHA;
export const KERNEL_RETRY_AUTHORITY_SHA = E01_SHA;

function defaultE01Worktree() {
  const envTree = process.env.EARNED_WORK_KERNEL_ROOT || process.env.CSG_E01_WORKTREE || process.env.CSG_I01_WORKTREE;
  if (envTree) return envTree;
  const scratch = `${REPO_ROOT}/.scratch/e01-c4048401fa42`;
  if (existsSync(`${scratch}/services/earned-work/src/index.ts`)) return scratch;
  return scratch;
}

export const I01_WORKTREE = defaultE01Worktree();
export const DEFAULT_PG_URL =
  process.env.EARNED_WORK_DATABASE_URL ||
  "postgres://earned_work:earned_work@127.0.0.1:55432/earned_work_test";
export const DEFAULT_OWNER_TOKEN = process.env.CSG_OWNER_TOKEN || "dev-owner-token-s275";
export const PG_BIN = detectPgBin();
export const PGDATA = process.env.CSG_PGDATA || "/tmp/w5-e07-csg-pgdata";
export const PGPORT = Number(process.env.CSG_PGPORT || portFromUrl(DEFAULT_PG_URL) || 55432);

function detectPgBin() {
  if (process.env.CSG_PGBIN) return process.env.CSG_PGBIN;
  const candidates = [
    "/workspace/pilot/toolchain/postgresql-17/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/16/bin",
    "/usr/pgsql-16/bin",
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "initdb")) && existsSync(join(candidate, "pg_ctl"))) return candidate;
  }
  return "/usr/lib/postgresql/16/bin";
}

function portFromUrl(url) {
  try {
    return Number(new URL(url).port || 5432);
  } catch {
    return 0;
  }
}

function pgEnv() {
  const lib = "/workspace/pilot/toolchain/postgresql-17/usr/lib/x86_64-linux-gnu";
  const env = { ...process.env };
  if (existsSync(join(lib, "libpq.so.5"))) {
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${lib}:${env.LD_LIBRARY_PATH}` : lib;
  }
  env.PATH = `${PG_BIN}:${env.PATH || ""}`;
  return env;
}

function waitPort(port, host = "127.0.0.1", timeoutMs = 2000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port, host });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`timeout waiting for ${host}:${port}`));
        else setTimeout(tryOnce, 100);
      });
    };
    tryOnce();
  });
}

async function waitHealth(baseUrl, { child, timeoutMs = 40000 } = {}) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    if (child?.exitCode != null) {
      throw new Error(`earned-work exited ${child.exitCode} before healthy (${last})`);
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      const body = await response.json();
      if (response.status === 200 && body.ok === true && body.store === "postgres") return body;
      last = JSON.stringify(body);
    } catch (error) {
      last = error.message;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`earned-work did not become healthy at ${baseUrl} (${last})`);
}

function gitRev(worktree, spec = "HEAD") {
  const result = spawnSync("git", ["-C", worktree, "rev-parse", spec], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function assertCurrentE01(worktree) {
  const sha = gitRev(worktree, "HEAD");
  if (REJECTED_I01_SHAS.includes(sha) || sha.startsWith("819fa637") || sha.startsWith("346bbd3c")) {
    throw new Error(`pin_mismatch: worktree still points at I01 ${sha}`);
  }
  if (sha !== E01_SHA) {
    throw new Error(`pin_mismatch: kernel HEAD ${sha || "unknown"} is not E01 ${E01_SHA}`);
  }
  const tree = gitRev(worktree, "HEAD:services/earned-work");
  if (tree !== E01_TREE) {
    throw new Error(`pin_mismatch: services/earned-work tree ${tree || "unknown"} is not ${E01_TREE}`);
  }
}

export function i01Available() {
  try {
    assertCurrentE01(I01_WORKTREE);
    return existsSync(`${I01_WORKTREE}/services/earned-work/src/index.ts`);
  } catch {
    return false;
  }
}

function npmCi(dir) {
  const result = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
    cwd: dir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return { ok: false, reason: `npm ci failed in ${dir}: ${result.stderr || result.stdout}` };
  }
  return { ok: true };
}

export function ensureI01WorktreeDeps(worktree = I01_WORKTREE) {
  const earned = `${worktree}/services/earned-work`;
  if (!existsSync(`${earned}/node_modules/pg`)) {
    const installed = npmCi(earned);
    if (!installed.ok) return installed;
  }
  if (!existsSync(`${earned}/node_modules/@neomorphic/funded-task-terms`)) {
    return { ok: false, reason: `earned-work missing file dependency @neomorphic/funded-task-terms after npm ci` };
  }
  if (!existsSync(`${earned}/node_modules/@neomorphic/arena-workability-dimensions`)) {
    return {
      ok: false,
      reason: `earned-work missing file dependency @neomorphic/arena-workability-dimensions after npm ci`,
    };
  }
  const f01Bridge = `${worktree}/experiments/arena/workability-dimensions/dist/f01-bridge.js`;
  if (!existsSync(f01Bridge)) {
    const built = spawnSync(
      "npx",
      ["tsc", "-p", "../../experiments/arena/workability-dimensions/tsconfig.f01.json"],
      { cwd: earned, encoding: "utf8" },
    );
    if (built.status !== 0 || !existsSync(f01Bridge)) {
      return {
        ok: false,
        reason: `I01 pretest tsc for workability f01-bridge failed: ${built.stderr || built.stdout}`,
      };
    }
  }
  return { ok: true };
}

export function ensureCompiledKernel(worktree = I01_WORKTREE) {
  const deps = ensureI01WorktreeDeps(worktree);
  if (!deps.ok) return deps;
  const earned = `${worktree}/services/earned-work`;
  const dist = join(earned, "dist/index.js");
  if (!existsSync(dist)) {
    const built = spawnSync("npm", ["run", "build"], { cwd: earned, encoding: "utf8" });
    if (built.status !== 0 || !existsSync(dist)) {
      return { ok: false, reason: `compiled kernel build failed: ${built.stderr || built.stdout}` };
    }
  }
  return { ok: true, entry: dist };
}

function runBin(bin, args) {
  return spawnSync(bin, args, { stdio: "pipe", encoding: "utf8", env: pgEnv() });
}

export async function postgresReachable(url = DEFAULT_PG_URL) {
  try {
    const parsed = new URL(url);
    await waitPort(Number(parsed.port || 5432), parsed.hostname, 1500);
    return true;
  } catch {
    return false;
  }
}

export function ensureLocalPostgres(url = DEFAULT_PG_URL) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    return { ok: false, reason: "refusing to start Postgres on a non-loopback host" };
  }
  const initdb = join(PG_BIN, "initdb");
  const pgctl = join(PG_BIN, "pg_ctl");
  const createdb = join(PG_BIN, "createdb");
  if (!existsSync(initdb) || !existsSync(pgctl)) {
    return { ok: false, reason: `local initdb not found at ${PG_BIN}` };
  }
  mkdirSync(PGDATA, { recursive: true });
  if (!existsSync(join(PGDATA, "PG_VERSION"))) {
    const init = runBin(initdb, [
      "-D",
      PGDATA,
      "--auth=trust",
      "--username=earned_work",
      "--encoding=UTF8",
      "--no-locale",
    ]);
    if (init.status !== 0) {
      return { ok: false, reason: `initdb failed: ${init.stderr || init.stdout}` };
    }
    writeFileSync(
      join(PGDATA, "postgresql.conf"),
      `port = ${PGPORT}\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '${PGDATA}'\n`,
      { flag: "a" },
    );
  }
  const status = spawnSync(pgctl, ["-D", PGDATA, "status"], { stdio: "ignore", env: pgEnv() });
  if (status.status !== 0) {
    const started = runBin(pgctl, ["-D", PGDATA, "-l", "/tmp/w5-e07-csg-pg.log", "-w", "start"]);
    if (started.status !== 0) {
      return { ok: false, reason: `pg_ctl start failed: ${started.stderr || started.stdout}` };
    }
  }
  runBin(createdb, ["-h", "127.0.0.1", "-p", String(PGPORT), "-U", "earned_work", parsed.pathname.slice(1)]);
  return { ok: true, url };
}

function pickPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.once("error", reject);
  });
}

function gitHead(worktree) {
  const result = spawnSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

export async function bootI01LocalRuntime({
  databaseUrl = DEFAULT_PG_URL,
  ownerToken = DEFAULT_OWNER_TOKEN,
  worktree = I01_WORKTREE,
  verifierMode,
  reproductionRoot,
} = {}) {
  try {
    assertCurrentE01(worktree);
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  if (!existsSync(`${worktree}/services/earned-work/src/index.ts`)) {
    return { ok: false, reason: `E01 worktree missing at ${worktree}` };
  }
  const compiled = ensureCompiledKernel(worktree);
  if (!compiled.ok) return compiled;
  if (!(await postgresReachable(databaseUrl))) {
    const started = ensureLocalPostgres(databaseUrl);
    if (!started.ok) return { ok: false, reason: started.reason };
  }
  const port = await pickPort();
  const schema = `csg_${randomBytes(6).toString("hex")}`;
  const env = {
    ...process.env,
    EARNED_WORK_DATABASE_URL: databaseUrl,
    EARNED_WORK_OWNER_TOKEN: ownerToken,
    EARNED_WORK_PG_SCHEMA: schema,
    EARNED_WORK_RATE_LIMIT_MAX: "10000",
    PORT: String(port),
  };
  if (verifierMode) env.EARNED_WORK_VERIFIER = verifierMode;
  if (reproductionRoot) env.EARNED_WORK_REPRODUCTION_ROOT = reproductionRoot;
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: `${worktree}/services/earned-work`,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c) => {
    stdout += c;
  });
  child.stderr.on("data", (c) => {
    stderr += c;
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitHealth(baseUrl, { child });
  } catch (error) {
    child.kill("SIGTERM");
    return { ok: false, reason: `${error.message}; stdout=${stdout} stderr=${stderr}` };
  }
  return {
    ok: true,
    evidenceClass: EVIDENCE_CLASS.LOCAL_RUNTIME,
    compiled: true,
    entry: "dist/index.js",
    protocolSource: PROTOCOL_SOURCE_SHA,
    kernelRetryAuthority: KERNEL_RETRY_AUTHORITY_SHA,
    baseUrl,
    port,
    ownerToken,
    databaseUrl,
    worktree,
    sha: gitHead(worktree) || PROTOCOL_SOURCE_SHA,
    kernelSha: E01_SHA,
    kernelTree: E01_TREE,
    historicalI01: "346bbd3cbe6943a83b2077c455174d74b7a493ad",
    schema,
    stop: async () => {
      if (child.exitCode != null) return;
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 4000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}
