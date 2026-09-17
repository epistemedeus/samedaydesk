import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const CASE_SCHEMA = "samedaydesk.output-contract-evaluation.case.v1";
export const RESULT_SCHEMA = "samedaydesk.output-contract-evaluation.result.v1";
export const PROPOSED_PRICE_USDC = "5.000";
export const BUYER_CLASSES = Object.freeze(["independent", "owner", "sponsored", "unknown"]);
export const PACK_FIXTURE_DIR = join(here, "../../packs/output-contract-evaluation/fixtures");
export const MANIFEST_PATH = join(PACK_FIXTURE_DIR, "manifest.json");

export const EXIT = Object.freeze({
  OK: 0,
  FAIL: 1,
  USAGE: 2,
});

const RECORD_ID_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const DECIMAL_RE = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;
const DELIVERY_STATUS_RE = /^[a-z][a-z0-9_]{1,95}$/;
const TX_RE = /^0x[a-f0-9]{64}$/;
const PATH_RE = /^[A-Za-z0-9_./\[\]-]{1,160}$/;
const CASE_ID_RE = /^[a-z][a-z0-9_-]{2,95}$/;
const SURFACE_RE = /^[\x20-\x7E]{1,200}$/;

const ROOT_KEYS = Object.freeze([
  "schema",
  "caseId",
  "proposal",
  "promisedContract",
  "output",
  "settlement",
  "policy",
]);
const PROPOSAL_KEYS = Object.freeze([
  "priceUsdc",
  "live",
  "skuPublished",
  "payment",
  "charged",
  "charge",
]);
const CONTRACT_KEYS = Object.freeze(["method", "route", "requiredPaths", "mimeType"]);
const OUTPUT_KEYS = Object.freeze(["httpStatus", "body", "decision"]);
const SETTLEMENT_KEYS = Object.freeze([
  "operationId",
  "amountUsdc",
  "buyerClass",
  "validDeliveryStatus",
  "transaction",
  "facilitatorOrPayoutRef",
]);
const POLICY_KEYS = Object.freeze(["onInvalid"]);
const FORBIDDEN_ROOT_KEYS = Object.freeze([
  "checkout",
  "stripe",
  "stripeSession",
  "paymentIntent",
  "wallet",
  "secret",
  "privateKey",
  "xPayment",
  "PAYMENT-SIGNATURE",
  "mutateSettlement",
  "settlementPatch",
  "expectedSettlement",
  "voidSettlement",
  "refund",
]);

const VOID_ON_INVALID = new Set([
  "void",
  "void_settlement",
  "void_on_invalid",
  "reverse",
  "reverse_settlement",
  "unwind",
  "cancel",
  "cancel_settlement",
  "drop",
  "drop_settlement",
  "erase",
  "null_settlement",
]);
const REFUND_ON_INVALID = new Set([
  "refund",
  "refund_on_invalid",
  "chargeback",
  "return_funds",
]);
const MUTATE_ON_INVALID = new Set([
  "mutate_settlement",
  "rewrite_delivery_status",
  "patch_settlement",
  "update_settlement",
  "rewrite_settlement",
]);

export const SEEDS = Object.freeze({
  "void-settlement": "seeded-void-settlement.json",
  "live-sku": "seeded-live-sku.json",
  "missing-settlement": "seeded-missing-settlement.json",
  "price-rewrite": "seeded-price-rewrite.json",
  "refund-on-invalid": "seeded-refund-on-invalid.json",
});

export function packFixtureDir() {
  return PACK_FIXTURE_DIR;
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadManifest(path = MANIFEST_PATH) {
  return loadJson(path);
}

export function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort()
    .map((name) => join(dir, name));
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function settlementFingerprint(settlement) {
  return sha256Canonical(settlement);
}

export function preserveSettlement(settlement) {
  return structuredClone(settlement);
}

export function settlementsEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

export function normalizePriceUsdc(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!DECIMAL_RE.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  return `${whole}.${frac.padEnd(3, "0").slice(0, 3)}`;
}

function err(code, path, message) {
  return { code, path, message };
}

function allowKeys(object, allowed, path, errors) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      errors.push(err("invalid_shape", `${path}.${key}`, `unknown key ${key}`));
    }
  }
}

function getByPath(root, spec) {
  if (typeof spec !== "string" || spec.length === 0) return { found: false, value: undefined };
  const pointer = spec.startsWith("/");
  const parts = pointer
    ? spec
        .slice(1)
        .split("/")
        .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
        .filter((part) => part.length > 0)
    : spec.split(".").filter((part) => part.length > 0);
  let current = root;
  for (const part of parts) {
    if (current == null || (typeof current !== "object" && !Array.isArray(current))) {
      return { found: false, value: undefined };
    }
    const key = Array.isArray(current) && /^\d+$/.test(part) ? Number(part) : part;
    if (!Object.hasOwn(current, key)) return { found: false, value: undefined };
    current = current[key];
  }
  return { found: true, value: current };
}

function defaultProposal() {
  return {
    priceUsdc: PROPOSED_PRICE_USDC,
    live: false,
    skuPublished: false,
    payment: "none",
    charged: false,
  };
}

function reject(code, message, errors) {
  return {
    ok: false,
    schema: RESULT_SCHEMA,
    decision: null,
    outputValid: null,
    settlementPreserved: false,
    settlementMutated: false,
    paid: false,
    paymentSent: false,
    proposal: defaultProposal(),
    error: { code, message },
    errors,
    findings: [],
    settlement: null,
    boundary: {
      checkoutMutated: false,
      registryMutated: false,
      publishMutated: false,
      voidOnInvalidRefused: code === "void_settlement_on_invalid_refused",
      refundOnInvalidRefused: code === "refund_on_invalid_refused",
    },
  };
}

function policyCode(onInvalid) {
  const token = String(onInvalid || "").trim();
  if (!token || token === "preserve_settlement" || token === "preserve" || token === "keep") {
    return null;
  }
  if (VOID_ON_INVALID.has(token)) return "void_settlement_on_invalid_refused";
  if (REFUND_ON_INVALID.has(token)) return "refund_on_invalid_refused";
  if (MUTATE_ON_INVALID.has(token)) return "settlement_mutation_refused";
  return "on_invalid_not_preserve_refused";
}

export function evaluateCase(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return reject("invalid_shape", "case must be an object", [
      err("invalid_shape", "$", "case must be an object"),
    ]);
  }

  for (const key of FORBIDDEN_ROOT_KEYS) {
    if (Object.hasOwn(input, key)) {
      const code =
        key === "voidSettlement"
          ? "void_settlement_on_invalid_refused"
          : key === "refund"
            ? "refund_on_invalid_refused"
            : key === "checkout" || key === "stripe" || key === "stripeSession" || key === "paymentIntent"
              ? "checkout_mutation_refused"
              : key === "mutateSettlement" ||
                  key === "settlementPatch" ||
                  key === "expectedSettlement"
                ? "settlement_mutation_refused"
                : "payment_mutation_refused";
      return reject(code, `case must not include ${key}`, [err(code, `$.${key}`, `forbidden key ${key}`)]);
    }
  }

  allowKeys(input, ROOT_KEYS, "$", errors);
  if (input.schema !== CASE_SCHEMA) {
    errors.push(err("invalid_shape", "$.schema", `schema must be ${CASE_SCHEMA}`));
  }
  if (typeof input.caseId !== "string" || !CASE_ID_RE.test(input.caseId)) {
    errors.push(err("invalid_shape", "$.caseId", "caseId is required"));
  }

  if (!Object.hasOwn(input, "settlement") || input.settlement == null) {
    return reject("missing_settlement", "settlement is required and is preserved on invalid output", [
      err("missing_settlement", "$.settlement", "settlement is required"),
    ]);
  }
  if (!isPlainObject(input.settlement)) {
    return reject("invalid_shape", "settlement must be an object", [
      err("invalid_shape", "$.settlement", "settlement must be an object"),
    ]);
  }

  const policy = Object.hasOwn(input, "policy") ? input.policy : { onInvalid: "preserve_settlement" };
  if (!isPlainObject(policy)) {
    return reject("invalid_shape", "policy must be an object", [
      err("invalid_shape", "$.policy", "policy must be an object"),
    ]);
  }
  allowKeys(policy, POLICY_KEYS, "$.policy", errors);
  const refusedPolicy = policyCode(policy.onInvalid);
  if (refusedPolicy) {
    return reject(refusedPolicy, "invalid output must preserve settlement; void/refund/mutate is refused", [
      err(refusedPolicy, "$.policy.onInvalid", `onInvalid ${policy.onInvalid} is refused`),
    ]);
  }

  const proposal = Object.hasOwn(input, "proposal") ? input.proposal : defaultProposal();
  if (!isPlainObject(proposal)) {
    return reject("invalid_shape", "proposal must be an object", [
      err("invalid_shape", "$.proposal", "proposal must be an object"),
    ]);
  }
  allowKeys(proposal, PROPOSAL_KEYS, "$.proposal", errors);
  if (proposal.live === true || proposal.skuPublished === true) {
    return reject("live_sku_refused", "this evaluation is proposed, not a live SKU", [
      err("live_sku_refused", "$.proposal", "live SKU publish is refused"),
    ]);
  }
  if (proposal.charge === true || proposal.charged === true) {
    return reject("payment_mutation_refused", "this evaluation does not charge", [
      err("payment_mutation_refused", "$.proposal", "charge is refused"),
    ]);
  }
  if (Object.hasOwn(proposal, "payment") && proposal.payment !== "none") {
    return reject("payment_mutation_refused", "payment must stay none", [
      err("payment_mutation_refused", "$.proposal.payment", "payment must be none"),
    ]);
  }
  const price = Object.hasOwn(proposal, "priceUsdc")
    ? normalizePriceUsdc(proposal.priceUsdc)
    : PROPOSED_PRICE_USDC;
  if (price !== PROPOSED_PRICE_USDC) {
    return reject("price_not_proposed_five_usdc", "proposed evaluation price is 5.000 USDC", [
      err("price_not_proposed_five_usdc", "$.proposal.priceUsdc", "price must be 5.000 USDC"),
    ]);
  }

  if (!isPlainObject(input.promisedContract)) {
    return reject("missing_promised_contract", "promisedContract is required", [
      err("missing_promised_contract", "$.promisedContract", "promisedContract must be an object"),
    ]);
  }
  allowKeys(input.promisedContract, CONTRACT_KEYS, "$.promisedContract", errors);
  const requiredPaths = input.promisedContract.requiredPaths;
  if (!Array.isArray(requiredPaths) || requiredPaths.length < 1) {
    return reject("empty_required_paths", "promisedContract.requiredPaths must be a non-empty array", [
      err("empty_required_paths", "$.promisedContract.requiredPaths", "requiredPaths must be non-empty"),
    ]);
  }
  for (let i = 0; i < requiredPaths.length; i += 1) {
    const spec = requiredPaths[i];
    if (typeof spec !== "string" || !PATH_RE.test(spec)) {
      errors.push(err("invalid_shape", `$.promisedContract.requiredPaths[${i}]`, "path is invalid"));
    }
  }
  if (Object.hasOwn(input.promisedContract, "method")) {
    const method = input.promisedContract.method;
    if (method !== "GET" && method !== "POST") {
      errors.push(err("invalid_shape", "$.promisedContract.method", "method must be GET or POST"));
    }
  }
  if (Object.hasOwn(input.promisedContract, "route") && typeof input.promisedContract.route !== "string") {
    errors.push(err("invalid_shape", "$.promisedContract.route", "route must be a string"));
  }

  if (!isPlainObject(input.output)) {
    return reject("invalid_shape", "output must be an object", [
      err("invalid_shape", "$.output", "output must be an object"),
    ]);
  }
  allowKeys(input.output, OUTPUT_KEYS, "$.output", errors);
  const httpStatus = input.output.httpStatus;
  if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) {
    errors.push(err("invalid_shape", "$.output.httpStatus", "httpStatus must be an HTTP status integer"));
  }

  const settlement = input.settlement;
  allowKeys(settlement, SETTLEMENT_KEYS, "$.settlement", errors);
  for (const key of ["operationId", "amountUsdc", "buyerClass", "validDeliveryStatus"]) {
    if (!Object.hasOwn(settlement, key)) {
      errors.push(err("invalid_shape", `$.settlement.${key}`, `${key} is required`));
    }
  }
  if (typeof settlement.operationId === "string" && !RECORD_ID_RE.test(settlement.operationId)) {
    errors.push(err("invalid_shape", "$.settlement.operationId", "operationId is invalid"));
  }
  if (typeof settlement.amountUsdc === "string" && !DECIMAL_RE.test(settlement.amountUsdc)) {
    errors.push(err("invalid_shape", "$.settlement.amountUsdc", "amountUsdc is invalid"));
  }
  if (typeof settlement.buyerClass === "string" && !BUYER_CLASSES.includes(settlement.buyerClass)) {
    errors.push(err("invalid_buyer_class", "$.settlement.buyerClass", "buyerClass is not in the closed set"));
  }
  if (
    typeof settlement.validDeliveryStatus === "string" &&
    !DELIVERY_STATUS_RE.test(settlement.validDeliveryStatus)
  ) {
    errors.push(err("invalid_shape", "$.settlement.validDeliveryStatus", "validDeliveryStatus is invalid"));
  }
  if (Object.hasOwn(settlement, "transaction") && !TX_RE.test(settlement.transaction)) {
    errors.push(err("invalid_shape", "$.settlement.transaction", "transaction must be a 0x-prefixed 32-byte hash"));
  }
  if (
    Object.hasOwn(settlement, "facilitatorOrPayoutRef") &&
    (typeof settlement.facilitatorOrPayoutRef !== "string" ||
      !SURFACE_RE.test(settlement.facilitatorOrPayoutRef))
  ) {
    errors.push(err("invalid_shape", "$.settlement.facilitatorOrPayoutRef", "facilitatorOrPayoutRef is invalid"));
  }

  if (errors.length > 0) {
    return reject(errors[0].code, errors[0].message, errors);
  }

  const findings = [];
  const body = input.output.body;
  if (!isPlainObject(body) && !Array.isArray(body)) {
    findings.push(err("body_not_object", "$.output.body", "output body must be a JSON object or array"));
  }
  if (httpStatus < 200 || httpStatus > 299) {
    findings.push(
      err("http_status_not_success", "$.output.httpStatus", `httpStatus ${httpStatus} is not a 2xx delivery`),
    );
  }
  for (const spec of requiredPaths) {
    const lookup = getByPath(isPlainObject(body) || Array.isArray(body) ? body : {}, spec);
    if (!lookup.found || lookup.value === null || lookup.value === undefined) {
      findings.push(err("missing_required_path", `$.output.body:${spec}`, `required path ${spec} is absent`));
    }
  }

  const outputValid = findings.length === 0;
  const preserved = preserveSettlement(settlement);
  const inputFingerprint = settlementFingerprint(settlement);
  const outputFingerprint = settlementFingerprint(preserved);
  if (inputFingerprint !== outputFingerprint || !settlementsEqual(settlement, preserved)) {
    return reject("settlement_mutation_refused", "internal settlement clone diverged", [
      err("settlement_mutation_refused", "$.settlement", "preserved settlement must match input"),
    ]);
  }

  return {
    ok: true,
    schema: RESULT_SCHEMA,
    caseId: input.caseId,
    decision: outputValid ? "valid" : "invalid",
    outputValid,
    settlementPreserved: true,
    settlementMutated: false,
    settlementFingerprint: outputFingerprint,
    settlement: preserved,
    paid: false,
    paymentSent: false,
    proposal: {
      priceUsdc: PROPOSED_PRICE_USDC,
      live: false,
      skuPublished: false,
      payment: "none",
      charged: false,
    },
    enforcement: "local_supplied_output",
    buyerOwnedOutputEnforced: true,
    policy: { onInvalid: "preserve_settlement" },
    findings,
    error: null,
    boundary: {
      checkoutMutated: false,
      registryMutated: false,
      publishMutated: false,
      voidOnInvalidRefused: true,
      refundOnInvalidRefused: true,
    },
  };
}

export function displayPath(filePath, cwd = process.cwd()) {
  if (!filePath) return filePath;
  const rel = relative(cwd, filePath);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel;
  return filePath;
}

export function evaluateFile(filePath) {
  const shown = displayPath(filePath);
  let input;
  try {
    input = loadJson(filePath);
  } catch (cause) {
    return {
      ...reject("invalid_shape", `cannot parse JSON: ${cause.message}`, [
        err("invalid_shape", "$", `cannot parse JSON: ${cause.message}`),
      ]),
      filePath: shown,
    };
  }
  return { ...evaluateCase(input), filePath: shown };
}

export function runSuite(dir = PACK_FIXTURE_DIR) {
  const manifest = loadManifest(join(dir, "manifest.json"));
  const files = listJsonFiles(dir);
  const names = files.map((filePath) => basename(filePath)).sort();
  const declared = Object.keys(manifest).sort();
  const results = [];
  let ok = canonicalJson(names) === canonicalJson(declared);
  if (!ok) {
    results.push({
      file: join(dir, "manifest.json"),
      expect: "manifest",
      ok: false,
      codes: ["fixture_manifest_mismatch"],
    });
  }
  for (const filePath of files) {
    const name = basename(filePath);
    const spec = manifest[name];
    const evaluated = evaluateFile(filePath);
    if (!spec) {
      ok = false;
      results.push({
        file: filePath,
        expect: "undeclared",
        ok: false,
        codes: ["undeclared_fixture"],
        decision: evaluated.decision,
      });
      continue;
    }
    if (spec.expect === "reject") {
      const codes = [
        evaluated.error?.code,
        ...(evaluated.errors || []).map((item) => item.code),
      ].filter(Boolean);
      const matched = evaluated.ok === false && codes.includes(spec.code);
      if (!matched) ok = false;
      results.push({
        file: filePath,
        expect: "reject",
        expectedCode: spec.code,
        ok: matched,
        codes,
        decision: evaluated.decision,
      });
      continue;
    }
    const decisionOk = evaluated.ok === true && evaluated.decision === spec.decision;
    const preserved = evaluated.settlementPreserved === true && evaluated.settlementMutated === false;
    const matched = decisionOk && preserved;
    if (!matched) ok = false;
    results.push({
      file: filePath,
      expect: "evaluate",
      expectedDecision: spec.decision,
      ok: matched,
      codes: evaluated.findings.map((item) => item.code),
      decision: evaluated.decision,
      settlementPreserved: evaluated.settlementPreserved,
    });
  }
  return { ok, passed: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, total: results.length, results };
}

export function resolveCasePath(value, cwd = process.cwd()) {
  if (!value) return null;
  if (SEEDS[value]) return join(PACK_FIXTURE_DIR, SEEDS[value]);
  const direct = isAbsolute(value) ? value : join(cwd, value);
  if (existsSync(direct)) return direct;
  const packed = join(PACK_FIXTURE_DIR, basename(value));
  if (existsSync(packed)) return packed;
  return direct;
}
