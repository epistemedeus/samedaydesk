import test from "node:test";
import assert from "node:assert/strict";
import { CODE, SETTLEMENT_RECEIPT_VIEW } from "../src/constants.mjs";
import { createDesk } from "../src/desk.mjs";
import { assertNotSettlementReceipt, owedVersusPaid } from "../src/owed-versus-paid.mjs";
import { runDesk } from "./helpers.mjs";

test("owed-versus-paid never confirms settlement", async () => {
  const desk = createDesk();
  const view = (await desk.owedVersusPaid({ taskId: "tsk_owed_delta" })).result;
  assert.equal(view.owed, true);
  assert.equal(view.paid, false);
  assert.equal(view.settled, false);
  assert.equal(view.transfer, null);
  assert.equal(view.settlementReceiptView.relation, "disjoint");
  assert.equal(view.settlementReceiptView.owner, "R3-09");
  assertNotSettlementReceipt(view);
});

test("R3-09 settlement receipt view stays disjoint", () => {
  assert.equal(SETTLEMENT_RECEIPT_VIEW.owner, "R3-09");
  assert.equal(SETTLEMENT_RECEIPT_VIEW.relation, "disjoint");
  assert.equal(SETTLEMENT_RECEIPT_VIEW.rendersSettlementReceipt, false);
});

test("owed-versus-paid pins paid/settled/transfer even when the task record lies", () => {
  const view = owedVersusPaid(
    {
      id: "tsk_lie",
      payoutState: "owed",
      paid: true,
      settled: true,
      transfer: { tx: "0xabc" },
      obligation: { payoutState: "owed", transfer: { tx: "0xabc" }, contributorPublicId: "ctr_x" },
    },
    { now: "2026-09-17T15:00:00.000Z" },
  );
  assert.equal(view.owed, true);
  assert.equal(view.paid, false);
  assert.equal(view.settled, false);
  assert.equal(view.transfer, null);
  assert.equal(view.unlike, true);
  assertNotSettlementReceipt(view);
});

test("seeded failure: forged paid=false, settled=false, transfer=null is rejected without mutation", async () => {
  const desk = createDesk();
  const before = await desk.browse();
  const forged = { paid: false, settled: false, transfer: null };
  await assert.rejects(
    () => desk.owedVersusPaid({ taskId: "tsk_owed_delta", ...forged }),
    (error) => error.code === CODE.FORGED_SETTLEMENT_EVIDENCE && error.details.persisted === false,
  );
  await assert.rejects(
    () =>
      desk.claim({
        taskId: "tsk_open_alpha",
        contributorPublicId: "ctr_walrus",
        ...forged,
      }),
    (error) => error.code === CODE.FORGED_SETTLEMENT_EVIDENCE,
  );
  const after = await desk.browse();
  assert.deepEqual(after.result.tasks, before.result.tasks);
  const open = after.result.tasks.find((task) => task.id === "tsk_open_alpha");
  assert.equal(open.claimable, true);
  assert.equal(open.lifecycle, "open");

  const cli = runDesk([
    "owed-versus-paid",
    "--task",
    "tsk_owed_delta",
    "--paid",
    "false",
    "--settled",
    "false",
    "--transfer",
    "null",
  ]);
  assert.notEqual(cli.status, 0);
  assert.equal(cli.status, 1);
  assert.equal(cli.json.ok, false);
  assert.equal(cli.json.code, CODE.FORGED_SETTLEMENT_EVIDENCE);
  assert.equal(cli.json.details.persisted, false);
  assert.deepEqual(cli.json.details.fields, ["paid", "settled", "transfer"]);
  assert.equal(JSON.stringify(cli.json).includes('"owed": true'), false);
});
