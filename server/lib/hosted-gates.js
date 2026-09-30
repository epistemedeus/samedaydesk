// Hostinger build 01a0f343 failed inside `npm run build`: family-4 connects to
// 127.0.0.1 returned ECONNREFUSED, and the subtest that does not connect passed.
// Runtime socket health is a CI gate and a post-deploy gate. The build sandbox
// records that it did not execute that probe. An unexecuted probe is not a pass.

export const GATE_BUILD_SANDBOX = "build-sandbox";
export const GATE_CI = "ci";
export const GATE_POST_DEPLOY = "post-deploy-acceptance";

export const HOSTINGER_BUILD_AUTHORITY = {
  build: "01a0f343-e6f7-7002-8677-f50183838d83",
  errno: "ECONNREFUSED",
  host: "127.0.0.1",
  family: 4,
  commit: "622d82e50dd4430610e92138f1d3b3aa69fd8ac4",
};

const SOCKET_BUILD_MARKERS = [
  "test:hosted-startup",
  "test:hosted-family4",
  "test-hosted-startup",
  "test-hosted-family4",
  "test-hosted-gates",
  "hosted-startup-actual",
  "hosted-family4-actual",
  "hosted-post-deploy-acceptance",
  "accept:post-deploy",
  "node --test",
];

export function buildScriptRunsSocketProbe(buildScript) {
  const text = String(buildScript || "");
  return SOCKET_BUILD_MARKERS.some((marker) => text.includes(marker));
}

export function notExecutedReceipt(gate) {
  return {
    gate,
    executed: false,
    runtimeSocketHealth: "not-executed",
    gateResult: "not-executed",
    accepted: false,
    passedAsHealth: false,
    activatesProduction: false,
    productionActivate: "HOLD",
    listen: { host: "0.0.0.0", family: "IPv4" },
    recommendedOwner: "root",
  };
}

function claimsHealthPass(receipt) {
  return receipt?.accepted === true
    || receipt?.passedAsHealth === true
    || receipt?.runtimeSocketHealth === "pass"
    || receipt?.cause === "reachable"
    || receipt?.gateResult === "accepted";
}

// ok means the receipt is not a false green. It does not mean health passed.
export function rejectUnexecutedHealthPass(receipt) {
  if (!claimsHealthPass(receipt)) {
    return { ok: true, cause: receipt?.gateResult ?? receipt?.cause ?? "ok" };
  }
  const executed = receipt?.executed === true
    && receipt?.runtimeSocketHealth !== "not-executed"
    && receipt?.runtimeSocketHealth !== "required"
    && receipt?.runtimeSocketHealth !== "pass";
  if (!executed || receipt?.accepted !== true || receipt?.passedAsHealth !== true) {
    return { ok: false, cause: "false-green" };
  }
  return { ok: true, cause: "reachable" };
}

export function ciHealthObligation(gate) {
  if (gate?.runHealth === true) {
    return {
      gate: GATE_CI,
      executed: true,
      runtimeSocketHealth: "required",
      gateResult: "required",
      accepted: false,
      passedAsHealth: false,
      activatesProduction: false,
      productionActivate: "HOLD",
      cause: gate.cause ?? "run",
    };
  }
  return {
    ...notExecutedReceipt(GATE_CI),
    cause: gate?.cause ?? "not-executed",
  };
}
