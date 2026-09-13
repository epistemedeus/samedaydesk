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
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function tempDir(prefix) {
  return mkdtempSync(join(process.env.TMPDIR || tmpdir(), prefix));
}

function writePair(dir, first, second) {
  writeFileSync(join(dir, "first.json"), first);
  writeFileSync(join(dir, "second.json"), second);
}

describe("packaged 1.4.4 frozen candidate: wrapper/interrupt plus known-bad M01/pg", { timeout: 300_000 }, () => {
  const work = tempDir("packaged-144-");
  const archive144 = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.4.tar.gz");
  const archive143 = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.3.tar.gz");
  const pin144 = JSON.parse(readFileSync(join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.4.sha256.json"), "utf8"));
  const kit = join(work, "useful-jobs-1.4.4");
  const extract = spawnSync("tar", ["-xzf", archive144, "-C", work], { encoding: "utf8" });
  assert.equal(extract.status, 0, extract.stderr);
  const wrapperPath = join(kit, "server/paid-useful-jobs/lib/wrapper.mjs");
  const orderPath = join(kit, "tools/managed-useful-jobs-order/lib/create-order.mjs");
  const httpPath = join(kit, "server/paid-useful-jobs/lib/http.mjs");
  const storePath = join(kit, "tools/managed-useful-jobs-order/lib/store-postgres.mjs");
  const servePath = join(kit, "server/paid-useful-jobs/bin/serve-execution.mjs");
  const wrapperRoot = join(kit, "server/paid-useful-jobs");
  const fixtures = join(kit, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact");
  const orders = join(kit, "tools/managed-useful-jobs-order/fixtures/orders");
  assert.equal(existsSync(join(kit, "node_modules")), false, "1.4.4 extract must not ship or symlink node_modules");
  after(() => rmSync(work, { recursive: true, force: true }));

  it("leaves unpublished 1.4.3 a18ab918 byte-identical and does not call it fixed", () => {
    const pub = readFileSync(archive143);
    const mirrored = readFileSync(join(root, "client/public/kit/useful-jobs-1.4.3.tar.gz"));
    assert.equal(pub.length, BYTES143);
    assert.equal(sha(pub), PIN143);
    assert.equal(mirrored.length, BYTES143);
    assert.equal(sha(mirrored), PIN143);
    const names = spawnSync("tar", ["-tzf", archive143], { encoding: "utf8" }).stdout.split("\n");
    assert.equal(names.some((row) => /wrapper\.mjs$/.test(row)), false);
    assert.equal(names.some((row) => /lib\/common\.mjs$/.test(row)), true);
  });

  it("extracted 1.4.4 includes wrapper publication rollback and interrupt guard", () => {
    const packed = readFileSync(archive144);
    assert.equal(packed.length, pin144.bytes);
    assert.equal(sha(packed), pin144.sha256);
    assert.equal(existsSync(wrapperPath), true);
    assert.equal(existsSync(orderPath), true);
    const wrapper = readFileSync(wrapperPath, "utf8");
    const order = readFileSync(orderPath, "utf8");
    assert.match(wrapper, /export function publishCompleteOutputs/);
    assert.match(wrapper, /rollback-incomplete/);
    assert.match(order, /interrupted-incomplete/);
    assert.equal(existsSync(join(kit, "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz")), true);
    assert.equal(existsSync(join(kit, "lib/common.mjs")), true);
    assert.equal(existsSync(join(kit, "bin/useful-jobs.mjs")), true);
  });

  it("extracted publishCompleteOutputs rolls back caller artifacts", async () => {
    const { publishCompleteOutputs, runPaidOffer, createExecutor } = await import(pathToFileURL(wrapperPath).href);
    const callerBudget = () => ({
      before: join(fixtures, "before.json"),
      after: join(fixtures, "after.json"),
    });

    const out = tempDir("puj-144-pub-");
    try {
      const firstName = "budget-impact.json";
      const secondName = "budget-impact.md";
      const previous = "previous caller-owned publication\n";
      writeFileSync(join(out, firstName), previous);
      mkdirSync(join(out, secondName));
      const result = await runPaidOffer({
        jobId: "vendor-budget-impact",
        inputs: callerBudget(),
        fundingIntent: "unfunded",
        outDir: out,
      });
      assert.equal(result.ok, false, "publication failure must refuse");
      assert.equal(result.sold, false);
      assert.equal(result.purchaseAuthority, false);
      assert.deepEqual(readFileSync(join(out, firstName)), Buffer.from(previous));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }

    const src = tempDir("puj-144-src-");
    const dest = tempDir("puj-144-dst-");
    try {
      writePair(src, "NEW-FIRST\n", "NEW-SECOND\n");
      const original = "ORIGINAL-FIRST\n";
      writeFileSync(join(dest, "first.json"), original);
      const pidBak = join(dest, `first.json.${process.pid}.bak`);
      writeFileSync(pidBak, "caller-owned-pid-bak\n");
      let installs = 0;
      assert.throws(
        () =>
          publishCompleteOutputs(src, dest, ["first.json", "second.json"], {
            afterInstall() {
              installs += 1;
              if (installs === 1) throw new Error("injected-after-first-install");
            },
          }),
        (err) => err.code === "publication-failed" && /injected-after-first-install/.test(err.message),
      );
      assert.equal(installs, 1);
      assert.equal(readFileSync(join(dest, "first.json"), "utf8"), original);
      assert.equal(existsSync(join(dest, "second.json")), false);
      assert.equal(readFileSync(pidBak, "utf8"), "caller-owned-pid-bak\n");
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }

    const execOut = tempDir("puj-144-exec-");
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
        inputs: callerBudget(),
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
    const { createFileStore } = await import(pathToFileURL(join(kit, "tools/managed-useful-jobs-order/lib/store-file.mjs")).href);
    const storeDir = tempDir("managed-144-store-");
    const store = createFileStore(storeDir);
    const raw = JSON.parse(readFileSync(join(orders, "ord-1.json"), "utf8"));
    const originalComplete = store.complete.bind(store);
    store.complete = async () => {
      throw Object.assign(new Error("simulated SIGKILL before store.complete"), { code: "SIMULATED_KILL" });
    };
    await assert.rejects(
      () => runCreateOrder(raw, { store, outDir: tempDir("managed-144-out-"), requestDir: orders, wrapperRoot }),
      (err) => err.code === "SIMULATED_KILL",
    );
    const journalPath = join(storeDir, "executions.jsonl");
    const before = readFileSync(journalPath, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(before.length, 1, "first engine run must already be journaled");
    const reserved = JSON.parse(readFileSync(join(storeDir, "ord-1.json"), "utf8"));
    assert.equal(reserved.status, "reserved");
    assert.equal(reserved.executionCount, 1);
    reserved.holderPid = 999999999;
    writeFileSync(join(storeDir, "ord-1.json"), `${JSON.stringify(reserved, null, 2)}\n`);
    store.complete = originalComplete;
    const reopened = await runCreateOrder(raw, { store, outDir: tempDir("managed-144-out2-"), requestDir: orders, wrapperRoot });
    const after = readFileSync(journalPath, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(after.length, 1, "ambiguous order automatically reran a completed real engine");
    if (reopened.ok) {
      assert.equal(reopened.wrapper.executionId, JSON.parse(before[0]).executionId);
    } else {
      assert.equal(reopened.ok, false);
      assert.equal(reopened.sold, false);
      assert.notEqual(reopened.delivery?.complete, true);
    }
  });

  it("cold install of frozen 1.4.4 bytes: kit CLI list plus SDS wrapper execute", async () => {
    const payload = readFileSync(archive144);
    assert.equal(payload.length, pin144.bytes);
    assert.equal(sha(payload), pin144.sha256);
    const archivePath = "/for-agents/useful-jobs/useful-jobs-1.4.4.tar.gz";
    const server = createServer((request, response) => {
      if (request.url !== archivePath) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "application/gzip", "content-length": payload.length });
      response.end(payload);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const coldRoot = tempDir("cold-144-");
    try {
      const origin = "http://127.0.0.1:" + server.address().port;
      const acquire = `useful_jobs_acquire() {
  local origin="\${USEFUL_JOBS_ORIGIN:-$1}"
  local bytes=${pin144.bytes}
  local sha=${pin144.sha256}
  local work tgz root
  work=$(mktemp -d "\${TMPDIR:-/tmp}/useful-jobs.XXXXXX") || return 1
  tgz="$work/useful-jobs-1.4.4.tar.gz"
  root="$work/useful-jobs-1.4.4"
  curl -fsSL --max-time 60 -o "$tgz" "$origin/for-agents/useful-jobs/useful-jobs-1.4.4.tar.gz" || { rm -rf "$work"; return 1; }
  python3 -c 'import hashlib,pathlib,sys; p=pathlib.Path(sys.argv[1]); b=p.read_bytes(); n=len(b); e=int(sys.argv[2]); (n==e) or sys.exit((sys.stderr.write("size %s != %s\\n" % (n, e)) or 1)); h=hashlib.sha256(b).hexdigest(); (h==sys.argv[3]) or sys.exit((sys.stderr.write("sha256 %s != %s\\n" % (h, sys.argv[3])) or 1))' "$tgz" "$bytes" "$sha" || { rm -rf "$work"; return 1; }
  tar -xzf "$tgz" -C "$work" || { rm -rf "$work"; return 1; }
  [ -f "$root/bin/useful-jobs.mjs" ] || { rm -rf "$work"; return 1; }
  printf '%s\\n' "$root"
  return 0
}
kit=$(useful_jobs_acquire) || exit 1
printf '%s\\n' "$kit"`;
      const acquired = await execFileAsync("bash", ["-lc", acquire], {
        cwd: coldRoot,
        env: { ...process.env, TMPDIR: coldRoot, USEFUL_JOBS_ORIGIN: origin },
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const coldKit = acquired.stdout.trim();
      assert.ok(coldKit.startsWith(coldRoot + "/"));
      assert.equal(existsSync(join(coldKit, "bin/useful-jobs.mjs")), true);
      assert.equal(existsSync(join(coldKit, "server/paid-useful-jobs/lib/wrapper.mjs")), true);
      const listed = spawnSync(process.execPath, [join(coldKit, "bin/useful-jobs.mjs"), "list"], {
        cwd: coldKit,
        encoding: "utf8",
        timeout: 30_000,
      });
      assert.equal(listed.status, 0, listed.stderr);
      assert.match(listed.stdout + listed.stderr, /vendor-budget-impact/);
      const { runPaidOffer } = await import(pathToFileURL(join(coldKit, "server/paid-useful-jobs/lib/wrapper.mjs")).href);
      const out = join(coldRoot, "published");
      mkdirSync(out);
      const result = await runPaidOffer({
        jobId: "vendor-budget-impact",
        inputs: {
          before: join(coldKit, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json"),
          after: join(coldKit, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json"),
        },
        fundingIntent: "unfunded",
        outDir: out,
      });
      assert.equal(result.ok, true, result.error);
      assert.equal(result.sold, false);
      assert.equal(result.purchaseAuthority, false);
      assert.equal(result.contract, "samedaydesk.paid-useful-jobs.execution.v1");
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
          executionId: "packaged-144-principal",
          inputs: { before: join(fixtures, "before.json"), after: join(fixtures, "after.json") },
        }),
      });
      assert.equal(posted.status, 200);
      const body = await posted.json();
      assert.equal(body.ok, true, body.error);
      const foreign = await fetch(`${origin}/results/packaged-144-principal`, {
        headers: { authorization: "Bearer cw65-synthetic-principal-b" },
      });
      assert.equal(foreign.status, 403);
      const foreignBody = await foreign.json();
      assert.equal(foreignBody.code, "principal-mismatch");
      const owner = await fetch(`${origin}/results/packaged-144-principal`, {
        headers: { authorization: "Bearer cw65-synthetic-principal-a" },
      });
      assert.equal(owner.status, 200);
      assert.equal((await owner.json()).executionId, "packaged-144-principal");
    } finally {
      server.close();
    }
  });

  it("known-bad: extracted 1.4.4 M01 lockfile-pin-delta does not use engines/ and git-fetches", async () => {
    const { runPaidOffer } = await import(pathToFileURL(wrapperPath).href);
    const out = tempDir("m01-144-known-bad-");
    const result = await runPaidOffer({
      jobId: "lockfile-pin-delta",
      inputs: {
        before: join(kit, "engines/lockfile-pin-delta/fixtures/journey/before.json"),
        after: join(kit, "engines/lockfile-pin-delta/fixtures/journey/after.json"),
      },
      fundingIntent: "unfunded",
      outDir: out,
    });
    assert.equal(result.ok, false);
    assert.equal(result.sold, false);
    assert.equal(result.code, "engine-crash");
    assert.match(String(result.error || ""), /git fetch|not a git repository|packaged-runtime/);
    assert.equal(existsSync(join(kit, "engines/lockfile-pin-delta/bin/lockfile-delta.mjs")), true);
    assert.equal(existsSync(join(kit, "tools/lockfile-pin-delta/bin/lockfile-delta.mjs")), false);
  });

  it("known-bad: extracted 1.4.4 store-postgres cannot import pg without a hidden host node_modules", async () => {
    await assert.rejects(
      () => import(pathToFileURL(storePath).href),
      (err) => err.code === "ERR_MODULE_NOT_FOUND" && /['\"]pg['\"]/.test(String(err.message)),
    );
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
        "submit",
        "--base",
        origin,
        "--job",
        "vendor-budget-impact",
        "--before",
        pair.beforePath,
        "--after",
        pair.afterPath,
        "--ticket",
        ticket,
        "--execution-id",
        "packaged-144-portable",
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
      assert.equal(typeof hostJson, "string");
      mkdirSync(join(work, "local-arts"), { recursive: true });
      writeFileSync(join(work, "local-arts", "budget-impact.json"), readFileSync(hostJson));
      writeFileSync(join(work, "local-arts", "budget-impact.md"), readFileSync(hostMd));
      const acquired = runCli([
        "fetch",
        "--ticket",
        ticket,
        "--out",
        join(work, "portable-local.json"),
        "--local-artifacts",
        join(work, "local-arts"),
        "--acquire-to",
        join(work, "acquired"),
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
