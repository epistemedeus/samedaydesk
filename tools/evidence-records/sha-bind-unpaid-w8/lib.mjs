import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_DIR = here;
export const FIXTURE_ROOT = join(here, "fixtures");
export const VALID_FIXTURES = join(FIXTURE_ROOT, "valid");
export const INVALID_FIXTURES = join(FIXTURE_ROOT, "invalid");
export const DEFAULT_CATALOG = join(FIXTURE_ROOT, "catalog.json");
export const DEFAULT_SCHEMA = join(here, "schema/sha-bind-unpaid.w8.v1.json");
export const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");

export const PRODUCT = "samedaydesk-sha-bind-unpaid-w8";
export const SCHEMA_VERSION = "samedaydesk.evidence-record.sha-bind-unpaid.w8.v1";
export const WAVE = "w8";
export const SEEDED_FAILURE = "sha-mismatch";
export const PINNED_TOOLS_BLOCK_SHA256 =
  "068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf";
export const MCP_SOURCE_REL = "server/routes/mcp.js";
export const MCP_INVENTORY_REL = "server/lib/mcp-tool-inventory.js";
export const NEGOTIATION_TEST_REL = "server/scripts/test-mcp-protocol-negotiation.js";
export const TOOLS_BLOCK_START = "const TOOLS = [";
export const TOOLS_BLOCK_END = "const okMsg";
export const MCP_TOOL_NAMES = Object.freeze([
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
]);

const BIND_ID_RE = /^sbu_w8_[a-z0-9_]{2,80}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const TOKEN_RE = /^[a-z][a-z0-9_]{1,95}$/;
const UNKNOWN_RE = /^[\x20-\x7E]{1,160}$/;
const ROUTE_RE = /^\/[A-Za-z0-9/_-]*$/;
const AMOUNT_RE = /^[1-9][0-9]{0,20}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_RE = /^0x[a-f0-9]{64}$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const PAYMENT_HEADER_RE = /^(PAYMENT-SIGNATURE|X-PAYMENT|PAYMENT-RESPONSE|STRIPE-SIGNATURE)$/i;
const MAX_DELAY = 31_536_000;
const PAID_SOURCE_KINDS = new Set(["stripe_event", "x402_facilitator_settlement"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "bindId",
  "wave",
  "statusClass",
  "kind",
  "paymentSent",
  "charged",
  "httpStatus",
  "artifact",
  "claims",
  "request",
  "settlement",
  "observationWindow",
  "completeness",
  "authorityClass",
  "unknownWhenAbsent",
  "prohibitedInferences",
]);
const ARTIFACT_KEYS = Object.freeze(["path", "sha256", "bytes"]);
const WINDOW_KEYS = Object.freeze(["start", "end", "reportingDelaySeconds"]);
const REQUEST_KEYS = Object.freeze(["method", "url", "headers"]);
const SETTLEMENT_KEYS = Object.freeze([
  "operationId",
  "amountUsdc",
  "transaction",
  "facilitatorOrPayoutRef",
]);

export const REFUSED_FLAGS = Object.freeze([
  "live",
  "pay",
  "payment",
  "checkout",
  "publish",
  "stripe",
  "registry",
  "refresh",
  "settle",
  "neo",
  "neo-kernel-vendor",
]);

function error(code, path, message) {
  return { code, path, message };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownKeys(value) {
  return Object.getOwnPropertyNames(value);
}

function allowKeys(obj, allowed, path, errors) {
  const allowedSet = new Set(allowed);
  for (const key of ownKeys(obj)) {
    if (FORBIDDEN_KEYS.has(key) || !allowedSet.has(key)) {
      errors.push(error("additional_property", `${path}.${key}`, `property ${key} is not allowed`));
    }
  }
}

function requireKeys(obj, required, path, errors) {
  for (const key of required) {
    if (!Object.hasOwn(obj, key)) {
      errors.push(error("invalid_shape", path, `missing ${key}`));
    }
  }
}

function expectString(value, re, path, errors, code = "invalid_shape") {
  if (typeof value !== "string" || !re.test(value)) {
    errors.push(error(code, path, "invalid string"));
    return false;
  }
  return true;
}

function expectUniqueStringArray(value, path, errors, itemRe, { min, max }) {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length) {
    errors.push(error("invalid_shape", path, "expected array"));
    return false;
  }
  if (value.length < min || value.length > max) {
    errors.push(error("invalid_shape", path, `expected ${min} to ${max} items`));
    return false;
  }
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== "string" || (itemRe && !itemRe.test(item))) {
      errors.push(error("invalid_shape", `${path}[${i}]`, "invalid item"));
      continue;
    }
    if (seen.has(item)) {
      errors.push(error("invalid_shape", `${path}[${i}]`, "duplicate item"));
    }
    seen.add(item);
  }
  return true;
}

function parseRfc3339(value) {
  if (typeof value !== "string" || !RFC3339_RE.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  if (new Date(ms).toISOString() !== value) return null;
  return ms;
}

function stableEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sha256Bytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function findRepoRoot(start = here) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, MCP_INVENTORY_REL)) && existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const err = new Error("cannot locate samedaydesk repo root");
  err.code = "HOST_BUILD";
  throw err;
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.pins)) {
    throw new Error("catalog must contain a pins array");
  }
  return catalog;
}

export function loadSchema(schemaPath = DEFAULT_SCHEMA) {
  return JSON.parse(readFileSync(schemaPath, "utf8"));
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function loadInvalidManifest(manifestPath = INVALID_MANIFEST) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function designatedSeedPath(catalog = loadCatalog()) {
  return join(FIXTURE_ROOT, catalog.designatedSeed.file);
}

export function pinByBindId(catalog, bindId) {
  return catalog.pins.find((pin) => pin.bindId === bindId) ?? null;
}

export function pinByPath(catalog, artifactPath) {
  return catalog.pins.find((pin) => pin.path === artifactPath) ?? null;
}

export function paidRefuseByPath(catalog, artifactPath) {
  const list = Array.isArray(catalog.paidRefuse) ? catalog.paidRefuse : [];
  return list.find((item) => item.path === artifactPath) ?? null;
}

export function isPaymentHeaderName(name) {
  return PAYMENT_HEADER_RE.test(String(name || ""));
}

export function naiveVerdict(record) {
  return record && record.statusClass === "unpaid" ? "accept" : "reject";
}

export function inspectPath(artifactPath) {
  if (typeof artifactPath !== "string" || artifactPath.length === 0) {
    return { ok: false, code: "invalid_shape", message: "artifact.path must be a string" };
  }
  if (isAbsolute(artifactPath) || artifactPath.startsWith("~") || artifactPath.includes("\\")) {
    return { ok: false, code: "path_escape", message: "artifact.path must be a repo-relative posix path" };
  }
  const parts = artifactPath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return { ok: false, code: "path_escape", message: "artifact.path must not contain empty, dot, or parent segments" };
  }
  if (artifactPath.startsWith("tools/evidence-records/sha-bind-unpaid-w8/")) {
    return { ok: false, code: "path_escape", message: "cannot bind the pack to itself" };
  }
  return { ok: true, path: artifactPath };
}

export function resolveArtifactPath(root, artifactPath) {
  const inspected = inspectPath(artifactPath);
  if (!inspected.ok) return inspected;
  const abs = normalize(join(root, inspected.path));
  const rel = relative(root, abs);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    return { ok: false, code: "path_escape", message: "artifact.path escaped the repository" };
  }
  return { ok: true, path: inspected.path, abs };
}

export function hashFile(absPath) {
  const buffer = readFileSync(absPath);
  return { sha256: sha256Bytes(buffer), bytes: buffer.length, buffer, text: buffer.toString("utf8") };
}

export function extractToolsBlock(src) {
  const start = src.indexOf(TOOLS_BLOCK_START);
  const end = src.indexOf(TOOLS_BLOCK_END, start);
  if (start < 0 || end <= start) return null;
  return src.slice(start, end);
}

export function readToolsBlockSha(root = findRepoRoot()) {
  const src = readFileSync(join(root, MCP_SOURCE_REL), "utf8");
  const block = extractToolsBlock(src);
  if (!block) {
    const err = new Error("MCP source missing TOOLS block");
    err.code = "HOST_BUILD";
    throw err;
  }
  return sha256Text(block);
}

export function readNegotiationSha(root = findRepoRoot()) {
  const src = readFileSync(join(root, NEGOTIATION_TEST_REL), "utf8");
  const match = src.match(/FROZEN_TOOLS_BLOCK_SHA256\s*=\s*"([0-9a-f]{64})"/);
  return match ? match[1] : null;
}

export function parseInventoryNames(src) {
  const match = src.match(/MCP_TOOL_NAMES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  if (!match) return null;
  return [...match[1].matchAll(/"([^"]+)"/g)].map((hit) => hit[1]);
}

export function collectPaidEvidence(record) {
  const hits = [];
  if (!isPlainObject(record)) return hits;
  if (record.charged === true) {
    hits.push(error("paid_as_unpaid", "$.charged", "charged true cannot be unpaid evidence"));
  }
  if (record.paymentSent === true) {
    hits.push(error("paid_as_unpaid", "$.paymentSent", "paymentSent true cannot be unpaid evidence"));
  }
  if (record.httpStatus === 200) {
    hits.push(error("paid_as_unpaid", "$.httpStatus", "HTTP 200 cannot be unpaid 402 evidence"));
  }
  if (Object.hasOwn(record, "settlement") && record.settlement !== null) {
    hits.push(error("paid_as_unpaid", "$.settlement", "settlement object cannot be labeled unpaid"));
  }
  const headers = isPlainObject(record.request) ? record.request.headers : null;
  if (isPlainObject(headers)) {
    for (const name of ownKeys(headers)) {
      if (isPaymentHeaderName(name)) {
        hits.push(
          error(
            "paid_as_unpaid",
            `$.request.headers.${name}`,
            "payment header cannot be labeled unpaid",
          ),
        );
      }
    }
  }
  if (isPlainObject(record.claims)) {
    if (record.claims.charged === true) {
      hits.push(error("paid_as_unpaid", "$.claims.charged", "charged claim cannot be unpaid"));
    }
    if (record.claims.paymentSent === true) {
      hits.push(error("paid_as_unpaid", "$.claims.paymentSent", "paymentSent claim cannot be unpaid"));
    }
    if (typeof record.claims.transaction === "string" && TX_RE.test(record.claims.transaction)) {
      hits.push(error("paid_as_unpaid", "$.claims.transaction", "transaction claim cannot be unpaid"));
    }
  }
  return hits;
}

function artifactPaidSignals(json, relPath) {
  const hits = [];
  if (!isPlainObject(json)) return hits;
  if (PAID_SOURCE_KINDS.has(json.sourceKind)) {
    hits.push(
      error("paid_as_unpaid", "artifact.sourceKind", `${json.sourceKind} is paid evidence, not unpaid`),
    );
  }
  if (json.producer && json.producer.providerId === "stripe") {
    hits.push(error("paid_as_unpaid", "artifact.producer.providerId", "stripe producer cannot be unpaid"));
  }
  if (isPlainObject(json.settlement)) {
    if (typeof json.settlement.transaction === "string" || typeof json.settlement.amountUsdc === "string") {
      hits.push(
        error("paid_as_unpaid", "artifact.settlement", "settlement-bearing record cannot be unpaid"),
      );
    }
  }
  if (json.charged === true || json.paymentSent === true) {
    hits.push(error("paid_as_unpaid", "artifact", "charged/paymentSent artifact cannot be unpaid"));
  }
  if (relPath.includes("stripe")) {
    hits.push(error("paid_as_unpaid", "artifact.path", "stripe path cannot be unpaid evidence"));
  }
  return hits;
}

export function classifyArtifact(facts) {
  const { json, relPath } = facts;
  if (relPath === MCP_INVENTORY_REL) return "unpaid_mcp_inventory";
  if (!isPlainObject(json)) return null;
  if (json.status === 402) return "unpaid_payment_required";
  if (json.expectedStatus === 402 || json.state === "contract") return "unpaid_offer";
  if (json.state === "stop") return "unpaid_buyer_stop";
  if (json.state === "discover") return "unpaid_discover";
  if (json.x402Version === 2 && Array.isArray(json.items)) return "unpaid_catalog";
  if (json.schemaVersion === "samedaydesk.evidence-record.v1") {
    if (PAID_SOURCE_KINDS.has(json.sourceKind) || isPlainObject(json.settlement)) {
      return "paid_evidence_record";
    }
    return "unpaid_traffic_record";
  }
  return null;
}

export function extractClaims(facts, kind) {
  const json = facts.json;
  if (kind === "unpaid_mcp_inventory") {
    const names = parseInventoryNames(facts.text);
    return {
      toolNames: names,
      toolsBlockSha256: PINNED_TOOLS_BLOCK_SHA256,
      paymentSent: false,
      charged: false,
    };
  }
  if (!isPlainObject(json)) return null;
  if (kind === "unpaid_payment_required") {
    const accept = Array.isArray(json.body?.accepts) ? json.body.accepts[0] : null;
    return {
      httpStatus: json.status,
      route: json.route,
      amount: accept?.amount ?? null,
      payTo: accept?.payTo ?? null,
      asset: accept?.asset ?? null,
      network: accept?.network ?? null,
      paymentSent: false,
      charged: false,
    };
  }
  if (kind === "unpaid_buyer_stop") {
    return {
      state: json.state,
      reason: json.reason ?? null,
      paymentSent: false,
      charged: false,
    };
  }
  if (kind === "unpaid_offer") {
    const recv = isPlainObject(json.mustReceive) ? json.mustReceive : {};
    return {
      expectedStatus: json.expectedStatus ?? 402,
      amount: recv.amount ?? null,
      payTo: recv.payTo ?? null,
      asset: recv.asset ?? null,
      network: recv.network ?? null,
      paymentSent: false,
      charged: false,
    };
  }
  if (kind === "unpaid_discover") {
    const first = Array.isArray(json.surfaces) ? json.surfaces[0] : null;
    const observed = first && isPlainObject(first.observed) ? first.observed : {};
    return {
      state: json.state,
      origin: observed.origin ?? null,
      extractRoute: observed.extract?.route ?? "/extract",
      paymentSent: false,
      charged: false,
    };
  }
  if (kind === "unpaid_catalog") {
    const extract = Array.isArray(json.items)
      ? json.items.find((item) => item?.resource?.routeTemplate === "/extract")
      : null;
    const accept = extract && Array.isArray(extract.accepts) ? extract.accepts[0] : null;
    return {
      x402Version: json.x402Version,
      itemCount: Array.isArray(json.items) ? json.items.length : 0,
      extractAmount: accept?.amount ?? null,
      payTo: accept?.payTo ?? null,
      asset: accept?.asset ?? null,
      network: accept?.network ?? null,
      paymentSent: false,
      charged: false,
    };
  }
  if (kind === "unpaid_traffic_record") {
    return {
      recordId: json.recordId ?? null,
      sourceKind: json.sourceKind ?? null,
      paymentSent: false,
      charged: false,
    };
  }
  return null;
}

function validateWindow(window, errors) {
  if (!isPlainObject(window)) {
    errors.push(error("invalid_shape", "$.observationWindow", "observationWindow must be an object"));
    return;
  }
  allowKeys(window, WINDOW_KEYS, "$.observationWindow", errors);
  requireKeys(window, WINDOW_KEYS, "$.observationWindow", errors);
  const start = parseRfc3339(window.start);
  const end = parseRfc3339(window.end);
  if (start === null) {
    errors.push(error("invalid_observation_window", "$.observationWindow.start", "invalid start"));
  }
  if (end === null) {
    errors.push(error("invalid_observation_window", "$.observationWindow.end", "invalid end"));
  }
  if (start !== null && end !== null && start >= end) {
    errors.push(error("invalid_observation_window", "$.observationWindow", "start must be before end"));
  }
  const delay = window.reportingDelaySeconds;
  if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY) {
    errors.push(
      error("invalid_observation_window", "$.observationWindow.reportingDelaySeconds", "invalid delay"),
    );
  }
}

function validateMcpCrossPin(root, errors) {
  let toolsSha;
  try {
    toolsSha = readToolsBlockSha(root);
  } catch (cause) {
    errors.push(error("host_build", "$.claims.toolsBlockSha256", cause.message));
    return;
  }
  if (toolsSha !== PINNED_TOOLS_BLOCK_SHA256) {
    errors.push(
      error(
        "tools_sha_mismatch",
        "$.claims.toolsBlockSha256",
        `tools-block sha mismatch: got ${toolsSha} want ${PINNED_TOOLS_BLOCK_SHA256}`,
      ),
    );
  }
  const negotiationSha = readNegotiationSha(root);
  if (negotiationSha && negotiationSha !== toolsSha) {
    errors.push(
      error(
        "tools_sha_mismatch",
        "$.claims.toolsBlockSha256",
        `negotiation test sha ${negotiationSha} != source sha ${toolsSha}`,
      ),
    );
  }
}

export function evaluateRecord(input, catalog = loadCatalog(), root = findRepoRoot()) {
  const errors = [];
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [error("invalid_shape", "$", "record must be a plain object")],
      paidEvidence: [],
      naiveVerdict: "reject",
      honestVerdict: "reject",
      codes: ["invalid_shape"],
    };
  }

  allowKeys(input, ROOT_KEYS, "$", errors);
  requireKeys(
    input,
    [
      "schemaVersion",
      "bindId",
      "wave",
      "statusClass",
      "kind",
      "paymentSent",
      "charged",
      "artifact",
      "claims",
      "observationWindow",
      "completeness",
      "authorityClass",
      "unknownWhenAbsent",
      "prohibitedInferences",
    ],
    "$",
    errors,
  );

  if (input.schemaVersion !== SCHEMA_VERSION) {
    errors.push(error("unknown_schema_version", "$.schemaVersion", "unsupported schemaVersion"));
  }
  expectString(input.bindId, BIND_ID_RE, "$.bindId", errors);
  if (input.wave !== WAVE) {
    errors.push(error("invalid_wave", "$.wave", "wave must be w8"));
  }
  if (input.statusClass !== "unpaid") {
    errors.push(error("invalid_status_class", "$.statusClass", "this pack accepts only unpaid"));
  }
  if (!catalog.kinds.includes(input.kind)) {
    errors.push(error("unknown_kind", "$.kind", "kind is not in the closed set"));
  }
  if (input.paymentSent !== false) {
    errors.push(error("paid_as_unpaid", "$.paymentSent", "paymentSent must be false"));
  }
  if (input.charged !== false) {
    errors.push(error("paid_as_unpaid", "$.charged", "charged must be false"));
  }
  if (Object.hasOwn(input, "httpStatus") && input.httpStatus !== 402) {
    errors.push(error("paid_as_unpaid", "$.httpStatus", "optional httpStatus must be 402"));
  }
  if (!catalog.completeness.includes(input.completeness)) {
    errors.push(error("invalid_completeness", "$.completeness", "completeness is not in the closed set"));
  }
  if (!catalog.authorityClasses.includes(input.authorityClass)) {
    errors.push(
      error("invalid_authority_class", "$.authorityClass", "authorityClass is not in the closed set"),
    );
  }

  expectUniqueStringArray(input.unknownWhenAbsent, "$.unknownWhenAbsent", errors, UNKNOWN_RE, {
    min: 1,
    max: 8,
  });
  const inferenceOk = expectUniqueStringArray(
    input.prohibitedInferences,
    "$.prohibitedInferences",
    errors,
    TOKEN_RE,
    { min: 5, max: 16 },
  );
  if (inferenceOk && Array.isArray(input.prohibitedInferences)) {
    const listed = new Set(input.prohibitedInferences);
    for (const code of input.prohibitedInferences) {
      if (!catalog.prohibitedInferences.includes(code)) {
        errors.push(error("unknown_prohibited_inference", "$.prohibitedInferences", code));
      }
    }
    for (const required of catalog.requiredProhibitedInferences) {
      if (!listed.has(required)) {
        errors.push(
          error("missing_prohibited_inference", "$.prohibitedInferences", `missing ${required}`),
        );
      }
    }
  }

  validateWindow(input.observationWindow, errors);

  if (Object.hasOwn(input, "request")) {
    if (!isPlainObject(input.request)) {
      errors.push(error("invalid_shape", "$.request", "request must be an object"));
    } else {
      allowKeys(input.request, REQUEST_KEYS, "$.request", errors);
    }
  }
  if (Object.hasOwn(input, "settlement") && input.settlement !== null) {
    if (!isPlainObject(input.settlement)) {
      errors.push(error("invalid_shape", "$.settlement", "settlement must be an object"));
    } else {
      allowKeys(input.settlement, SETTLEMENT_KEYS, "$.settlement", errors);
    }
  }

  const paidEvidence = collectPaidEvidence(input);
  errors.push(...paidEvidence);

  if (!isPlainObject(input.artifact)) {
    errors.push(error("invalid_shape", "$.artifact", "artifact must be an object"));
  } else {
    allowKeys(input.artifact, ARTIFACT_KEYS, "$.artifact", errors);
    requireKeys(input.artifact, ["path"], "$.artifact", errors);
    const declaredSha = Object.hasOwn(input.artifact, "sha256") ? input.artifact.sha256 : null;
    if (declaredSha === "" || declaredSha == null) {
      errors.push(error("unbound_bytes", "$.artifact.sha256", "sha256 is required to bind evidence"));
    } else if (typeof declaredSha !== "string" || !SHA_RE.test(declaredSha)) {
      errors.push(error("invalid_shape", "$.artifact.sha256", "sha256 must be 64 lowercase hex chars"));
    }
    if (!Number.isInteger(input.artifact.bytes) || input.artifact.bytes < 1) {
      errors.push(error("invalid_shape", "$.artifact.bytes", "bytes must be a positive integer"));
    }

    const resolved = resolveArtifactPath(root, input.artifact.path);
    if (!resolved.ok) {
      errors.push(error(resolved.code, "$.artifact.path", resolved.message));
    } else if (!existsSync(resolved.abs)) {
      errors.push(error("missing_artifact", "$.artifact.path", "committed artifact is missing"));
    } else {
      const hashed = hashFile(resolved.abs);
      let json = null;
      try {
        json = JSON.parse(hashed.text);
      } catch {
        json = null;
      }
      const facts = {
        sha256: hashed.sha256,
        bytes: hashed.bytes,
        text: hashed.text,
        json,
        relPath: resolved.path,
      };

      if (typeof declaredSha === "string" && SHA_RE.test(declaredSha) && declaredSha !== hashed.sha256) {
        errors.push(
          error(
            "sha_mismatch",
            "$.artifact.sha256",
            `declared ${declaredSha} != computed ${hashed.sha256}`,
          ),
        );
      }
      if (Number.isInteger(input.artifact.bytes) && input.artifact.bytes !== hashed.bytes) {
        errors.push(
          error(
            "sha_mismatch",
            "$.artifact.bytes",
            `declared bytes ${input.artifact.bytes} != computed ${hashed.bytes}`,
          ),
        );
      }

      const paidPath = paidRefuseByPath(catalog, resolved.path);
      if (paidPath) {
        errors.push(
          error(
            paidPath.code || "paid_as_unpaid",
            "$.artifact.path",
            paidPath.reason || "paid artifact cannot be bound as unpaid",
          ),
        );
      }

      const pin = pinByBindId(catalog, input.bindId) || pinByPath(catalog, resolved.path);
      if (!paidPath && !pin) {
        errors.push(
          error("unknown_artifact", "$.artifact.path", "path is not a w8 unpaid pin"),
        );
      }
      if (pin) {
        if (input.bindId !== pin.bindId) {
          errors.push(error("pin_mismatch", "$.bindId", "bindId does not match the pinned artifact"));
        }
        if (resolved.path !== pin.path) {
          errors.push(error("pin_mismatch", "$.artifact.path", "path does not match bindId pin"));
        }
        if (input.kind !== pin.kind) {
          errors.push(error("pin_mismatch", "$.kind", "kind does not match pin"));
        }
        if (hashed.sha256 !== pin.sha256) {
          errors.push(
            error(
              "pin_drift",
              "$.artifact.sha256",
              `committed bytes drifted from w8 pin: got ${hashed.sha256} want ${pin.sha256}`,
            ),
          );
        }
        if (hashed.bytes !== pin.bytes) {
          errors.push(
            error("pin_drift", "$.artifact.bytes", `committed size drifted from w8 pin ${pin.bytes}`),
          );
        }
      }

      errors.push(...artifactPaidSignals(json, resolved.path));

      const classified = classifyArtifact(facts);
      if (classified === "paid_evidence_record") {
        errors.push(
          error("paid_as_unpaid", "$.artifact.path", "bound artifact is a paid evidence record"),
        );
      } else if (classified && input.kind && classified !== input.kind) {
        errors.push(
          error(
            "kind_mismatch",
            "$.kind",
            `artifact classifies as ${classified}, record claims ${input.kind}`,
          ),
        );
      } else if (!classified && !paidPath) {
        errors.push(error("unknown_kind", "$.kind", "could not classify committed artifact as unpaid"));
      }

      if (isPlainObject(input.claims) && classified && classified !== "paid_evidence_record") {
        const extracted = extractClaims(facts, classified);
        if (extracted && !stableEqual(input.claims, extracted)) {
          errors.push(
            error("claim_mismatch", "$.claims", "claims do not match the hashed unpaid artifact"),
          );
        }
        if (pin && isPlainObject(pin.claims) && !stableEqual(input.claims, pin.claims)) {
          errors.push(error("claim_mismatch", "$.claims", "claims do not match the w8 pin"));
        }
      }

      if (input.kind === "unpaid_mcp_inventory") {
        validateMcpCrossPin(root, errors);
        const names = parseInventoryNames(facts.text);
        if (!names || !stableEqual(names, [...MCP_TOOL_NAMES])) {
          errors.push(
            error("claim_mismatch", "$.claims.toolNames", "inventory names drifted from unpaid five-tool set"),
          );
        }
      }
    }
  }

  if (!isPlainObject(input.claims)) {
    errors.push(error("invalid_shape", "$.claims", "claims must be an object"));
  } else {
    if (Object.hasOwn(input.claims, "route") && !ROUTE_RE.test(String(input.claims.route))) {
      errors.push(error("invalid_shape", "$.claims.route", "invalid route"));
    }
    if (Object.hasOwn(input.claims, "amount") && input.claims.amount != null) {
      expectString(input.claims.amount, AMOUNT_RE, "$.claims.amount", errors);
    }
    if (Object.hasOwn(input.claims, "payTo") && input.claims.payTo != null) {
      expectString(input.claims.payTo, ADDR_RE, "$.claims.payTo", errors);
    }
    if (Object.hasOwn(input.claims, "asset") && input.claims.asset != null) {
      expectString(input.claims.asset, ADDR_RE, "$.claims.asset", errors);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of errors) {
    const key = `${item.code}:${item.path}:${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const naive = naiveVerdict(input);
  const ok = unique.length === 0;
  return {
    ok,
    errors: unique,
    paidEvidence,
    naiveVerdict: naive,
    honestVerdict: ok ? "accept" : "reject",
    codes: unique.map((item) => item.code),
    bindId: input.bindId ?? null,
    statusClass: input.statusClass ?? null,
    kind: input.kind ?? null,
  };
}

export function validateFile(filePath, catalog = loadCatalog(), root = findRepoRoot()) {
  let record;
  try {
    record = loadJson(filePath);
  } catch (cause) {
    return {
      ok: false,
      filePath,
      bindId: null,
      statusClass: null,
      kind: null,
      naiveVerdict: "reject",
      honestVerdict: "reject",
      paidEvidence: [],
      codes: ["invalid_shape"],
      errors: [error("invalid_shape", "$", `cannot parse JSON: ${cause.message}`)],
    };
  }
  const evaluated = evaluateRecord(record, catalog, root);
  return { ...evaluated, filePath };
}

export function runSuite(catalog = loadCatalog(), root = findRepoRoot()) {
  const results = [];
  for (const filePath of listJsonFiles(VALID_FIXTURES)) {
    const result = validateFile(filePath, catalog, root);
    results.push({
      filePath,
      expect: "accept",
      ok: result.ok,
      errors: result.errors,
    });
  }

  const manifest = loadInvalidManifest();
  for (const [name, spec] of Object.entries(manifest)) {
    const filePath = join(INVALID_FIXTURES, name);
    const result = validateFile(filePath, catalog, root);
    const codes = result.errors.map((item) => item.code);
    const matched = !result.ok && codes.includes(spec.code);
    results.push({
      filePath,
      expect: "reject",
      expectedCode: spec.code,
      ok: matched,
      errors: result.errors,
    });
  }

  const pinBindIds = catalog.pins.map((pin) => pin.bindId).sort();
  const validBindIds = listJsonFiles(VALID_FIXTURES)
    .map((filePath) => loadJson(filePath).bindId)
    .sort();
  if (JSON.stringify(pinBindIds) !== JSON.stringify(validBindIds)) {
    results.push({
      filePath: DEFAULT_CATALOG,
      expect: "accept",
      ok: false,
      errors: [
        error("pin_mismatch", "$.pins", "catalog pins and valid fixtures are not 1:1 on bindId"),
      ],
    });
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  return {
    ok: failed === 0,
    passed,
    failed,
    total: results.length,
    results,
  };
}

export function evaluateSeededFailure(catalog = loadCatalog(), root = findRepoRoot()) {
  const seed = catalog.designatedSeed;
  if (!seed || seed.id !== SEEDED_FAILURE) {
    return {
      ok: false,
      caught: false,
      error: { code: "SEED_MISS", message: "catalog designatedSeed.id must be sha-mismatch" },
    };
  }
  const filePath = designatedSeedPath(catalog);
  const result = validateFile(filePath, catalog, root);
  const codes = result.errors.map((item) => item.code);
  const caught =
    result.naiveVerdict === "accept" &&
    result.honestVerdict === "reject" &&
    codes.includes(seed.code);
  if (!caught) {
    return {
      ok: false,
      caught: false,
      filePath,
      result,
      error: {
        code: result.ok ? "SEED_ACCEPTED" : "SEED_MISS",
        message: result.ok
          ? "seeded sha-mismatch was accepted as bound unpaid evidence"
          : `seeded sha-mismatch not caught on ${seed.id}`,
      },
    };
  }
  return {
    ok: false,
    caught: true,
    filePath,
    result,
    error: {
      code: "SEED_REJECT",
      message: `seeded sha-mismatch caught on ${seed.id}`,
    },
  };
}

export function refusedFlag(argv) {
  for (const arg of argv) {
    const name = String(arg).replace(/^--/, "");
    if (REFUSED_FLAGS.includes(name)) return arg;
  }
  return null;
}
