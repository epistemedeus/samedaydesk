import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { materializeReferenceRuntime } from "../../foundry/materialize-runtime.mjs";
import { collectProbe } from "../../foundry/managed-node-probe.mjs";
import { runBounded } from "../../foundry/bounded-child.mjs";
import { packageModule, bindingFor } from "../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/example/package.mjs";
import { invoke, installation } from "../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/supervisor.mjs";

let stage='materialize';
try {
const materialized = await materializeReferenceRuntime();
assert.equal(materialized.action, "cpython-standalone");
stage='probe';
const probe = await collectProbe();
assert.equal(probe.ok, true); assert.equal(probe.python3, false); assert.equal(probe.prlimit, false);
assert.equal(probe.bundledPython, true); assert.equal(probe.osLimitsEnforced, true); assert.equal(probe.pidPreserved, true);
const execution = fileURLToPath(new URL("../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/", import.meta.url));
stage='example-build';
const built = await runBounded(process.execPath, ["example/build.mjs"], { cwd: execution });
assert.equal(built.code, 0); assert.equal(built.reason, null);
const moduleBytes = readFileSync(execution+".build/structured-result.wasm");
const artifact = packageModule(moduleBytes, { sourceRevision: "1132af16054e4639e57827c7e521e2a9ff9f052e" });
const binding = bindingFor(artifact);
const runs = [];stage='execute';
for (const input of [{ structuredContent: { value: "alpha" } }, { structuredContent: { value: "changed-beta" } }, { content: [] }]) {
  const result = await invoke({ artifact, moduleBytes, input, binding });
  assert.equal(result.observation.status, "ok");
  assert.deepEqual(result.observation.phasesObserved.map(p => p.phase), ["compile", "instantiate", "execute"]);
  assert.equal(result.observation.termination.code, 0); assert.equal(result.observation.termination.drained, true);
  assert.equal(existsSync(`/proc/${result.observation.processIdentity.pid}`), false);
  runs.push({ output: result.output, phases: result.observation.phasesObserved.map(p => p.phase),
    termination: result.observation.termination, runtimePin: result.observation.runtimePin, directChildReaped: true });
}
assert.equal(runs[0].output.payload.value, "alpha"); assert.equal(runs[1].output.payload.value, "changed-beta");
assert.equal(runs[2].output.outcome, "unsupported");
console.log(JSON.stringify({ ok: true, hostingerMeasured: false, materialized, probe, runtime: installation(), runs }));

} catch(error) {
 console.log(JSON.stringify({ok:false,stage,code:error?.code==='ERR_ASSERTION'?'fixture_assertion':'fixture_failure',actual:['boolean','number'].includes(typeof error?.actual)?error.actual:null,expected:['boolean','number'].includes(typeof error?.expected)?error.expected:null}));
 process.exitCode=1;
}
