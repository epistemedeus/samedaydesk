import { MonitorError } from "../errors.mjs";
import { acquireReleaseGate } from "../runtime/acquire-release-gate.mjs";
import { RECEIPT_SCHEMA as PINNED_SCHEMA } from "../runtime/release-gate-pin.mjs";

const gate = await acquireReleaseGate();
if (gate.RECEIPT_SCHEMA !== PINNED_SCHEMA) {
  throw new MonitorError("loaded Release Gate schema does not match the pin", { code: "release_gate_schema" });
}

export const RECEIPT_SCHEMA = gate.RECEIPT_SCHEMA;
export const evaluateRelease = gate.evaluateRelease;
export const releaseGateIdentity = Object.freeze({ ...gate.identity });

export function releaseReceipt({ descriptor, evidence, generatedAt }) {
  return evaluateRelease({ descriptor, evidence, generatedAt });
}
