import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { REQUEST_KIND } from "../src/client-endpoint.mjs";
import { openDurableApplyReceipts } from "../src/durable-receipts.mjs";
import { ledgerKeyOf } from "../src/ledger.mjs";
import { mappingRegistry, periodNRequest, periodNPlus1Request, SCENARIO_CLOCK } from "../src/fixtures.mjs";
import { readJson } from "./helpers.mjs";

const entry = new URL("../src/serve.mjs", import.meta.url).href;
const storeFile = t => {
  const temp = mkdtempSync(join(realpathSync(tmpdir()), "sds-n12-receipt-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  return join(temp, "receipts.sqlite");
};
const init = file => openDurableApplyReceipts(file, {initialize:true}).close();

async function start(t, path, faults = []) {
  const code = `import {serveLocalChangedPeriod} from ${JSON.stringify(entry)}; serveLocalChangedPeriod(process.argv[1], {
    port:0, now:() => ${JSON.stringify(SCENARIO_CLOCK)}, faults: JSON.parse(process.argv[2]),
  });`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code, path, JSON.stringify(faults)], {stdio:["ignore","pipe","pipe"]});
  const exit = once(child, "exit");
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  const lines = createInterface({input:child.stdout});
  async function stop() {
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
    return exit;
  }
  t.after(stop);
  const ready = await Promise.race([
    once(lines, "line").then(([line]) => JSON.parse(line)),
    exit.then(() => { throw new Error("worker exited before ready: " + stderr); }),
    delay(5000, null, {ref:false}).then(() => { throw new Error("worker not ready: " + stderr); }),
  ]);
  assert.equal(ready.host, "127.0.0.1");
  const post = async (route, body, key) => {
    const r = await fetch(`http://127.0.0.1:${ready.port}/${route}`, {
      method:"POST", headers:{"content-type":"application/json", ...(key && {"Idempotency-Key":key})},
      body:JSON.stringify(body), signal:AbortSignal.timeout(4000),
    });
    return {status:r.status, body:await r.json()};
  };
  return {
    stop, post,
    evaluate: async request => {
      const r = await post("evaluate", {kind:REQUEST_KIND, platform:"direct", ...request, mappings:mappingRegistry()});
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
      return r.body;
    },
    apply: (r, periodId) => post("apply", {periodId, recordKey:r.recordKey, idempotencyKey:r.idempotencyKey, ledgerKey:r.ledgerKey}, r.ledgerKey),
  };
}

test("committed lost reply and prior terms survive a killed worker and the normal HTTP restart", async t => {
  const file = storeFile(t);
  init(file);
  const first = await start(t, file, [{type:"lost_apply_reply", periodId:"period-N+1", recordKey:"r-003"}]);
  const base = await first.evaluate(periodNRequest());
  const firstReceipts = [];
  for (const row of base.records) {
    const applied = await first.apply(row, base.periodId);
    assert.equal(applied.status, 201);
    firstReceipts.push(applied.body.receipt);
  }
  const next = periodNPlus1Request({stale:false});
  const before = await first.evaluate(next);
  const selected = before.records.find(row => row.recordKey === "r-003");
  assert.equal(selected.comparison, "useful_change");
  await assert.rejects(first.apply(selected, before.periodId), {name:"TypeError"});
  assert.equal((await first.stop())[1], "SIGKILL");

  const second = await start(t, file);
  const original = await second.apply(selected, before.periodId);
  assert.equal(original.status, 200);
  assert.equal(original.body.duplicate, true);
  assert.equal(original.body.receipt.applyCount, 1);
  assert.equal((await second.apply(selected, "another-period")).status, 409);
  const pending = before.records.find(row => row.recordKey === "r-001");
  const absent = await second.apply(pending, before.periodId);
  assert.equal(absent.body.exception.code, "apply_without_evaluation");
  const after = await second.evaluate(next);
  assert.equal(after.records.find(row => row.recordKey === "r-001").comparison, "useful_change");
  const seen = after.records.find(row => row.recordKey === "r-003");
  assert.equal(seen.outcome, "already_applied");
  assert.deepEqual(seen.receipt, original.body.receipt);
  const wrongTerms = await second.evaluate(readJson("fixtures/period-n.terms-changed.request.json"));
  assert.deepEqual(wrongTerms.records.map(row => row.exception.code), Array(3).fill("terms_changed"));
  assert.deepEqual(wrongTerms.records.map(row => row.receipt), firstReceipts);
  await second.stop();
  const store = openDurableApplyReceipts(file);
  try { assert.equal(store.effects(), 4); } finally { store.close(); }
});

test("two open writers preserve the first same-context result and isolate different contexts", t => {
  const file = storeFile(t);
  init(file);
  const a = openDurableApplyReceipts(file), b = openDurableApplyReceipts(file);
  try {
    const idempotencyKey = "sha256:" + "a".repeat(64);
    const row = {idempotencyKey, ledgerKey:ledgerKeyOf(idempotencyKey,"row-1"), termsVersion:"sha256:"+"c".repeat(64),
      contextId:"c1", periodId:"p1", recordKey:"row-1", taskId:"tsk_one", captureId:"cap1", mappingVersion:"v1",
      output:{title:"first"}, appliedAt:SCENARIO_CLOCK, platform:"n8n"};
    assert.equal(a.apply(row).applied, true);
    assert.equal(b.apply(row).applied, false);
    const changed = "sha256:"+"b".repeat(64);
    const conflicting = {...row, idempotencyKey:changed, ledgerKey:ledgerKeyOf(changed,row.recordKey), output:{title:"second"}};
    assert.equal(b.apply(conflicting).conflict, true);
    assert.deepEqual(b.forPeriodRecord("p1","row-1","c1").output, {title:"first"});
    assert.equal(b.apply({...conflicting, contextId:"c2"}).applied, true);
    assert.equal(a.effects(), 2);
  } finally { a.close(); b.close(); }
});

test("a missing database cannot be silently recreated, and init never overwrites it", t => {
  const file = storeFile(t);
  assert.throws(() => openDurableApplyReceipts(file), {code:"ENOENT"});
  init(file);
  assert.throws(() => init(file), {code:"EEXIST"});
  const store = openDurableApplyReceipts(file);
  try { assert.equal(store.effects(), 0); } finally { store.close(); }
});
