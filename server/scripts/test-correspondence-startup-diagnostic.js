import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { MemoryStore, loadConfig } from "@neomorphic/correspondence";
import { startupDiagnostic } from "../foundry/startup-diagnostic.js";
import { mountCorrespondence } from "../lib/correspondence-mount.js";

test("startup diagnostic only emits known stages and native codes", () => {
  const secret = "postgres://private:credential@private.invalid/private";
  assert.deepEqual(startupDiagnostic("base_readiness", Object.assign(new Error(secret), {
    code: "28P01", stack: secret, detail: secret,
  })), { stage: "base_readiness", code: "28P01" });
  assert.deepEqual(startupDiagnostic(secret, { code: secret, message: secret }),
    { stage: "unknown", code: "unknown" });
  assert.deepEqual(startupDiagnostic("entry_readiness", {
    code: "wrapper", cause: { code: "installed_verification_changed", message: secret },
  }), { stage: "entry_readiness", code: "installed_verification_changed" });
  assert.deepEqual(startupDiagnostic("base_readiness", {
    get code() { throw new Error(secret); },
  }), { stage: "base_readiness", code: "unknown" });
  assert.deepEqual(startupDiagnostic("base_readiness", new Error("28P01")),
    { stage: "base_readiness", code: "unknown" });
});

const env = {
  NODE_ENV: "test", FOUNDRY_HOST_OPT_IN: "1",
  CORRESPONDENCE_DATABASE_URL: "postgres://127.0.0.1:9/fixture",
  CORRESPONDENCE_ADMIN_TOKEN: "startup-fixture-admin-token-24characters",
};
for (const failedStage of ["service_import", "service_config", "store_create",
  "entry_create", "base_readiness", "entry_readiness"]) {
  test("startup identifies " + failedStage + " while cleanup and public refusal remain", async t => {
    let baseClosed = 0, entryClosed = 0;
    const lines = [];
    t.mock.method(console, "error", (...args) => lines.push(args));
    const failureCode = failedStage === "entry_readiness" ? "installed_verification_changed" :
      failedStage === "base_readiness" ? "ERR_TLS_CERT_ALTNAME_INVALID" : "28P01";
    const failure = Object.assign(new Error("private credentials and rows"), { code: failureCode });
    const store = new MemoryStore();
    store.close = async () => { baseClosed++; };
    store.checkReady = async () => { if (failedStage === "base_readiness") throw failure; };
    const service = {
      loadConfig: input => { if (failedStage === "service_config") throw failure; return loadConfig(input); },
      createPostgresStore: async () => { if (failedStage === "store_create") throw failure; return store; },
    };
    const app = express();
    const handle = mountCorrespondence(app, {
      env, loadService: async () => { if (failedStage === "service_import") throw failure; return service; },
      hostProfile: { id: "host:fixture" }, participationKey: "fixture-participation-key-32characters",
      createEntryReuseMount: async () => {
        if (failedStage === "entry_create") throw failure;
        return { app: express(), checkReady: async () => {
          if (failedStage === "entry_readiness") throw failure;
        }, close: async () => { entryClosed++; } };
      },
    });
    await handle.ready();
    assert.equal(handle.state.reason, "store_unavailable");
    assert.equal(handle.state.adminToken, null);
    assert.deepEqual(lines, [["correspondence_store_unavailable",
      { stage: failedStage, code: failureCode }]]);
    assert.equal(baseClosed, ["service_import", "service_config", "store_create"].includes(failedStage) ? 0 : 1);
    assert.equal(entryClosed, ["base_readiness", "entry_readiness"].includes(failedStage) ? 1 : 0);
    await handle.close();
    assert.equal(baseClosed, ["service_import", "service_config", "store_create"].includes(failedStage) ? 0 : 1);
  });
}
