import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { D19_ROOT, LISTEN_PATH } from "./pins.mjs";
import { co20Fixture, locateCo16, locateCo20, ledgerLibPath } from "./locate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const APPEND_WORKER = join(here, "../workers/append-row.mjs");
export const HTTP_WORKER = join(here, "../workers/http-post.mjs");

export function tmpDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function spawnNode(args, { cwd, env = {}, timeoutMs = 180_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout ${timeoutMs}ms: ${args.join(" ")}\n${stderr}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolvePromise({ status, stdout, stderr, pid: child.pid });
    });
  });
}

export function parseJsonProc(proc) {
  const text = String(proc.stdout || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return {
      parseError: true,
      ok: false,
      exitStatus: proc.status,
      stdout: text.slice(0, 800),
      stderr: String(proc.stderr || "").slice(0, 1200),
    };
  }
  const body = JSON.parse(text.slice(start, end + 1));
  return { ...body, exitStatus: proc.status, parseError: false, stderr: String(proc.stderr || "") };
}

export function writeClonedOrder(orderId, fromName = "ord-1.json") {
  const src = co20Fixture(fromName);
  const base = JSON.parse(readFileSync(src, "utf8"));
  const fixtureDir = dirname(src);
  const destDir = tmpDir("w5-d19-req-");
  const cloned = {
    ...base,
    orderId,
    inputs: Array.isArray(base.inputs)
      ? base.inputs.map((inp) => ({ ...inp, path: resolve(fixtureDir, inp.path) }))
      : base.inputs,
  };
  const path = join(destDir, `${orderId}.json`);
  writeFileSync(path, `${JSON.stringify(cloned, null, 2)}\n`);
  return path;
}

export async function createOrder({ requestPath, store, outDir, databaseUrl = null }) {
  const located = locateCo20();
  mkdirSync(outDir, { recursive: true });
  mkdirSync(store, { recursive: true });
  const args = [located.cli, "create", "--request", requestPath, "--out-dir", outDir];
  if (databaseUrl) args.push("--database-url", databaseUrl);
  else args.push("--store", store);
  const proc = await spawnNode(args, { cwd: located.root });
  return { located, proc, body: parseJsonProc(proc) };
}

export async function runLedgerExample({ ledger, outDir, buyerClass = "owner-qa" }) {
  const located = locateCo16();
  mkdirSync(outDir, { recursive: true });
  const proc = await spawnNode(
    [
      located.cli,
      "run",
      "vendor-budget-impact",
      "--buyer-class",
      buyerClass,
      "--example",
      "--ledger",
      ledger,
      "--out-dir",
      outDir,
    ],
    { cwd: located.root },
  );
  return { located, proc, body: parseJsonProc(proc) };
}

export async function showLedger(ledger) {
  const located = locateCo16();
  const proc = await spawnNode([located.cli, "show", "--ledger", ledger], { cwd: located.root });
  return parseJsonProc(proc);
}

export function storeOrderFiles(store) {
  if (!existsSync(store)) return [];
  return readdirSync(store).filter((name) => name.endsWith(".json") && !name.includes(".tmp"));
}

export async function twoCreates(requestPaths, { databaseUrl = null } = {}) {
  const store = tmpDir("w5-d19-store-");
  const outA = tmpDir("w5-d19-out-a-");
  const outB = tmpDir("w5-d19-out-b-");
  const [a, b] = await Promise.all([
    createOrder({ requestPath: requestPaths[0], store, outDir: outA, databaseUrl }),
    createOrder({ requestPath: requestPaths[1], store, outDir: outB, databaseUrl }),
  ]);
  return {
    store,
    outA,
    outB,
    a,
    b,
    storeFiles: storeOrderFiles(store),
    outputsA: existsSync(join(outA, "upgrade-brief.json")),
    outputsB: existsSync(join(outB, "upgrade-brief.json")),
  };
}

export async function startOrderListener(store) {
  const located = locateCo20();
  mkdirSync(store, { recursive: true });
  const child = spawn(process.execPath, [located.cli, "listen", "--port", "0", "--store", store], {
    cwd: located.root,
    env: process.env,
  });
  return new Promise((resolvePromise, reject) => {
    let buf = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`listen timeout stderr=${child.stderr ? "" : ""}${buf}`));
    }, 20_000);
    const onData = (chunk) => {
      buf += chunk;
      const start = buf.indexOf("{");
      const end = buf.indexOf("}");
      if (start >= 0 && end > start) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        let info;
        try {
          info = JSON.parse(buf.slice(start, end + 1));
        } catch (err) {
          child.kill("SIGKILL");
          reject(err);
          return;
        }
        resolvePromise({ child, info, located, store, path: LISTEN_PATH });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => {
      buf += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function stopListener(listener) {
  if (!listener?.child) return;
  listener.child.kill("SIGTERM");
  await new Promise((resolvePromise) => {
    const t = setTimeout(() => {
      listener.child.kill("SIGKILL");
      resolvePromise();
    }, 3000);
    listener.child.on("close", () => {
      clearTimeout(t);
      resolvePromise();
    });
  });
}

export async function twoHttpPosts(origin, path, bodyPathA, bodyPathB) {
  const [a, b] = await Promise.all([
    spawnNode([HTTP_WORKER, origin, path, bodyPathA], { cwd: D19_ROOT }),
    spawnNode([HTTP_WORKER, origin, path, bodyPathB], { cwd: D19_ROOT }),
  ]);
  return { a: parseJsonProc(a), b: parseJsonProc(b) };
}

export async function barrierAppendRows(n, { trials = 1 } = {}) {
  const lib = ledgerLibPath();
  const results = [];
  for (let trial = 0; trial < trials; trial += 1) {
    const work = tmpDir("w5-d19-bar-");
    const ledger = join(work, "ledger.json");
    const go = join(work, "go");
    const kids = [];
    for (let i = 0; i < n; i += 1) {
      const ready = join(work, `ready-${i}`);
      const row = JSON.stringify({
        schema: "samedaydesk.buyer-value-ledger.row.v1",
        runId: `bvl_${trial}_${i}`,
        jobId: "vendor-budget-impact",
        buyerClass: "owner-qa",
        sample: true,
        independentDemand: false,
        durationMs: 1,
        outputBytes: 1,
      });
      kids.push(
        spawnNode([APPEND_WORKER, ledger, ready, go, lib, row], { cwd: locateCo16().root, timeoutMs: 30_000 }),
      );
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      let readyCount = 0;
      for (let i = 0; i < n; i += 1) {
        if (existsSync(join(work, `ready-${i}`))) readyCount += 1;
      }
      if (readyCount === n) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    writeFileSync(go, "1\n");
    const finished = await Promise.all(kids);
    let disk;
    try {
      disk = JSON.parse(readFileSync(ledger, "utf8"));
    } catch {
      disk = { rows: [] };
    }
    const ids = Array.isArray(disk.rows) ? disk.rows.map((row) => row.runId) : [];
    results.push({
      trial,
      n,
      rowCount: ids.length,
      ids,
      statuses: finished.map((proc) => proc.status),
      lost: ids.length !== n,
    });
  }
  return results;
}

export function creators(pair) {
  return [pair.a.body, pair.b.body].filter((body) => body.ok === true && body.replayed === false);
}
