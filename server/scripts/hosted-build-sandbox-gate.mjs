import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GATE_BUILD_SANDBOX,
  GATE_CI,
  GATE_POST_DEPLOY,
  HOSTINGER_BUILD_AUTHORITY,
  buildScriptRunsSocketProbe,
  notExecutedReceipt,
  rejectUnexecutedHealthPass,
} from "../lib/hosted-gates.js";

function emit(receipt, code) {
  process.stdout.write(JSON.stringify(receipt) + "\n");
  process.exit(code);
}

function base() {
  return {
    ...notExecutedReceipt(GATE_BUILD_SANDBOX),
    deploy: "not-run",
    coldCall: "not-run",
    authority: HOSTINGER_BUILD_AUTHORITY,
    nextGates: [GATE_CI, GATE_POST_DEPLOY],
    reason: "Hostinger build 01a0f343 failed npm run build: connect ECONNREFUSED 127.0.0.1 family-4. Runtime socket health is not a build-sandbox gate.",
  };
}

const pkgUrl = new URL("../../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8"));
const build = pkg.scripts?.build ?? "";
const argv = process.argv.slice(2);
const seedFlag = argv.indexOf("--seed");

if (seedFlag >= 0) {
  const seed = argv[seedFlag + 1];
  if (seed !== "false-green") {
    emit({
      ...base(),
      buildMayContinue: false,
      gateResult: "blocked",
      cause: "unknown-seed",
    }, 1);
  }
  const forged = {
    ...base(),
    executed: false,
    accepted: true,
    passedAsHealth: true,
    runtimeSocketHealth: "pass",
    gateResult: "accepted",
    cause: "reachable",
  };
  const verdict = rejectUnexecutedHealthPass(forged);
  emit({
    ...base(),
    buildMayContinue: false,
    gateResult: "false-green",
    cause: "false-green",
    stampRejected: verdict.ok === false,
    forgedGateResult: forged.gateResult,
  }, verdict.ok === false ? 1 : 0);
}

if (buildScriptRunsSocketProbe(build)) {
  emit({
    ...base(),
    buildMayContinue: false,
    gateResult: "blocked",
    cause: "socket-probe-in-build",
  }, 1);
}

const receipt = { ...base(), buildMayContinue: true };
const verdict = rejectUnexecutedHealthPass(receipt);
if (verdict.cause === "false-green") {
  emit({
    ...receipt,
    buildMayContinue: false,
    gateResult: "false-green",
    cause: "false-green",
    stampRejected: true,
  }, 1);
}
process.stderr.write("build-sandbox: runtime socket health not-executed (not a pass); productionActivate=HOLD\n");
emit(receipt, 0);
