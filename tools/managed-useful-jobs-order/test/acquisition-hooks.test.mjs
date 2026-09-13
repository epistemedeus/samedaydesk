import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runCreateOrder } from "../lib/create-order.mjs";
import { createFileStore } from "../lib/store-file.mjs";
import { createAcquisitionService } from "../lib/acquisition.mjs";
import { EXECUTION_CONTRACT } from "../lib/acquisition-constants.mjs";
import { sha256Bytes } from "../lib/acquisition-identity.mjs";
import {
  PRINCIPAL_A,
  PRINCIPAL_B,
  SERVER_LATER,
  SERVER_NOW,
  snapshotSideEffects,
  tmpDir,
  writeTempInputs,
} from "./acquisition-helpers.mjs";

function stubWrapper({ executionId, jobId, outDir, outputs, files, enginePin }) {
  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    writeFileSync(join(outDir, file.metadata.name), file.bytes);
  }
  let runs = 0;
  return {
    kind: "library",
    version: EXECUTION_CONTRACT,
    runs: () => runs,
    async runPaidOffer(request) {
      runs += 1;
      const id = request.executionId || executionId;
      const receiptOutputs = outputs.map((row) => ({
        name: row.name,
        bytes: row.bytes,
        sha256: row.sha256,
        path: join(outDir, row.name),
      }));
      return {
        ok: true,
        contract: EXECUTION_CONTRACT,
        jobId,
        executionId: id,
        transport: "ok",
        delivery: { complete: true },
        sample: false,
        outputs: receiptOutputs,
        receipt: {
          contract: EXECUTION_CONTRACT,
          jobId,
          executionId: id,
          transport: "ok",
          delivery: { complete: true },
          engine: { archiveSha256: enginePin.sha256, archiveBytes: enginePin.bytes },
          outputs: receiptOutputs,
          sample: false,
        },
        outDir,
        runOutDir: outDir,
      };
    },
  };
}

describe("HA1 create-order reservation and completion hooks", { timeout: 60_000 }, () => {
  it("admits before the engine and publishes verified bytes before complete", async () => {
    const storeDir = tmpDir("ha1-hook-store-");
    const outDir = tmpDir("ha1-hook-out-");
    const store = createFileStore(storeDir);
    const service = createAcquisitionService({ store, artifactRoot: store.artifactRoot });
    const inputs = writeTempInputs();
    const json = Buffer.from('{"ok":true,"job":"lockfile-pin-delta"}\n');
    const md = Buffer.from("# lockfile-pin-delta\n");
    const outputs = [
      { name: "pin-delta.json", kind: "file", bytes: json.length, sha256: sha256Bytes(json) },
      { name: "pin-delta.md", kind: "file", bytes: md.length, sha256: sha256Bytes(md) },
    ];
    const files = [
      { metadata: outputs[0], bytes: json },
      { metadata: outputs[1], bytes: md },
    ];
    const executionId = "exec-hook-1";
    const wrapper = stubWrapper({
      executionId,
      jobId: "lockfile-pin-delta",
      outDir,
      outputs,
      files,
      enginePin: inputs.request.enginePin,
    });
    const before = snapshotSideEffects(service.reader);
    const result = await runCreateOrder(
      { ...inputs.request, executionId },
      {
        store,
        outDir,
        requestDir: inputs.dir,
        wrapper,
        acquisition: service,
        auth: { principalId: PRINCIPAL_A, source: "trusted-application-context" },
        serverNow: SERVER_NOW,
      },
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(wrapper.runs(), 1);
    assert.equal(result.purchaseAuthority, false);
    assert.equal(result.sold, false);
    const binding = {
      principalId: PRINCIPAL_A,
      executionId,
      requestHash: (await store.getAcquisition(executionId)).requestHash,
    };
    const got = await service.reader.get(binding, SERVER_LATER);
    assert.equal(got.state, "available");
    assert.equal(got.jobId, "lockfile-pin-delta");
    assert.equal(got.sold, false);
    const opened = await service.reader.openVerified(
      { ...binding, name: "pin-delta.json", sha256: outputs[0].sha256 },
      SERVER_LATER,
    );
    assert.equal(Buffer.from(opened.bytes).toString("utf8"), json.toString("utf8"));
    assert.equal(service.reader.sideEffects.runCreateOrder, before.runCreateOrder);
    assert.equal(service.reader.sideEffects.enqueue, 0);

    const replay = await runCreateOrder(
      { ...inputs.request, executionId },
      {
        store,
        outDir: tmpDir("ha1-hook-out2-"),
        requestDir: inputs.dir,
        wrapper,
        acquisition: service,
        auth: { principalId: PRINCIPAL_A, source: "trusted-application-context" },
        serverNow: SERVER_NOW,
      },
    );
    assert.equal(replay.replayed, true);
    assert.equal(wrapper.runs(), 1);
  });

  it("precommit interrupt after admission does not start a second engine and stays pending", async () => {
    const storeDir = tmpDir("ha1-pre-store-");
    const store = createFileStore(storeDir);
    const service = createAcquisitionService({ store, artifactRoot: store.artifactRoot });
    const inputs = writeTempInputs();
    const json = Buffer.from('{"ok":true}\n');
    const md = Buffer.from("# x\n");
    const outputs = [
      { name: "pin-delta.json", kind: "file", bytes: json.length, sha256: sha256Bytes(json) },
      { name: "pin-delta.md", kind: "file", bytes: md.length, sha256: sha256Bytes(md) },
    ];
    const files = [
      { metadata: outputs[0], bytes: json },
      { metadata: outputs[1], bytes: md },
    ];
    const executionId = "exec-pre-hook";
    const outDir = tmpDir("ha1-pre-out-");
    let runs = 0;
    const wrapper = stubWrapper({
      executionId,
      jobId: "lockfile-pin-delta",
      outDir,
      outputs,
      files,
      enginePin: inputs.request.enginePin,
    });
    const originalRun = wrapper.runPaidOffer.bind(wrapper);
    wrapper.runPaidOffer = async (request) => {
      const offer = await originalRun(request);
      runs += 1;
      return offer;
    };
    const originalPublish = service.publishCompleted.bind(service);
    service.publishCompleted = async () => {
      throw Object.assign(new Error("simulated SIGKILL before acquisition commit"), {
        code: "SIMULATED_KILL",
      });
    };
    await assert.rejects(
      () =>
        runCreateOrder(
          { ...inputs.request, executionId },
          {
            store,
            outDir,
            requestDir: inputs.dir,
            wrapper,
            acquisition: service,
            auth: { principalId: PRINCIPAL_A, source: "trusted-application-context" },
            serverNow: SERVER_NOW,
          },
        ),
      (err) => err.code === "SIMULATED_KILL",
    );
    assert.equal(runs, 1);
    const rec = await store.getAcquisition(executionId);
    assert.equal(rec.state, "pending");
    const orderPath = join(storeDir, `${inputs.request.orderId}.json`);
    const reserved = JSON.parse(readFileSync(orderPath, "utf8"));
    reserved.holderPid = 999999999;
    writeFileSync(orderPath, `${JSON.stringify(reserved, null, 2)}\n`);

    service.publishCompleted = originalPublish;
    const reopened = await runCreateOrder(
      { ...inputs.request, executionId },
      {
        store,
        outDir: tmpDir("ha1-pre-out2-"),
        requestDir: inputs.dir,
        wrapper: {
          kind: "library",
          version: EXECUTION_CONTRACT,
          async runPaidOffer() {
            runs += 1;
            return { ok: true };
          },
        },
        acquisition: service,
        auth: { principalId: PRINCIPAL_A, source: "trusted-application-context" },
        serverNow: SERVER_NOW,
      },
    );
    assert.equal(reopened.ok, false);
    assert.equal(reopened.code, "interrupted-incomplete");
    assert.equal(runs, 1);
    const pending = await service.reader.get(
      { principalId: PRINCIPAL_A, executionId, requestHash: rec.requestHash },
      SERVER_LATER,
    );
    assert.equal(pending.state, "pending");
  });

  it("download and callback ack never imply a sale; other principal is not-found", async () => {
    const store = createFileStore(tmpDir("ha1-sale-store-"));
    const service = createAcquisitionService({ store, artifactRoot: store.artifactRoot });
    const inputs = writeTempInputs();
    const json = Buffer.from("{}\n");
    const md = Buffer.from("#\n");
    const outputs = [
      { name: "pin-delta.json", kind: "file", bytes: json.length, sha256: sha256Bytes(json) },
      { name: "pin-delta.md", kind: "file", bytes: md.length, sha256: sha256Bytes(md) },
    ];
    const files = outputs.map((metadata, i) => ({ metadata, bytes: [json, md][i] }));
    const executionId = "exec-sale";
    const outDir = tmpDir("ha1-sale-out-");
    const wrapper = stubWrapper({
      executionId,
      jobId: "lockfile-pin-delta",
      outDir,
      outputs,
      files,
      enginePin: inputs.request.enginePin,
    });
    const result = await runCreateOrder(
      { ...inputs.request, executionId },
      {
        store,
        outDir,
        requestDir: inputs.dir,
        wrapper,
        acquisition: service,
        auth: { principalId: PRINCIPAL_A, source: "trusted-application-context" },
        serverNow: SERVER_NOW,
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.sold, false);
    assert.equal(result.charged, false);
    assert.equal(result.purchaseAuthority, false);
    const binding = await store.getAcquisition(executionId);
    const opened = await service.reader.openVerified(
      {
        principalId: PRINCIPAL_A,
        executionId,
        requestHash: binding.requestHash,
        name: "pin-delta.json",
        sha256: outputs[0].sha256,
      },
      SERVER_LATER,
    );
    assert.ok(opened.bytes.byteLength >= 1);
    const order = await store.get(inputs.request.orderId);
    assert.equal(order.result.sold, false);
    assert.equal(order.result.purchaseAuthority, false);
    const other = await service.reader.get(
      { principalId: PRINCIPAL_B, executionId, requestHash: binding.requestHash },
      SERVER_LATER,
    );
    assert.equal(other.state, "not-found");
  });
});
