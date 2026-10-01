import assert from "node:assert/strict";
import test from "node:test";
import { assessCopiedVenv, assertPinnedBytes, finalizeReport, runProbe } from "../foundry/probe.mjs";
import pins from "../foundry/PINS.json" with { type: "json" };

test("copied venv, bad fixture bytes, and a sandbox claim are rejected", () => {
  assert.equal(assessCopiedVenv({ copiedAcrossHosts: true, venvHome: "/other/host/python" }).pass, false);
  assert.equal(assessCopiedVenv({ venvHome: "/other/host/python", homeExists: false }).reason, "copied_venv_not_portable");
  assert.throws(() => assertPinnedBytes(Buffer.from("not-the-fixture"), pins.fixtures["answer.wasm"]), /hash mismatch/);
  assert.throws(() => finalizeReport({ wholeHostSandbox: true, checks: [] }), /whole-host sandbox/);
});

test("bounded probe exercises VF08 runtime needs on this host", async () => {
  const report = await runProbe({ exerciseWasmtime: false });
  assert.equal(report.wholeHostSandbox, false);
  assert.equal(report.isolation, "process-rlimit-and-pipes-only");
  const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));
  for (const id of ["linux-x64", "python", "prlimit", "proc-identity", "child-pipes", "child-signals", "child-timeout", "resource-limits", "prebuilt-fixture", "compiler-not-required"]) {
    assert.equal(byId[id].pass, true, `${id} ${JSON.stringify(byId[id].evidence)}`);
  }
  assert.equal(byId["compiler-not-required"].evidence.requiredForProbe, false);
  assert.equal(byId["prebuilt-fixture"].evidence.answer, 42);
  assert.equal(byId["prebuilt-fixture"].evidence.compilerInvoked, false);
  assert.equal(byId.python.evidence.portableVenv, false);
  assert.equal(typeof byId["python-native-wasmtime"].pass, "boolean");
});
