import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SCHEMA, resolveFlushId, runCase } from "../src/cohort.mjs";
import { PINNED_NONCE_A, sqlNonceContract } from "../src/engine.mjs";
import { buildSeededReport, runSeededFailure } from "../src/seeded.mjs";

const PACK = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = join(PACK, "run.mjs");

function run(args) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: "utf8",
    cwd: PACK,
    timeout: 60_000,
  });
}

test("empty flushId is not rewritten to the pinned nonce", async () => {
  assert.equal(resolveFlushId({ flushId: "" }, { flushId: PINNED_NONCE_A }), "");
  assert.equal(resolveFlushId({}, { flushId: "" }), "");
  assert.equal(resolveFlushId({}, {}), PINNED_NONCE_A);

  const result = await runCase({
    id: "empty-flush-not-pinned",
    kind: "store",
    flushId: "",
    steps: [{ delta: { total: 2, humans: 2 }, expectStatus: "applied" }],
    expect: { acks: ["applied"], snapshotTotal: 2, flushIds: [""] },
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.deepEqual(result.flushIds, [""]);
  assert.notEqual(result.flushIds[0], PINNED_NONCE_A);
});

test("empty flushId enqueue is not silently queued as the pinned nonce", async () => {
  const result = await runCase({
    id: "empty-fallback-not-pinned",
    kind: "fallback",
    flushId: "",
    steps: [{ action: "enqueue", delta: { total: 2, humans: 2 } }],
    expect: { outcomes: ["write_failed"] },
  });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.deepEqual(result.outcomes, ["write_failed"]);
});

test("missing fixture is a case failure envelope, not a thrown ENOENT", async () => {
  const result = await runCase({
    id: "missing-fixture",
    file: "does-not-exist.json",
    kind: "store",
  });
  assert.equal(result.ok, false);
  assert.equal(result.id, "missing-fixture");
  assert.match(String(result.errors[0]), /ENOENT|no such file/i);
});

test("seeded report extra cannot overwrite ok, paymentSent, or code", () => {
  const body = buildSeededReport({
    id: "payment-to-mint-nonce",
    rejected: true,
    code: "payment_forbidden",
    message: "refused",
    extra: {
      ok: true,
      rejected: false,
      code: "laundered",
      schema: "evil.v0",
      paymentSent: true,
      checkout: true,
      publish: true,
      mode: "live",
    },
  });
  assert.equal(body.schema, SCHEMA);
  assert.equal(body.ok, true);
  assert.equal(body.rejected, true);
  assert.equal(body.code, "payment_forbidden");
  assert.equal(body.mode, "seeded-failure");
  assert.equal(body.paymentSent, false);
  assert.equal(body.checkout, false);
  assert.equal(body.publish, false);
});

test("prototype seeded ids are unknown_seeded_failure, not handler calls", async () => {
  for (const id of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    const result = await runSeededFailure(id);
    assert.equal(result.ok, false, id);
    assert.equal(result.rejected, false, id);
    assert.equal(result.code, "unknown_seeded_failure", id);
  }
});

test("sql null-nonce pin does not match a raise after an empty if-body", () => {
  const split = [
    "create or replace function public.pulse_apply_delta(p_flush_id uuid, p_delta jsonb)",
    "if p_flush_id is null then",
    "end if;",
    "raise exception 'pulse_invalid_flush_id'",
  ].join("\n");
  assert.equal(sqlNonceContract(split).nullNonce, false);
  assert.equal(sqlNonceContract().nullNonce, true);
});

test("CLI --live= and --payment= are payment-forbidden (exit 2)", () => {
  for (const flag of ["--live=https://evil.example/extract", "--payment=1", "--Pay", "--publish=npm"]) {
    const result = run([flag]);
    assert.equal(result.status, 2, flag);
    const body = JSON.parse(result.stderr);
    assert.equal(body.error.code, "payment-forbidden", flag);
  }
});

test("CLI --seeded-failure toString stays an unknown seed envelope", () => {
  const result = run(["--seeded-failure", "toString"]);
  assert.equal(result.status, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.code, "unknown_seeded_failure");
  assert.equal(body.ok, false);
  assert.equal(body.rejected, false);
});
