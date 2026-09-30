// Portable diagnosis → repair → regression document for MAINT.
// A score, grade, or points field is a different product and is rejected.
export const FINDING_ID = "mcp.unknownTool";
export const HANDOFF_SCHEMA = "samedaydesk.maint.agent-repair.handoff.v1";
export const DIAGNOSIS_SCHEMA = "samedaydesk.maint.agent-repair.diagnosis.v1";
export const SOURCE_COMMIT = "9cc816e13bfea448d68a26380efe2a91c88773dd";
export const SELLER_REPAIR_PIN = "00267aeb03c3ce01b9b318f5ee0172aee34d7e34";
export const JOB_ID = "L08-AGENT-REPAIR-093076";
export const PRIOR_SEAL = "ac7e0c75c224a062d9ed4e58332e9c2f34b90895";
export const CONTINUATION_JOB = "L08-MAINT-093083";
export const OPERATION_ID = "6dd8b73d-e58c-47c7-b2cb-e630167d21f1";
export const PRIOR_SESSION = "0936c075-cc31-4d98-8300-f8231baafc59";
export const INVALID_SELLER_FINDING_ID = "not-a-catalog-id";
export const COLD_CLIENT_RUN = "node tools/l08-agent-repair/cold-client.mjs run";
export const COLD_CLIENT_REJECT_UNCHANGED = "node tools/l08-agent-repair/cold-client.mjs reject-unchanged";
export const COLD_CLIENT_SELLER_REPAIR = "node tools/l08-agent-repair/cold-client.mjs seller-repair";

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
    priorSeal: PRIOR_SEAL,
    continuation: {
      job: CONTINUATION_JOB,
      operationId: OPERATION_ID,
      priorSession: PRIOR_SESSION,
      priorHead: PRIOR_SEAL,
    },
    coldClient: {
      command: COLD_CLIENT_RUN,
      drives: ["POST /v1/diagnose", "POST /v1/repair", "POST /v1/regress"],
      liveWriterTwin: false,
    },
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
      command: COLD_CLIENT_RUN,
      findingId: FINDING_ID,
      before: "fail",
      after: "pass",
      changed,
      seededRejection: {
        command: COLD_CLIENT_REJECT_UNCHANGED,
        expectsExit: 1,
      },
    },
    protocolEdge,
    sellerRepair,
  };
}

function sellerRepairError(seller) {
  if (!seller || seller.access !== "read-only") return "seller_repair_access";
  if (seller.pin !== SELLER_REPAIR_PIN) return "seller_repair_pin";
  if (seller.findingIsSellerBrief !== false) return "seller_brief_remint";
  if (seller.catalogUntouched !== true) return "seller_catalog_touched";
  if (seller.catalogMutated !== false) return "seller_catalog_mutated";
  if (seller.invalidFindingId !== INVALID_SELLER_FINDING_ID) return "seller_invalid_id";
  if (seller.allowlistRejectsUnknown !== true) return "seller_allowlist";
  if (seller.hasUrl !== false) return "seller_checkout_url";
  if (seller.coldCommand !== COLD_CLIENT_SELLER_REPAIR) return "seller_cold_command";
  if (!Number.isInteger(seller.catalogCount) || seller.catalogCount < 1) return "seller_catalog_count";
  if (seller.gate === "503-before-allowlist") {
    if (seller.stripeConfigured !== false) return "seller_stripe_gate";
    if (seller.invalidFindingHttpStatus !== 503) return "seller_repair_status";
    if (seller.invalidFindingError !== "Payments not configured") return "seller_repair_error";
    if (typeof seller.comparedFindingId !== "string" || seller.comparedFindingId.length === 0) return "seller_compared_id";
    if (seller.comparedFindingId === INVALID_SELLER_FINDING_ID) return "seller_compared_id";
    if (seller.comparedFindingHttpStatus !== 503) return "seller_compared_status";
    if (seller.comparedFindingError !== "Payments not configured") return "seller_compared_error";
    if (seller.comparedHasUrl !== false) return "seller_checkout_url";
    return null;
  }
  if (seller.gate === "allowlist-reject") {
    if (seller.stripeConfigured !== true) return "seller_stripe_gate";
    if (seller.invalidFindingHttpStatus !== 400) return "seller_repair_status";
    if (seller.invalidFindingError !== "Invalid finding ID") return "seller_repair_error";
    if (seller.comparedFindingId !== null) return "seller_compared_id";
    return null;
  }
  return "seller_repair_gate";
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
  if (doc.regression?.command !== COLD_CLIENT_RUN) return { ok: false, error: "regression_command" };
  if (doc.regression?.seededRejection?.command !== COLD_CLIENT_REJECT_UNCHANGED) return { ok: false, error: "seeded_rejection" };
  if (doc.regression?.seededRejection?.expectsExit !== 1) return { ok: false, error: "seeded_rejection" };
  if (doc.priorSeal !== PRIOR_SEAL) return { ok: false, error: "prior_seal" };
  if (doc.continuation?.job !== CONTINUATION_JOB) return { ok: false, error: "continuation_job" };
  if (doc.continuation?.operationId !== OPERATION_ID) return { ok: false, error: "continuation_operation" };
  if (doc.continuation?.priorSession !== PRIOR_SESSION) return { ok: false, error: "continuation_session" };
  if (doc.continuation?.priorHead !== PRIOR_SEAL) return { ok: false, error: "continuation_head" };
  if (doc.coldClient?.command !== COLD_CLIENT_RUN) return { ok: false, error: "cold_client_command" };
  if (doc.coldClient?.liveWriterTwin !== false) return { ok: false, error: "writer_twin" };
  const drives = doc.coldClient?.drives;
  if (!Array.isArray(drives)
    || drives.length !== 3
    || drives[0] !== "POST /v1/diagnose"
    || drives[1] !== "POST /v1/repair"
    || drives[2] !== "POST /v1/regress") {
    return { ok: false, error: "cold_client_drives" };
  }
  if (doc.protocolEdge?.id !== "mcp-protocol-version-header") return { ok: false, error: "protocol_edge_id" };
  if (doc.protocolEdge?.status !== "unresolved") return { ok: false, error: "protocol_edge_status" };
  if (doc.protocolEdge?.notRepairedHere !== true) return { ok: false, error: "protocol_edge_repaired" };
  if (doc.protocolEdge?.apex?.observedStatus !== 200 || doc.protocolEdge?.apex?.requiredStatus !== 400) {
    return { ok: false, error: "protocol_edge_evidence" };
  }
  const sellerError = sellerRepairError(doc.sellerRepair);
  if (sellerError) return { ok: false, error: sellerError };
  return { ok: true };
}
