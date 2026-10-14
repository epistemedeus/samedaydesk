import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { feeAtoms } from "../src/fee.mjs";
import { runMaintenanceOccurrence } from "../src/occurrence.mjs";
import { PINS } from "../src/pins.mjs";
import { TEMPLATE } from "../src/template.mjs";
import { sha256Hex } from "../../recurring-job-recipes/lib/hash.mjs";
import { packageRoot, priorPath, request } from "./support.mjs";

test("pins and the acceptance template match the checked-in files", () => {
  const pins = JSON.parse(readFileSync(join(packageRoot, "PINS.json"), "utf8"));
  const template = JSON.parse(readFileSync(join(packageRoot, "template.json"), "utf8"));
  assert.equal(sha256Hex(pins), sha256Hex(PINS));
  assert.equal(sha256Hex(template), sha256Hex(TEMPLATE));
  assert.equal(pins.consumed.e01.receiptHead, "7f458d5156fb308a5586bdba30a2ff7ae01357ab");
  assert.equal(pins.consumed.e02.receiptHead, "338b9dfebf415d00ee0a21773d4d7f848d9ba4d6");
  assert.equal(pins.consumed.e06.receiptHead, "75312c3ac1590dbf913ae516b7fb76c9db6e74d9");
  assert.equal(pins.consumed.supplier228200.disposition, "no-delta");
  assert.equal(pins.consumed.finiteQueue228300.copied, false);
  assert.equal(template.occurrence, "one-finite");
});

test("a caller cannot substitute a different consumed head", async () => {
  const result = await runMaintenanceOccurrence(request({ e01Head: "ccffedf34f356ed6a90123b80f655df9ae7ce850" }));
  assert.equal(result.code, "consumed_head_mismatch");
  assert.equal(result.executed, false);
});

test("supplier rerun, queue, scheduler, and forced repurchase do not run", async () => {
  let reads = 0;
  const detect = async () => {
    reads += 1;
    return { outcome: "changed" };
  };
  const supplier = await runMaintenanceOccurrence(request({ rerunSupplier228200: true }), { detect });
  const queue = await runMaintenanceOccurrence(request({ enqueue: true }), { detect });
  const timer = await runMaintenanceOccurrence(request({ timer: true }), { detect });
  const schedule = await runMaintenanceOccurrence(request({ schedule: "cron" }), { detect });
  const repurchase = await runMaintenanceOccurrence(request({ forceRepurchase: true }), { detect });
  const live = await runMaintenanceOccurrence(request({ liveSafe: true }), { detect });
  assert.equal(reads, 0);
  assert.equal(supplier.code, "supplier_228200_no_delta");
  assert.equal(queue.code, "queue_refused");
  assert.equal(timer.code, "scheduler_refused");
  assert.equal(schedule.code, "scheduler_refused");
  assert.equal(repurchase.code, "repurchase_refused");
  assert.equal(live.code, "live_fetch_refused");
  for (const result of [supplier, queue, timer, schedule, repurchase, live]) {
    assert.equal(result.timerStarted, false);
    assert.equal(result.wroteQueue, false);
    assert.equal(result.supplier228200.rerun, false);
    assert.equal(result.paidTaskIncrement, 0);
  }
});

test("cold takeover refuses the same profile, incumbent pid, principal, and inherited authority", async () => {
  const sameProfile = await runMaintenanceOccurrence(request({
    procurement: { coldProfile: "incumbent-desk" },
  }));
  const samePid = await runMaintenanceOccurrence(request({
    procurement: { actorPid: 111 },
  }));
  const principal = await runMaintenanceOccurrence(request({
    procurement: { actorIsMandatePrincipal: true },
  }));
  const inherited = await runMaintenanceOccurrence(request({
    procurement: { inheritedAuthorityRequested: true, mandateState: "active" },
  }));
  assert.equal(sameProfile.code, "cold_takeover_refused");
  assert.equal(sameProfile.message, "same_profile");
  assert.equal(samePid.message, "incumbent_pid");
  assert.equal(principal.message, "mandate_principal");
  assert.equal(inherited.code, "inherited_authority");
});

test("tenant mismatch, client fee annotation, and identical task ids are refused", async () => {
  const tenant = await runMaintenanceOccurrence(request({ tenant: "other-tenant" }));
  const annotation = await runMaintenanceOccurrence(request({ annotation: { feeAtoms: "0" } }));
  const tasks = await runMaintenanceOccurrence(request({ distinctTaskId: "cedar-chair-reuse" }));
  const reviewer = await runMaintenanceOccurrence(request({ review: { reviewer: "other-reviewer" } }));
  assert.equal(tenant.code, "tenant_refused");
  assert.equal(annotation.code, "authority_annotation_refused");
  assert.equal(tasks.code, "tasks_not_distinct");
  assert.equal(reviewer.code, "wrong_reviewer");
});

test("a conflicting readback does not adopt a second acceptance", async () => {
  const first = await runMaintenanceOccurrence(request());
  const second = await runMaintenanceOccurrence(request({
    review: { decision: "reject" },
    priorAttempt: { occurrenceId: first.occurrenceId, digest: first.digest },
  }));
  assert.equal(second.code, "ambiguous_conflict");
  assert.equal(second.secondPost, false);
  assert.equal(second.acceptance, "refused");
  assert.equal(second.executed, false);
  assert.notEqual(second.acceptance, "rejected");
  assert.equal(second.settled, false);
});

test("a tampered prior digest and a non-advancing sequence are refused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ae14-e11-"));
  const prior = JSON.parse(readFileSync(priorPath, "utf8"));
  prior.sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const broken = join(dir, "prior.json");
  writeFileSync(broken, JSON.stringify(prior));
  const mismatch = await runMaintenanceOccurrence(request({ priorPath: broken }));
  const staleSequence = await runMaintenanceOccurrence(request({ sequence: 1 }));
  assert.equal(mismatch.code, "prior_digest_mismatch");
  assert.equal(staleSequence.code, "sequence_not_advanced");
});

test("opt-in reuse exports an observation and still grants no permission", async () => {
  const result = await runMaintenanceOccurrence(request({ optIn: true }));
  assert.equal(result.reuse.exportOk, true);
  assert.equal(result.reuse.granted, false);
  assert.equal(result.reuse.publicSafeCertified, false);
  assert.equal(result.reuse.observation.execute, false);
  assert.equal(result.reuse.observation.schema, "neomorphic.task-memory.observation.v1");
  assert.equal(JSON.stringify(result.reuse.observation).includes("/home/"), false);
});

test("the package source does not start a timer, queue, or supplier rerun", () => {
  const files = [
    ...readdirSync(join(packageRoot, "src")).map((name) => join(packageRoot, "src", name)),
    join(packageRoot, "cli.mjs"),
  ];
  const banned = ["setInterval", "setTimeout", "node-cron", "child_process"];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const word of banned) assert.equal(text.includes(word), false, `${file} contains ${word}`);
  }
});

test("legacy 221400 and 234100 stay unpriced by the new fee", async () => {
  const old = await runMaintenanceOccurrence(request({
    economics: { termsVersion: "221400", grossAtoms: undefined, applyNewFee: false },
  }));
  const trial = await runMaintenanceOccurrence(request({
    economics: { termsVersion: "234100", grossAtoms: undefined },
  }));
  const reprice = await runMaintenanceOccurrence(request({
    economics: { termsVersion: "234100", grossAtoms: undefined, applyNewFee: true },
  }));
  assert.equal(old.ok, true);
  assert.deepEqual(old.economics.rewardsAtoms, ["10000", "50000"]);
  assert.equal(old.economics.feeAtoms, "0");
  assert.equal(old.economics.repriced, false);
  assert.equal(trial.economics.netUsdc, "0.10");
  assert.equal(trial.economics.netAtoms, null);
  assert.equal(trial.economics.feeApplied, false);
  assert.equal(reprice.code, "legacy_reprice_refused");
  assert.equal(reprice.economics.feeAtoms, "0");
  assert.equal(reprice.economics.netUsdc, "0.10");
  assert.equal(feeAtoms(20n), 1n);
});
