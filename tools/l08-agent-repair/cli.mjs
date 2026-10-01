// Reproduce a disposable MCP defect, repair it, and hand the transition to MAINT.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { runContractRepairLimits, runContractRepairNegative, runJourneyArgv, runJourneyNegative } from "./cold-client.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startDisposableTarget } from "./lib/disposable-target.mjs";
import { PRIOR_SEAL, validateMaintHandoff } from "./lib/handoff.mjs";
import { observeSellerRepairJourney } from "./lib/journey.mjs";
import { postToolsList, protocolEdgeDocument, receiveSellerRepairRoute, observeApexProtocolEdge, UNSUPPORTED_PROTOCOL_HEADER } from "./lib/protocol-edge.mjs";
import { startRepairService } from "./lib/service.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const defaultHandoffPath = join(here, "MAINT-HANDOFF.json");
const scoredFixture = join(here, "fixtures/scored-handoff.json");
const coldClientPath = join(here, "cold-client.mjs");

function say(line) {
  process.stdout.write(`${line}\n`);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

function priorSealExists() {
  try {
    execFileSync("git", ["cat-file", "-e", `${PRIOR_SEAL}^{commit}`], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function spawnCold(args) {
  return spawnSync(process.execPath, [coldClientPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

// The listener serves HTTP on this event loop. spawnSync would block it and the client would wait forever.
function spawnColdAsync(args) {
  return new Promise((resolveSpawn) => {
    const child = spawn(process.execPath, [coldClientPath, ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      resolveSpawn({ status: 1, stdout, stderr: `${stderr}${err.message}\n` });
    });
    child.on("close", (status) => {
      resolveSpawn({ status: status ?? 1, stdout, stderr });
    });
  });
}

function writeChild(child) {
  if (child.stdout) process.stdout.write(child.stdout.endsWith("\n") || child.stdout === "" ? child.stdout : `${child.stdout}\n`);
  if (child.stderr) process.stderr.write(child.stderr);
}

async function receiveContext() {
  if (!priorSealExists()) throw new Error(`prior seal missing ${PRIOR_SEAL}`);
  const sellerRepair = await receiveSellerRepairRoute();
  const journey = await observeSellerRepairJourney();
  if (sellerRepair.invalidFindingHttpStatus === 200 || sellerRepair.invalidFindingError == null || sellerRepair.hasUrl) {
    throw new Error("seller-repair receive created or hid a checkout response");
  }
  if (journey.catalogMutated !== false || journey.catalogUntouched !== true || journey.callers?.length !== 2) {
    throw new Error("seller-repair journey did not produce two ordinary callers");
  }
  if (journey.secondWallet !== false || journey.disposableOnly !== false) {
    throw new Error("seller-repair journey returned a wallet or disposable-only result");
  }
  if (!sellerRepair.allowlistRejectsUnknown || sellerRepair.findingIsSellerBrief !== false) {
    throw new Error("seller-repair allowlist did not match the received catalog");
  }
  if (sellerRepair.catalogMutated !== false || sellerRepair.catalogUntouched !== true) {
    throw new Error("seller-repair catalog changed");
  }
  if (sellerRepair.gate !== "503-before-allowlist" && sellerRepair.gate !== "allowlist-reject") {
    throw new Error(`seller-repair gate ${sellerRepair.gate} status ${sellerRepair.invalidFindingHttpStatus}`);
  }
  if (sellerRepair.stripeConfigured) {
    if (sellerRepair.invalidFindingHttpStatus !== 400) {
      throw new Error(`seller-repair invalid id returned ${sellerRepair.invalidFindingHttpStatus}`);
    }
  } else if (sellerRepair.invalidFindingHttpStatus !== 503) {
    throw new Error(`seller-repair unconfigured route returned ${sellerRepair.invalidFindingHttpStatus}`);
  }
  say(`receive seller-repair ${sellerRepair.route} invalid finding_id -> ${sellerRepair.invalidFindingHttpStatus} gate ${sellerRepair.gate} catalog-untouched`);
  const callerLine = journey.callers.map((caller) => `${caller.findingId} ${caller.routeClass}`).join(", ");
  say(`journey callers ${callerLine} maintenance-scope catalog-untouched`);
  const apex = await observeApexProtocolEdge();
  if (apex.followUp.observedStatus !== 200 || apex.followUp.requiredStatus !== 400) {
    throw new Error(`protocol edge no longer matches the received server (${apex.followUp.observedStatus})`);
  }
  if (apex.negotiated !== "2025-11-25") {
    throw new Error(`initialize negotiated ${apex.negotiated}`);
  }
  if (apex.agentReadinessStatus !== 200 || apex.agentReadinessMounted !== true) {
    throw new Error(`agent-readiness page returned ${apex.agentReadinessStatus}`);
  }
  say(`receive agent-readiness GET /agent-readiness ${apex.agentReadinessStatus}`);
  say(`receive apex POST /mcp initialize ${apex.initializeStatus} negotiated ${apex.negotiated}`);
  say(`protocol-edge ${apex.followUp.header} observed ${apex.followUp.observedStatus} required ${apex.followUp.requiredStatus} unresolved`);
  return { sellerRepair, apex, journey };
}

async function withTarget(mode, fn) {
  const target = await startDisposableTarget(mode);
  try {
    return await fn(target);
  } finally {
    await target.close();
  }
}

export async function runRejectUnchanged() {
  return withTarget("broken", async (target) => {
    const { sellerRepair, apex, journey } = await receiveContext();
    const disposable = await postToolsList(target.origin, UNSUPPORTED_PROTOCOL_HEADER);
    const service = await startRepairService(target, {
      protocolEdge: protocolEdgeDocument({ apex, disposable }),
      sellerRepair,
      journey,
    });
    try {
      const diagnosis = await postJson(`${service.origin}/v1/diagnose`);
      if (diagnosis.status !== 200 || diagnosis.json?.finding?.status !== "fail") {
        say(`owned-endpoint POST /v1/diagnose exit 2 status ${diagnosis.status}`);
        return 2;
      }
      const regress = await postJson(`${service.origin}/v1/regress`);
      const rejected = regress.status === 409 && regress.json?.error === "finding_unchanged";
      say(`owned-endpoint POST /v1/regress exit ${rejected ? 1 : 2} finding mcp.unknownTool unchanged ${regress.json?.before ?? "?"}`);
      return rejected ? 1 : 2;
    } finally {
      await service.close();
    }
  });
}

export async function runRejectScored() {
  const doc = JSON.parse(readFileSync(scoredFixture, "utf8"));
  const verdict = validateMaintHandoff(doc);
  if (verdict.ok || verdict.error !== "score_product") {
    say(`handoff rejected ${verdict.ok ? "accepted_scored_document" : verdict.error}`);
    return verdict.ok ? 0 : 2;
  }
  say("handoff rejected score_product");
  return 1;
}

async function listenBroken(sellerRepair, apex, journey) {
  const target = await startDisposableTarget("broken");
  try {
    const disposable = await postToolsList(target.origin, UNSUPPORTED_PROTOCOL_HEADER);
    if (disposable.observedStatus !== 200) {
      await target.close();
      return { error: disposable.observedStatus };
    }
    const service = await startRepairService(target, {
      protocolEdge: protocolEdgeDocument({ apex, disposable }),
      sellerRepair,
      journey,
    });
    return { target, service };
  } catch (err) {
    await target.close();
    throw err;
  }
}

async function closePair(pair) {
  if (!pair) return;
  if (pair.service) await pair.service.close();
  if (pair.target) await pair.target.close();
}

export async function runCold(outPath = defaultHandoffPath) {
  if (!priorSealExists()) {
    say(`prior-seal ${PRIOR_SEAL} missing`);
    return 2;
  }
  say(`prior-seal ${PRIOR_SEAL} present`);
  const { sellerRepair, apex, journey } = await receiveContext();
  const pair = await listenBroken(sellerRepair, apex, journey);
  if (pair.error) {
    say(`protocol-edge disposable observed ${pair.error}`);
    return 2;
  }
  let runStatus = 1;
  try {
    say(`owner listen ${pair.service.origin}`);
    const child = await spawnColdAsync(["run", "--origin", pair.service.origin, "--out", outPath]);
    writeChild(child);
    say(`cold-client run exit ${child.status}`);
    runStatus = child.status ?? 1;
    if (runStatus !== 0) return runStatus;
    const written = JSON.parse(readFileSync(outPath, "utf8"));
    const verdict = validateMaintHandoff(written);
    if (!verdict.ok) {
      say(`cold handoff ${verdict.error}`);
      return 1;
    }
  } finally {
    await closePair(pair);
  }

  const unchangedPair = await listenBroken(sellerRepair, apex, journey);
  if (unchangedPair.error) {
    say(`protocol-edge disposable observed ${unchangedPair.error}`);
    return 2;
  }
  let unchanged;
  try {
    unchanged = await spawnColdAsync(["reject-unchanged", "--origin", unchangedPair.service.origin]);
  } finally {
    await closePair(unchangedPair);
  }
  const scored = spawnCold(["reject-scored"]);
  const seller = spawnCold(["seller-repair"]);
  const journeyPositive = spawnCold(["journey"]);
  const journeyNegative = spawnCold(["journey-negative"]);
  const contractLimits = spawnCold(["contract-repair-limits"]);
  const contractNegative = spawnCold(["contract-repair-negative"]);
  const taskReadiness = spawnCold(["task-readiness"]);
  const taskNegative = spawnCold(["task-readiness-negative"]);
  say(`seeded reject-unchanged exit ${unchanged.status}`);
  writeChild(unchanged);
  say(`seeded reject-scored exit ${scored.status}`);
  writeChild(scored);
  say(`seller-repair exit ${seller.status}`);
  writeChild(seller);
  say(`journey exit ${journeyPositive.status}`);
  writeChild(journeyPositive);
  say(`seeded journey-negative exit ${journeyNegative.status}`);
  writeChild(journeyNegative);
  say(`contract-repair-limits exit ${contractLimits.status}`);
  writeChild(contractLimits);
  say(`seeded contract-repair-negative exit ${contractNegative.status}`);
  writeChild(contractNegative);
  say(`task-readiness exit ${taskReadiness.status}`);
  writeChild(taskReadiness);
  say(`seeded task-readiness-negative exit ${taskNegative.status}`);
  writeChild(taskNegative);
  if (unchanged.status !== 1 || scored.status !== 1 || seller.status !== 0) return 1;
  if (journeyPositive.status !== 0 || journeyNegative.status !== 1) return 1;
  if (contractLimits.status !== 0 || contractNegative.status !== 1) return 1;
  if (taskReadiness.status !== 0 || taskNegative.status !== 1) return 1;
  return 0;
}

export async function runProve(outPath = defaultHandoffPath) {
  if (!priorSealExists()) {
    say(`prior-seal ${PRIOR_SEAL} missing`);
    return 2;
  }
  say(`prior-seal ${PRIOR_SEAL} present`);
  const { sellerRepair, apex, journey } = await receiveContext();
  const target = await startDisposableTarget("broken");
  let service;
  try {
    const disposable = await postToolsList(target.origin, UNSUPPORTED_PROTOCOL_HEADER);
    if (disposable.observedStatus !== 200) {
      say(`protocol-edge disposable observed ${disposable.observedStatus}`);
      return 2;
    }
    service = await startRepairService(target, {
      protocolEdge: protocolEdgeDocument({ apex, disposable }),
      sellerRepair,
      journey,
    });
    const diagnosis = await postJson(`${service.origin}/v1/diagnose`);
    if (diagnosis.status !== 200 || diagnosis.json?.finding?.id !== "mcp.unknownTool" || diagnosis.json?.finding?.status !== "fail") {
      say(`owned-endpoint POST /v1/diagnose exit 2 http ${diagnosis.status} finding ${diagnosis.json?.finding?.status ?? "absent"}`);
      return 2;
    }
    say(`owned-endpoint POST /v1/diagnose exit 0 finding mcp.unknownTool status fail`);
    target.setMode("fixed");
    say("apply repair disposable mode fixed");
    const regress = await postJson(`${service.origin}/v1/regress`);
    if (regress.status !== 200) {
      say(`owned-endpoint POST /v1/regress exit 1 http ${regress.status} ${regress.json?.error ?? ""}`);
      return 1;
    }
    const verdict = validateMaintHandoff(regress.json);
    if (!verdict.ok) {
      say(`owned-endpoint POST /v1/regress exit 1 handoff ${verdict.error}`);
      return 1;
    }
    say("owned-endpoint POST /v1/regress exit 0 finding mcp.unknownTool fail -> pass");
    say(`changed ${regress.json.regression.changed.map((row) => row.id).join(",")}`);
    writeFileSync(outPath, `${JSON.stringify(regress.json, null, 2)}\n`);
    say(`handoff ${outPath}`);
  } finally {
    if (service) await service.close();
    await target.close();
  }

  const unchanged = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "reject-unchanged"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const scored = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "reject-scored"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  say(`seeded reject-unchanged exit ${unchanged.status}`);
  if (unchanged.stdout) process.stdout.write(unchanged.stdout.endsWith("\n") ? unchanged.stdout : `${unchanged.stdout}\n`);
  say(`seeded reject-scored exit ${scored.status}`);
  if (scored.stdout) process.stdout.write(scored.stdout.endsWith("\n") ? scored.stdout : `${scored.stdout}\n`);
  if (unchanged.status !== 1 || scored.status !== 1) return 1;
  return 0;
}

const command = process.argv[2] || "prove";
let exit = 2;
try {
  if (command === "prove") exit = await runProve(process.argv[3] ? resolve(process.argv[3]) : defaultHandoffPath);
  else if (command === "cold") exit = await runCold(process.argv[3] ? resolve(process.argv[3]) : defaultHandoffPath);
  else if (command === "reject-unchanged") exit = await runRejectUnchanged();
  else if (command === "reject-scored") exit = await runRejectScored();
  else if (command === "journey") exit = await runJourneyArgv(process.argv.slice(3));
  else if (command === "journey-negative") exit = await runJourneyNegative();
  else if (command === "contract-repair-limits") exit = runContractRepairLimits();
  else if (command === "contract-repair-negative") exit = runContractRepairNegative();
  else {
    say("usage: node tools/l08-agent-repair/cli.mjs prove [out.json] | cold [out.json] | reject-unchanged | reject-scored | journey | journey-negative | contract-repair-limits | contract-repair-negative");
    exit = 2;
  }
} catch (err) {
  say(`owner error ${err instanceof Error ? err.message : "failed"}`);
  exit = 2;
}
process.exit(exit);
