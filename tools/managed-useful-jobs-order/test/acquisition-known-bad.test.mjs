import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { AcquisitionRefuse } from "../lib/acquisition-errors.mjs";
import {
  createAcquisitionService,
  createForbiddenSeamSpies,
  createProcessLocalMissingSeam,
} from "../lib/acquisition.mjs";
import { createFileStore } from "../lib/store-file.mjs";
import { runCreateOrder } from "../lib/create-order.mjs";
import {
  PRINCIPAL_A,
  SERVER_LATER,
  SERVER_NOW,
  admitAndPublish,
  fileService,
  frozenHash,
  tmpDir,
} from "./acquisition-helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "../../..");
const H21_SKELETON = join(
  REPO_ROOT,
  "experiments/codex-window/h21-package-release-gate/test/hosted-acquisition.skeleton.test.mjs",
);

describe("HA1 known-bad controls for the missing seam", { timeout: 60_000 }, () => {
  it("process-local HTTP cache loses the record across restart; durable store does not", async () => {
    const missing = createProcessLocalMissingSeam();
    missing.publish("exec-old", { state: "available", outputs: [{ name: "pin-delta.json" }] });
    assert.equal(missing.get("exec-old").state, "available");
    missing.restart();
    assert.equal(missing.get("exec-old").state, "not-found");
    assert.throws(
      () => createAcquisitionService({ store: missing }),
      (err) => err instanceof AcquisitionRefuse && err.code === "store-unavailable",
    );

    const { service, dir } = await fileService();
    const first = await admitAndPublish(service, { executionId: "exec-durable" });
    const reopened = createAcquisitionService({ store: createFileStore(dir) });
    const got = await reopened.reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_LATER,
    );
    assert.equal(got.state, "available");
    assert.equal(got.outputs.length, 2);
  });

  it("request-body principal and raw bearer tokens are refused", async () => {
    const store = createFileStore(tmpDir("ha1-body-"));
    const refused = await runCreateOrder(
      {
        engineId: "lockfile-pin-delta",
        orderId: "ord-body-principal",
        principalId: "attacker",
        purchaseAuthority: false,
        inputs: [],
      },
      { store, acquisition: { admit() {}, publishCompleted() {} }, serverNow: SERVER_NOW },
    );
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "untrusted-principal");
    assert.equal(refused.purchaseAuthority, false);

    const token = await runCreateOrder(
      {
        engineId: "lockfile-pin-delta",
        orderId: "ord-bearer",
        authorization: "Bearer abc",
        purchaseAuthority: false,
        inputs: [],
      },
      { store, acquisition: { admit() {}, publishCompleted() {} }, serverNow: SERVER_NOW },
    );
    assert.equal(token.ok, false);
    assert.equal(token.code, "untrusted-principal");
  });

  it("request-supplied clocks cannot persist expiry", async () => {
    const store = createFileStore(tmpDir("ha1-clock-"));
    const refused = await runCreateOrder(
      {
        engineId: "lockfile-pin-delta",
        orderId: "ord-clock",
        clock: SERVER_NOW,
        purchaseAuthority: false,
        inputs: [],
      },
      { store, acquisition: { admit() {}, publishCompleted() {} }, serverNow: SERVER_NOW },
    );
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "untrusted-clock");
  });

  it("injected engine/payment/outbox spies increment when called; the reader does not call them", async () => {
    const seams = createForbiddenSeamSpies();
    assert.equal(seams.calls.runCreateOrder, 0);
    assert.throws(() => seams.spies.runCreateOrder(), /forbidden seam runCreateOrder/);
    assert.equal(seams.calls.runCreateOrder, 1);
    const { service, reader } = await fileService({ seams });
    seams.calls.runCreateOrder = 0;
    const first = await admitAndPublish(service, { executionId: "exec-spy" });
    await reader.get(
      { principalId: PRINCIPAL_A, executionId: first.executionId, requestHash: first.requestHash },
      SERVER_LATER,
    );
    await reader.openVerified(
      {
        principalId: PRINCIPAL_A,
        executionId: first.executionId,
        requestHash: first.requestHash,
        name: "pin-delta.json",
        sha256: first.pair.outputs[0].sha256,
      },
      SERVER_LATER,
    );
    assert.equal(seams.calls.runCreateOrder, 0);
    assert.equal(seams.calls.runPaidOffer, 0);
    assert.equal(seams.calls.enqueue, 0);
    const src = readFileSync(join(here, "../lib/acquisition.mjs"), "utf8");
    assert.equal(
      /forbiddenSeams\.\w+\(/.test(src),
      false,
      "reader must not invoke injected forbiddenSeams",
    );
    assert.equal(/\brunCreateOrder\(/.test(src), false);
    assert.equal(/\brunPaidOffer\(/.test(src), false);
  });

  it("H21 skeleton still records ten TODO obligations, counted separately from HA1", () => {
    const text = readFileSync(H21_SKELETON, "utf8");
    const todos = [...text.matchAll(/test\.todo\(/g)];
    assert.equal(todos.length, 10, "H21 design scaffolding must remain ten TODOs");
    assert.match(text, /Intentionally TODO/);
    assert.match(text, /D14 downloads from a second directory/);
    assert.match(text, /Range and redirects refuse/);
  });
});
