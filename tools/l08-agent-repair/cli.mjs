// Reproduce a disposable MCP defect, repair it, and hand the transition to MAINT.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startDisposableTarget } from "./lib/disposable-target.mjs";
import { validateMaintHandoff } from "./lib/handoff.mjs";
import { postToolsList, protocolEdgeDocument, receiveSellerRepairRoute, observeApexProtocolEdge, UNSUPPORTED_PROTOCOL_HEADER } from "./lib/protocol-edge.mjs";
import { startRepairService } from "./lib/service.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const defaultHandoffPath = join(here, "MAINT-HANDOFF.json");
const scoredFixture = join(here, "fixtures/scored-handoff.json");

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

async function receiveContext() {
  const sellerRepair = await receiveSellerRepairRoute();
  if (sellerRepair.invalidFindingHttpStatus === 200 || sellerRepair.invalidFindingError == null) {
    throw new Error("seller-repair receive created or hid a checkout response");
  }
  if (!sellerRepair.allowlistRejectsUnknown || sellerRepair.findingIsSellerBrief !== false) {
    throw new Error("seller-repair allowlist did not match the received catalog");
  }
  if (sellerRepair.stripeConfigured) {
    if (sellerRepair.invalidFindingHttpStatus !== 400) {
      throw new Error(`seller-repair invalid id returned ${sellerRepair.invalidFindingHttpStatus}`);
    }
  } else if (sellerRepair.invalidFindingHttpStatus !== 503) {
    throw new Error(`seller-repair unconfigured route returned ${sellerRepair.invalidFindingHttpStatus}`);
  }
  say(`receive seller-repair ${sellerRepair.route} invalid finding_id -> ${sellerRepair.invalidFindingHttpStatus} allowlist-reject`);
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
  return { sellerRepair, apex };
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
    const { sellerRepair, apex } = await receiveContext();
    const disposable = await postToolsList(target.origin, UNSUPPORTED_PROTOCOL_HEADER);
    const service = await startRepairService(target, {
      protocolEdge: protocolEdgeDocument({ apex, disposable }),
      sellerRepair,
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

export async function runProve(outPath = defaultHandoffPath) {
  const { sellerRepair, apex } = await receiveContext();
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
if (command === "prove") exit = await runProve(process.argv[3] ? resolve(process.argv[3]) : defaultHandoffPath);
else if (command === "reject-unchanged") exit = await runRejectUnchanged();
else if (command === "reject-scored") exit = await runRejectScored();
else {
  say("usage: node tools/l08-agent-repair/cli.mjs prove [out.json] | reject-unchanged | reject-scored");
  exit = 2;
}
process.exit(exit);
