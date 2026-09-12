import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

const source = process.env.VENDOR_COMMON_TEST_SOURCE || fileURLToPath(new URL("../release/lib/common.mjs", import.meta.url));
function fixture(t, broken = false) {
  const root = mkdtempSync(join(tmpdir(), "vendor-lifecycle-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const kit = join(root, "kit"), scratch = join(root, "scratch");
  mkdirSync(join(kit, "lib"), { recursive: true });
  mkdirSync(join(kit, "vendor-pins"));
  mkdirSync(scratch);
  const payload = join(root, "payload");
  mkdirSync(payload);
  writeFileSync(join(payload, "source.txt"), "regenerable fixture");
  copyFileSync(source, join(kit, "lib/common.mjs"));
  const archive = join(kit, "vendor-pins/fixture.tgz");
  assert.equal(spawnSync("tar", ["-czf", archive, "-C", root, "payload"]).status, 0);
  writeFileSync(join(kit, "vendor-pins/PIN.json"), JSON.stringify({ archives: {
    "record-repeat-job": { file: "fixture.tgz" },
    "distribution-repair": { file: broken ? "missing.tgz" : "fixture.tgz" },
  } }));
  const prelude = `import fs from 'node:fs'; import {ensureVendorsExtracted,cleanupVendors} from ${JSON.stringify(pathToFileURL(join(kit, "lib/common.mjs")).href)};`;
  return { root, kit, scratch, prelude, env: { ...process.env, TMPDIR: scratch } };
}

test("normal exit removes exact extraction and reuses it within one process", (t) => {
  const f = fixture(t);
  const sentinel = join(f.scratch, "unrelated-customer-result");
  writeFileSync(sentinel, "preserve");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", f.prelude + `const first=ensureVendorsExtracted(); if(first!==ensureVendorsExtracted()) throw Error('not reused'); console.log(first);`], { env: f.env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(result.stdout.trim()), false);
  assert.deepEqual(readdirSync(f.scratch), ["unrelated-customer-result"]);
});

test("explicit cleanup is idempotent and permits a fresh extraction", (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", f.prelude + `const first=ensureVendorsExtracted(); cleanupVendors(); cleanupVendors(); const second=ensureVendorsExtracted(); if(first===second || fs.existsSync(first)) throw Error('reused dead extraction');`], { env: f.env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(f.scratch), []);
});

test("partial extraction failure cleans immediately and does not poison retry", (t) => {
  const f = fixture(t, true);
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", f.prelude + `for(let i=0;i<2;i++){let failed=false;try{ensureVendorsExtracted()}catch{failed=true}if(!failed || fs.readdirSync(process.env.TMPDIR).length) throw Error('partial result survived');}`], { env: f.env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(f.scratch), []);
});

for (const signal of ["SIGTERM", "SIGINT"]) test(`${signal} cleans scratch and preserves signal exit`, async (t) => {
  const f = fixture(t);
  const child = spawn(process.execPath, ["--input-type=module", "-e", f.prelude + `console.log(ensureVendorsExtracted()); setInterval(()=>{},1000);`], { env: f.env, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  t.after(() => clearTimeout(timeout));
  const ready = await once(child.stdout, "data");
  const owned = ready[0].toString().trim();
  assert.equal(existsSync(owned), true);
  const exited = once(child, "exit");
  child.kill(signal);
  const [code, receivedSignal] = await exited;
  assert.equal(code, null);
  assert.equal(receivedSignal, signal);
  assert.equal(existsSync(owned), false);
});
