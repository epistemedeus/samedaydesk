// Portable diagnosis → repair → regression document for MAINT.
// A score, grade, or points field is a different product and is rejected.
export const FINDING_ID = "mcp.unknownTool";
export const HANDOFF_SCHEMA = "samedaydesk.maint.agent-repair.handoff.v1";
export const DIAGNOSIS_SCHEMA = "samedaydesk.maint.agent-repair.diagnosis.v1";
export const SOURCE_COMMIT = "9cc816e13bfea448d68a26380efe2a91c88773dd";
export const SELLER_REPAIR_PIN = "00267aeb03c3ce01b9b318f5ee0172aee34d7e34";
export const JOB_ID = "L08-AGENT-REPAIR-093076";

const SCORE_KEYS = new Set(["score", "grade", "scoreDelta", "points", "ratio", "weight"]);

export function scoreProductPaths(value, path = "$") {
  const found = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => found.push(...scoreProductPaths(item, `${path}[${index}]`)));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SCORE_KEYS.has(key)) found.push(`${path}.${key}`);
      found.push(...scoreProductPaths(child, `${path}.${key}`));
    }
  }
  return found;
}

export function buildDiagnosis(observed) {
  return {
    schema: DIAGNOSIS_SCHEMA,
    target: "disposable-loopback",
    finding: observed.finding,
    exchange: observed.exchange,
    disposableEndpoints: observed.endpoints,
  };
}

export function buildHandoff({ diagnosis, afterExchange, changed, protocolEdge, sellerRepair }) {
  return {
    schema: HANDOFF_SCHEMA,
    job: JOB_ID,
    consumer: "MAINT",
    sourceCommit: SOURCE_COMMIT,
    ownedEndpoints: [
      { method: "POST", path: "/v1/diagnose", role: "reproduce" },
      { method: "POST", path: "/v1/regress", role: "reprove" },
    ],
    diagnosis,
    repair: {
      applied: true,
      summary: "An unknown tools/call name returns JSON-RPC error -32602 and no result.",
      before: diagnosis.exchange.response,
      after: afterExchange.response,
    },
    regression: {
      command: "node tools/l08-agent-repair/cli.mjs prove",
      findingId: FINDING_ID,
      before: "fail",
      after: "pass",
      changed,
      seededRejection: {
        command: "node tools/l08-agent-repair/cli.mjs reject-unchanged",
        expectsExit: 1,
      },
    },
    protocolEdge,
    sellerRepair,
  };
}

export function validateMaintHandoff(doc) {
  const scorePaths = scoreProductPaths(doc);
  if (scorePaths.length) {
    return { ok: false, error: "score_product", paths: scorePaths };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, error: "not_an_object" };
  }
  if (doc.schema !== HANDOFF_SCHEMA) return { ok: false, error: "schema" };
  if (doc.consumer !== "MAINT") return { ok: false, error: "consumer" };
  if (doc.job !== JOB_ID) return { ok: false, error: "job" };
  if (doc.sourceCommit !== SOURCE_COMMIT) return { ok: false, error: "sourceCommit" };
  if (!Array.isArray(doc.ownedEndpoints) || doc.ownedEndpoints.length !== 2) {
    return { ok: false, error: "owned_endpoints" };
  }
  const [diagnose, regress] = doc.ownedEndpoints;
  if (diagnose?.method !== "POST" || diagnose?.path !== "/v1/diagnose" || diagnose?.role !== "reproduce") {
    return { ok: false, error: "diagnose_endpoint" };
  }
  if (regress?.method !== "POST" || regress?.path !== "/v1/regress" || regress?.role !== "reprove") {
    return { ok: false, error: "regress_endpoint" };
  }
  if (doc.diagnosis?.schema !== DIAGNOSIS_SCHEMA) return { ok: false, error: "diagnosis_schema" };
  if (doc.diagnosis?.finding?.id !== FINDING_ID || doc.diagnosis?.finding?.status !== "fail") {
    return { ok: false, error: "diagnosis_finding" };
  }
  if (doc.diagnosis?.exchange?.response?.error) return { ok: false, error: "diagnosis_already_repaired" };
  if (doc.diagnosis?.exchange?.response?.result?.isError !== true) {
    return { ok: false, error: "diagnosis_exchange" };
  }
  if (doc.repair?.applied !== true) return { ok: false, error: "repair_not_applied" };
  if (doc.repair?.after?.error?.code !== -32602) return { ok: false, error: "repair_code" };
  if (doc.repair?.after?.result !== undefined) return { ok: false, error: "repair_still_has_result" };
  if (doc.regression?.findingId !== FINDING_ID) return { ok: false, error: "regression_finding" };
  if (doc.regression?.before !== "fail" || doc.regression?.after !== "pass") {
    return { ok: false, error: "regression_transition" };
  }
  if (!Array.isArray(doc.regression?.changed) || doc.regression.changed.length !== 1) {
    return { ok: false, error: "changed_count" };
  }
  const change = doc.regression.changed[0];
  if (change?.id !== FINDING_ID || change?.before !== "fail" || change?.after !== "pass") {
    return { ok: false, error: "changed_finding" };
  }
  if (doc.regression?.seededRejection?.expectsExit !== 1) return { ok: false, error: "seeded_rejection" };
  if (doc.protocolEdge?.id !== "mcp-protocol-version-header") return { ok: false, error: "protocol_edge_id" };
  if (doc.protocolEdge?.status !== "unresolved") return { ok: false, error: "protocol_edge_status" };
  if (doc.protocolEdge?.notRepairedHere !== true) return { ok: false, error: "protocol_edge_repaired" };
  if (doc.protocolEdge?.apex?.observedStatus !== 200 || doc.protocolEdge?.apex?.requiredStatus !== 400) {
    return { ok: false, error: "protocol_edge_evidence" };
  }
  if (doc.sellerRepair?.access !== "read-only") return { ok: false, error: "seller_repair_access" };
  if (doc.sellerRepair?.pin !== SELLER_REPAIR_PIN) return { ok: false, error: "seller_repair_pin" };
  if (doc.sellerRepair?.findingIsSellerBrief !== false) return { ok: false, error: "seller_brief_remint" };
  if (doc.sellerRepair?.catalogUntouched !== true) return { ok: false, error: "seller_catalog_touched" };
  return { ok: true };
}
