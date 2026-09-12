import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { after, describe, it } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const PIN143 = "a18ab918b5a6f60a6981903694aeba41d7d30dd8ad3e336f1d7b8fd22cf62b09";
const BYTES143 = 2615491;
const PIN144 = "ff4934096e2ba2c95f52c9e364647b455009c36710723f754f3f63ea0dcb5aac";
const BYTES144 = 5252886;
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function tempDir(prefix) {
  return mkdtempSync(join(process.env.TMPDIR || tmpdir(), prefix));
}

function writePair(dir, first, second) {
  writeFileSync(join(dir, "first.json"), first);
  writeFileSync(join(dir, "second.json"), second);
}

function installPgDriver(orderDir) {
  const installed = spawnSync("npm", ["ci", "--omit=dev", "--no-fund", "--no-audit"], {
    cwd: orderDir,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  assert.equal(existsSync(join(orderDir, "node_modules/pg/package.json")), true);
  const pg = JSON.parse(readFileSync(join(orderDir, "node_modules/pg/package.json"), "utf8"));
  assert.equal(pg.version, "8.23.0");
}

describe("packaged 1.4.5 extracted bytes: advertised M01/PR51, rollback, interrupt, cold, PG, HTTP, portable", { timeout: 300_000 }, () => {
  const work = tempDir("packaged-145-");
  const archive145 = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.5.tar.gz");
  const archive144 = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.4.tar.gz");
  const archive143 = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.3.tar.gz");
  const pin145 = JSON.parse(readFileSync(join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.5.sha256.json"), "utf8"));
  const kit = join(work, "useful-jobs-1.4.5");
  const extract = spawnSync("tar", ["-xzf", archive145, "-C", work], { encoding: "utf8" });
  assert.equal(extract.status, 0, extract.stderr);
  const wrapperPath = join(kit, "server/paid-useful-jobs/lib/wrapper.mjs");
  const orderPath = join(kit, "tools/managed-useful-jobs-order/lib/create-order.mjs");
  const httpPath = join(kit, "server/paid-useful-jobs/lib/http.mjs");
  const storePath = join(kit, "tools/managed-useful-jobs-order/lib/store-postgres.mjs");
  const clusterPath = join(kit, "tools/managed-useful-jobs-order/lib/pg-cluster.mjs");
  const servePath = join(kit, "server/paid-useful-jobs/bin/serve-execution.mjs");
  const wrapperRoot = join(kit, "server/paid-useful-jobs");
  const fixtures = join(kit, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact");
  const orders = join(kit, "tools/managed-useful-jobs-order/fixtures/orders");
  const orderDir = join(kit, "tools/managed-useful-jobs-order");
  assert.equal(existsSync(join(kit, "node_modules")), false);
  after(() => rmSync(work, { recursive: true, force: true }));

  it("leaves 1.4.3 a18ab918 and 1.4.4 ff493409 byte-identical", () => {
    const pub143 = readFileSync(archive143);
    const kit143 = readFileSync(join(root, "client/public/kit/useful-jobs-1.4.3.tar.gz"));
    assert.equal(pub143.length, BYTES143);
    assert.equal(sha(pub143), PIN143);
    assert.equal(kit143.length, BYTES143);
    assert.equal(sha(kit143), PIN143);
    const pub144 = readFileSync(archive144);
    const kit144 = readFileSync(join(root, "client/public/kit/useful-jobs-1.4.4.tar.gz"));
    assert.equal(pub144.length, BYTES144);
    assert.equal(sha(pub144), PIN144);
    assert.equal(kit144.length, BYTES144);
    assert.equal(sha(kit144), PIN144);
    const names143 = spawnSync("tar", ["-tzf", archive143], { encoding: "utf8" }).stdout.split("\n");
    assert.equal(names143.some((row) => /wrapper\.mjs$/.test(row)), false);
  });

  it("1.4.5 archive matches pin, has wrapper/interrupt/engines, and contains no node_modules", () => {
    const packed = readFileSync(archive145);
    assert.equal(packed.length, pin145.bytes);
    assert.equal(sha(packed), pin145.sha256);
    const names = spawnSync("tar", ["-tzf", archive145], { encoding: "utf8" }).stdout.split("\n");
    assert.equal(names.some((row) => /(^|\/)node_modules\//.test(row)), false);
    assert.equal(existsSync(wrapperPath), true);
    assert.match(readFileSync(wrapperPath, "utf8"), /rollback-incomplete/);
    assert.match(readFileSync(orderPath, "utf8"), /interrupted-incomplete/);
    assert.match(readFileSync(join(kit, "experiments/wave5/m01/lib/engine-root.mjs"), "utf8"), /packaged-engines/);
    assert.equal(JSON.parse(readFileSync(join(orderDir, "package.json"), "utf8")).dependencies.pg, "8.23.0");
    for (const id of ["lockfile-pin-delta", "json-schema-webhook-drift", "route-table-diff", "page-change-offline-job"]) {
      assert.equal(existsSync(join(kit, "engines", id)), true, id);
    }
    assert.equal(existsSync(join(kit, "tools/lockfile-pin-delta")), false);
  });

  it("extracted advertised M01 lockfile-pin-delta and json-schema-webhook-drift plus PR51 vendor-budget-impact", async () => {
    const { runPaidOffer } = await import(pathToFileURL(wrapperPath).href);
    const lockOut = tempDir("m01-145-lock-");
    const lock = await runPaidOffer({
      jobId: "lockfile-pin-delta",
      inputs: {
        before: join(kit, "engines/lockfile-pin-delta/fixtures/journey/before.json"),
        after: join(kit, "engines/lockfile-pin-delta/fixtures/journey/after.json"),
      },
      fundingIntent: "unfunded",
      outDir: lockOut,
    });
    assert.equal(lock.ok, true, lock.error);
    assert.equal(lock.sold, false);
    assert.equal(lock.purchaseAuthority, false);
    assert.equal(lock.jobId, "lockfile-pin-delta");
    assert.equal(lock.contract, "samedaydesk.paid-useful-jobs.execution.v1");
    assert.equal(lock.delivery.complete, true);
    assert.equal(existsSync(join(lockOut, "pin-delta.json")), true);

    const schemaOut = tempDir("m01-145-schema-");
    const schema = await runPaidOffer({
      jobId: "json-schema-webhook-drift",
      inputs: {
        before: join(kit, "engines/json-schema-webhook-drift/fixtures/journey/before.json"),
        after: join(kit, "engines/json-schema-webhook-drift/fixtures/journey/after.json"),
        used: join(kit, "engines/json-schema-webhook-drift/fixtures/journey/used.json"),
      },
      fundingIntent: "unfunded",
      outDir: schemaOut,
    });
    assert.equal(schema.ok, true, schema.error);
    assert.equal(schema.sold, false);
    assert.equal(schema.jobId, "json-schema-webhook-drift");
    assert.equal(schema.delivery.complete, true);
    assert.equal(existsSync(join(schemaOut, "drift-brief.json")), true);

    const budgetOut = tempDir("pr51-145-budget-");
    const budget = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: { before: join(fixtures, "before.json"), after: join(fixtures, "after.json") },
      fundingIntent: "unfunded",
      outDir: budgetOut,
    });
    assert.equal(budget.ok, true, budget.error);
    assert.equal(budget.sold, false);
    assert.equal(budget.jobId, "vendor-budget-impact");
    assert.equal(budget.delivery.complete, true);
  });

  it("extracted publishCompleteOutputs rolls back caller artifacts", async () => {
    const { publishCompleteOutputs, runPaidOffer, createExecutor } = await import(pathToFileURL(wrapperPath).href);
    const out = tempDir("puj-145-pub-");
    try {
      const previous = "previous caller-owned publication\n";
      writeFileSync(join(out, "budget-impact.json"), previous);
      mkdirSync(join(out, "budget-impact.md"));
      const result = await runPaidOffer({
        jobId: "vendor-budget-impact",
        inputs: { before: join(fixtures, "before.json"), after: join(fixtures, "after.json") },
        fundingIntent: "unfunded",
        outDir: out,
      });
      assert.equal(result.ok, false);
      assert.equal(result.sold, false);
      assert.deepEqual(readFileSync(join(out, "budget-impact.json")), Buffer.from(previous));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }

    const src = tempDir("puj-145-src-");
    const dest = tempDir("puj-145-dst-");
    try {
      writePair(src, "NEW-FIRST\n", "NEW-SECOND\n");
      const original = "ORIGINAL-FIRST\n";
      writeFileSync(join(dest, "first.json"), original);
      let installs = 0;
      assert.throws(
        () =>
          publishCompleteOutputs(src, dest, ["first.json", "second.json"], {
            afterInstall() {
              installs += 1;
              if (installs === 1) throw new Error("injected-after-first-install");
            },
          }),
        (err) => err.code === "publication-failed",
      );
      assert.equal(readFileSync(join(dest, "first.json"), "utf8"), original);
      assert.equal(existsSync(join(dest, "second.json")), false);
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }

    const execOut = tempDir("puj-145-exec-");
    try {
      const original = "previous caller-owned publication\n";
      writeFileSync(join(execOut, "budget-impact.json"), original);
      const execute = createExecutor({
        publicationHooks: {
          afterInstall({ index }) {
            if (index === 0) throw new Error("injected-after-first-install");
          },
        },
      });
      const result = await execute({
        jobId: "vendor-budget-impact",
        inputs: { before: join(fixtures, "before.json"), after: join(fixtures, "after.json") },
        fundingIntent: "unfunded",
        outDir: execOut,
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "publication-failed");
      assert.equal(readFileSync(join(execOut, "budget-impact.json"), "utf8"), original);
    } finally {
      rmSync(execOut, { recursive: true, force: true });
    }
  });

  it("extracted create-order interrupt path does not rerun the engine", async () => {
    const { runCreateOrder } = await import(pathToFileURL(orderPath).href);
    const { createFileStore } = await import(pathToFileURL(join(orderDir, "lib/store-file.mjs")).href);
    const storeDir = tempDir("managed-145-store-");
    const store = createFileStore(storeDir);
    const raw = JSON.parse(readFileSync(join(orders, "ord-1.json"), "utf8"));
    const originalComplete = store.complete.bind(store);
    store.complete = async () => {
      throw Object.assign(new Error("simulated SIGKILL before store.complete"), { code: "SIMULATED_KILL" });
    };
    await assert.rejects(
      () => runCreateOrder(raw, { store, outDir: tempDir("managed-145-out-"), requestDir: orders, wrapperRoot }),
      (err) => err.code === "SIMULATED_KILL",
    );
    const journalPath = join(storeDir, "executions.jsonl");
    const before = readFileSync(journalPath, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(before.length, 1);
    const reserved = JSON.parse(readFileSync(join(storeDir, "ord-1.json"), "utf8"));
    assert.equal(reserved.executionCount, 1);
    reserved.holderPid = 999999999;
    writeFileSync(join(storeDir, "ord-1.json"), `${JSON.stringify(reserved, null, 2)}\n`);
    store.complete = originalComplete;
    const reopened = await runCreateOrder(raw, { store, outDir: tempDir("managed-145-out2-"), requestDir: orders, wrapperRoot });
    const afterLines = readFileSync(journalPath, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(afterLines.length, 1, "ambiguous order automatically reran a completed real engine");
    if (reopened.ok) assert.equal(reopened.wrapper.executionId, JSON.parse(before[0]).executionId);
    else {
      assert.equal(reopened.ok, false);
      assert.equal(reopened.sold, false);
    }
  });

  it("cold install of 1.4.5 extract runs advertised lockfile-pin-delta without host node_modules", async () => {
    const discovery = JSON.parse(readFileSync(join(root, "client/public/discovery/useful-jobs.json"), "utf8"));
    assert.equal(discovery.version, "1.4.5");
    assert.equal(discovery.sha256, pin145.sha256);
    const payload = readFileSync(join(root, "client/public", discovery.archive.path.replace(/^\//, "")));
    const server = createServer((request, response) => {
      if (request.url !== discovery.archive.path) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "application/gzip", "content-length": payload.length });
      response.end(payload);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const coldRoot = tempDir("cold-145-");
    try {
      const origin = "http://127.0.0.1:" + server.address().port;
      const acquired = await execFileAsync("bash", ["-lc", discovery.coldStart], {
        cwd: coldRoot,
        env: { ...process.env, TMPDIR: coldRoot, USEFUL_JOBS_ORIGIN: origin },
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const coldKit = acquired.stdout.trim();
      assert.ok(coldKit.startsWith(coldRoot + "/"));
      assert.equal(existsSync(join(coldKit, "node_modules")), false);
      assert.equal(existsSync(join(coldKit, "engines/lockfile-pin-delta/bin/lockfile-delta.mjs")), true);
      const listed = spawnSync(process.execPath, [join(coldKit, "bin/useful-jobs.mjs"), "list"], {
        cwd: coldKit,
        encoding: "utf8",
        timeout: 30_000,
      });
      assert.equal(listed.status, 0, listed.stderr);
      const { runPaidOffer } = await import(pathToFileURL(join(coldKit, "server/paid-useful-jobs/lib/wrapper.mjs")).href);
      const out = join(coldRoot, "published");
      mkdirSync(out);
      const result = await runPaidOffer({
        jobId: "lockfile-pin-delta",
        inputs: {
          before: join(coldKit, "engines/lockfile-pin-delta/fixtures/journey/before.json"),
          after: join(coldKit, "engines/lockfile-pin-delta/fixtures/journey/after.json"),
        },
        fundingIntent: "unfunded",
        outDir: out,
      });
      assert.equal(result.ok, true, result.error);
      assert.equal(result.sold, false);
      assert.equal(result.jobId, "lockfile-pin-delta");
      assert.equal(result.delivery.complete, true);
    } finally {
      server.close();
      rmSync(coldRoot, { recursive: true, force: true });
    }
  });

  it("extracted HTTP principal binding returns 403 principal-mismatch", async () => {
    const { createExecutionServer, listenExecutionServer } = await import(pathToFileURL(httpPath).href);
    const { server } = createExecutionServer();
    const { origin } = await listenExecutionServer(server);
    try {
      const posted = await fetch(`${origin}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer cw65-synthetic-principal-a" },
        body: JSON.stringify({
          jobId: "vendor-budget-impact",
          executionId: "packaged-145-principal",
          inputs: { before: join(fixtures, "before.json"), after: join(fixtures, "after.json") },
        }),
      });
      assert.equal(posted.status, 200);
      const body = await posted.json();
      assert.equal(body.ok, true, body.error);
      const foreign = await fetch(`${origin}/results/packaged-145-principal`, {
        headers: { authorization: "Bearer cw65-synthetic-principal-b" },
      });
      assert.equal(foreign.status, 403);
      assert.equal((await foreign.json()).code, "principal-mismatch");
      const owner = await fetch(`${origin}/results/packaged-145-principal`, {
        headers: { authorization: "Bearer cw65-synthetic-principal-a" },
      });
      assert.equal(owner.status, 200);
      assert.equal((await owner.json()).executionId, "packaged-145-principal");
    } finally {
      server.close();
    }
  });

  it("cold-installed pg 8.23.0 then extracted Postgres store on 55595", async () => {
    installPgDriver(orderDir);
    const { createPostgresStore } = await import(pathToFileURL(storePath).href);
    const { runCreateOrder } = await import(pathToFileURL(orderPath).href);
    const { postgresBinariesAvailable, startDisposablePostgres } = await import(pathToFileURL(clusterPath).href);
    if (!postgresBinariesAvailable()) {
      throw new Error("postgresql-16 initdb/pg_ctl missing; missing dependency is incomplete, not a skip");
    }
    const previous = process.env.MANAGED_ORDER_PG_PORT;
    process.env.MANAGED_ORDER_PG_PORT = "55595";
    const cluster = startDisposablePostgres();
    try {
      assert.equal(cluster.clientConfig.port, 55595);
      const store = await createPostgresStore({
        clientConfig: cluster.clientConfig,
        schema: "managed_useful_jobs_order",
      });
      try {
        const first = await runCreateOrder(JSON.parse(readFileSync(join(orders, "ord-1.json"), "utf8")), {
          store,
          requestDir: orders,
          outDir: tempDir("pg-145-out-"),
          wrapperRoot,
        });
        assert.equal(first.ok, true, JSON.stringify(first));
        assert.equal(first.sold, false);
        assert.equal(first.purchaseAuthority, false);
        assert.equal(first.acceptanceClass, "local-runtime");
        const swapped = await runCreateOrder(JSON.parse(readFileSync(join(orders, "ord-1-swapped.json"), "utf8")), {
          store,
          requestDir: orders,
          outDir: tempDir("pg-145-out2-"),
          wrapperRoot,
        });
        assert.equal(swapped.ok, false);
        assert.equal(swapped.falsifier, "F-ORDER");
      } finally {
        await store.close();
      }
    } finally {
      cluster.stop();
      if (previous == null) delete process.env.MANAGED_ORDER_PG_PORT;
      else process.env.MANAGED_ORDER_PG_PORT = previous;
    }
  });

  it("portable consumer source against extracted serve-execution: unsupported then local acquire", async () => {
    const child = spawn(process.execPath, [servePath], {
      cwd: kit,
      env: { ...process.env, HOST: "127.0.0.1", PORT: "0", TMPDIR: work },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    const origin = await new Promise((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => reject(new Error("serve-execution produced no origin: " + stderr.slice(0, 800))), 20_000);
      child.stdout.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        const nl = buf.indexOf("\n");
        if (nl >= 0) {
          clearTimeout(timer);
          try {
            const line = JSON.parse(buf.slice(0, nl));
            if (!line.origin) reject(new Error("serve-execution origin missing"));
            else resolve(line.origin);
          } catch (err) {
            reject(err);
          }
        }
      });
    });
    try {
      const { uniquePair, runCli } = await import(pathToFileURL(join(root, "experiments/wave5/d14/test/helpers.mjs")).href);
      const pair = uniquePair();
      const ticket = join(work, "portable-ticket.json");
      const submitted = runCli([
        "submit", "--base", origin, "--job", "vendor-budget-impact",
        "--before", pair.beforePath, "--after", pair.afterPath,
        "--ticket", ticket, "--execution-id", "packaged-145-portable",
      ]);
      assert.equal(submitted.status, 0, submitted.stderr + submitted.stdout);
      const fetchOut = join(work, "portable-result.json");
      const fetched = runCli(["fetch", "--ticket", ticket, "--out", fetchOut]);
      assert.equal(fetched.status, 0, fetched.stderr + fetched.stdout);
      const fetchStdout = JSON.parse(fetched.stdout);
      assert.equal(fetchStdout.acquisition.code, "unsupported-portable-acquisition");
      assert.equal(fetchStdout.httpArtifactsDelivered, false);
      const fetchFile = JSON.parse(readFileSync(fetchOut, "utf8"));
      const hostJson = fetchFile.result.outputs.find((o) => o.name === "budget-impact.json")?.path;
      const hostMd = fetchFile.result.outputs.find((o) => o.name === "budget-impact.md")?.path;
      mkdirSync(join(work, "local-arts"), { recursive: true });
      writeFileSync(join(work, "local-arts", "budget-impact.json"), readFileSync(hostJson));
      writeFileSync(join(work, "local-arts", "budget-impact.md"), readFileSync(hostMd));
      const acquired = runCli([
        "fetch", "--ticket", ticket, "--out", join(work, "portable-local.json"),
        "--local-artifacts", join(work, "local-arts"), "--acquire-to", join(work, "acquired"),
      ]);
      assert.equal(acquired.status, 0, acquired.stderr + acquired.stdout);
      const acq = JSON.parse(acquired.stdout).acquisition;
      assert.equal(acq.code, "local-acquired");
      assert.equal(acq.httpArtifactsDelivered, false);
      assert.equal(existsSync(join(work, "acquired", "budget-impact.json")), true);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
        await exited;
        clearTimeout(timer);
      }
    }
  });
});
