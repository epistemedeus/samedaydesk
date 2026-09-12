import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

test("packaged 1.4.3 extracts its real pinned vendors without leaving scratch", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const work = mkdtempSync(join(tmpdir(), "packaged-vendor-test-"));
  try {
    const archive = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.3.tar.gz");
    const extracted = spawnSync("tar", ["-xzf", archive, "-C", work], { encoding: "utf8" });
    assert.equal(extracted.status, 0, extracted.stderr);
    const source = join(work, "useful-jobs-1.4.3/lib/common.mjs");
    const controlEnv = { ...process.env, VENDOR_COMMON_TEST_SOURCE: source };
    // A nested Node test worker can otherwise inherit child-v8 IPC mode and
    // report no independent TAP failures to this parent process.
    delete controlEnv.NODE_TEST_CONTEXT;
    const controls = spawnSync(process.execPath, ["--test", fileURLToPath(new URL("vendor-temp-lifecycle.test.mjs", import.meta.url))], {
      env: controlEnv, encoding: "utf8",
    });
    assert.equal(controls.status, 0, controls.stdout + controls.stderr);
    assert.match(controls.stdout, /# tests 9\b/);
    assert.match(controls.stdout, /# pass 9\b/);
    assert.match(controls.stdout, /# fail 0\b/);
    const scratch = join(work, "scratch");
    mkdirSync(scratch);
    const code = `const m=await import(${JSON.stringify(pathToFileURL(source).href)}); m.assertArchivePins(); console.log(m.ensureVendorsExtracted());`;
    const processResult = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      env: { ...process.env, TMPDIR: scratch }, encoding: "utf8",
    });
    assert.equal(processResult.status, 0, processResult.stderr);
    assert.equal(existsSync(processResult.stdout.trim()), false);
    assert.deepEqual(readdirSync(scratch), []);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("actual packaged CLI cancellation keeps one application signal and stops owned children", async (t) => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const work = mkdtempSync(join(tmpdir(), "packaged-cancel-test-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const archive = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.4.3.tar.gz");
  assert.equal(spawnSync("tar", ["-xzf", archive, "-C", work]).status, 0);
  const kit = join(work, "useful-jobs-1.4.3");
  const app = join(kit, "apps", "fixture-cancel");
  const scratch = join(work, "scratch");
  mkdirSync(app);
  mkdirSync(scratch);
  const ready = join(work, "ready.json"), signals = join(work, "signals.txt");
  writeFileSync(signals, "");
  // Only this extracted test fixture's catalog/app are extended. The packaged
  // CLI, owned-spawn, and common.mjs under test remain byte-identical.
  const catalog = JSON.parse(readFileSync(join(kit, "catalog.json"), "utf8"));
  catalog.jobs.push({id:"fixture-cancel", outputs:[]});
  writeFileSync(join(kit, "catalog.json"), JSON.stringify(catalog));
  writeFileSync(join(app, "cli.mjs"), `
    import fs from 'node:fs';
    import {spawn} from 'node:child_process';
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,child:child.pid}));
    setInterval(()=>{},1000);
  `);
  const preload = join(work, "preload.mjs");
  writeFileSync(preload, `
    import fs from 'node:fs';
    import {ensureVendorsExtracted} from ${JSON.stringify(pathToFileURL(join(kit,"lib/common.mjs")).href)};
    process.on('SIGTERM',()=>fs.appendFileSync(${JSON.stringify(signals)},'signal\\n'));
    ensureVendorsExtracted();
  `);
  const child = spawn(process.execPath, ["--import", preload, join(kit, "bin/useful-jobs.mjs"), "run", "fixture-cancel"], {
    env: { ...process.env, TMPDIR: scratch }, stdio: ["ignore", "pipe", "pipe"],
  });
  let owned = [];
  const alive = pid => {
    try { return !/^State:\s+Z/m.test(readFileSync(`/proc/${pid}/status`, "utf8")); }
    catch { return false; }
  };
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    for (const pid of owned) if (alive(pid)) { try { process.kill(pid,"SIGKILL"); } catch {} }
  });
  const deadline = Date.now() + 5000;
  while (!existsSync(ready) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(existsSync(ready), true, "owned fixture became ready");
  const pids = JSON.parse(readFileSync(ready,"utf8"));
  owned = [pids.pid,pids.child];
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  t.after(() => clearTimeout(timeout));
  const [code, signal] = await exited;
  assert.equal(code, 1, `CLI cancellation exit changed: ${signal}`);
  assert.equal(readFileSync(signals,"utf8"), "signal\n");
  const stopped = Date.now() + 3000;
  while (owned.some(alive) && Date.now() < stopped) await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(owned.filter(alive), [], "owned child and grandchild stopped");
  assert.deepEqual(readdirSync(scratch), [], "parent vendor scratch cleaned");
});
