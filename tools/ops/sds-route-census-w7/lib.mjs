import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, TOOL_DIR, normalizePath, walkRuntime, walkSource } from "./walk.mjs";

export const SCHEMA = "samedaydesk.ops.sds-route-census.w7.v1";
export const PRODUCT = "sds-route-census-w7";
export { ROOT, TOOL_DIR };

const here = dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURES = join(here, "fixtures/valid");
const INVALID_FIXTURES = join(here, "fixtures/invalid");
const INVALID_MANIFEST = join(INVALID_FIXTURES, "manifest.json");

const PAYMENT_API = new Set([
  "POST /api/checkout/create-payment-intent",
  "POST /api/checkout/prepare-payment",
  "POST /api/checkout/seller-repair-session",
  "POST /api/checkout/verify",
  "POST /api/stripe/webhook",
]);
const PAYMENT_UI = new Set(["GET /checkout"]);
const WEBHOOK_ONLY = new Set(["POST /api/webhooks/resend"]);
const MONEY_ADJACENT_EXTRA = new Set([
  "GET /mcp",
  "POST /mcp",
  "GET /scan",
  "GET /x402",
  "GET /x402/seller-conformance",
]);
const MUTATING_HTTP = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const SEEDED_FAILURES = Object.freeze({
  "payment-as-readonly": {
    file: "payment-as-readonly.json",
    code: "payment_as_readonly",
    designated: true,
    message: "seeded payment-as-readonly caught: payment route cannot be labeled read-only",
  },
});

export function codesFrom(result) {
  if (Array.isArray(result?.codes)) return result.codes;
  if (result?.error?.code) return [result.error.code];
  if (Array.isArray(result?.errors)) {
    return result.errors.map((item) => item.code).filter(Boolean);
  }
  return [];
}

export function classify(method, path) {
  const verb = String(method || "GET").toUpperCase();
  const routePath = normalizePath(path);
  const key = `${verb} ${routePath}`;
  let cls = "read_only";
  if (PAYMENT_API.has(key)) cls = "payment";
  else if (PAYMENT_UI.has(key)) cls = "payment_ui";
  else if (WEBHOOK_ONLY.has(key)) cls = "webhook";
  else if (MUTATING_HTTP.has(verb)) cls = "mutating";

  const payment = cls === "payment";
  const paymentUi = cls === "payment_ui";
  const webhook = cls === "webhook" || key === "POST /api/stripe/webhook";
  const moneyMovement = payment || paymentUi;
  const moneyAdjacent =
    moneyMovement || webhook || MONEY_ADJACENT_EXTRA.has(key) || PAYMENT_API.has(key);
  const spa = verb === "GET" && !routePath.startsWith("/api/") && !routePath.startsWith("/.") && (
    routePath === "/" ||
    routePath === "/tools/ai-readiness" ||
    routePath.startsWith("/x402") ||
    routePath.startsWith("/for-agents") ||
    ["/login", "/signup", "/dashboard", "/checkout", "/terms", "/privacy"].includes(routePath)
  );
  const api = routePath.startsWith("/api/") && verb !== "OPTIONS";
  const readOnly = cls === "read_only";

  return {
    method: verb,
    path: routePath,
    key,
    class: cls,
    readOnly,
    moneyMovement,
    moneyAdjacent,
    payment,
    paymentUi,
    webhook,
    spa,
    api,
    probed: false,
  };
}

function decorate(sourceRoute) {
  const classified = classify(sourceRoute.method, sourceRoute.path);
  return {
    ...classified,
    file: sourceRoute.file,
    source: sourceRoute.source,
    redirectTo: sourceRoute.redirectTo,
    runtimeExpected: sourceRoute.runtimeExpected,
    live: false,
    origin: "local-source",
  };
}

function countRoutes(routes) {
  return {
    total: routes.length,
    readOnly: routes.filter((row) => row.readOnly).length,
    mutating: routes.filter((row) => row.class === "mutating").length,
    payment: routes.filter((row) => row.class === "payment").length,
    paymentUi: routes.filter((row) => row.class === "payment_ui").length,
    webhook: routes.filter((row) => row.class === "webhook").length,
    moneyAdjacent: routes.filter((row) => row.moneyAdjacent).length,
    spa: routes.filter((row) => row.spa).length,
    api: routes.filter((row) => row.api).length,
  };
}

export async function buildCensus({ root = ROOT } = {}) {
  const source = walkSource({ root });
  const routes = source.routes.map(decorate);
  let runtimeWalk;
  let runtimeError = null;
  try {
    runtimeWalk = await walkRuntime({ root });
  } catch (cause) {
    runtimeError = cause instanceof Error ? cause.message : String(cause);
    runtimeWalk = { leaves: [] };
  }

  const sourceKeys = new Set(routes.map((row) => row.key));
  const expectedRuntime = new Set(
    routes.filter((row) => row.runtimeExpected).map((row) => row.key),
  );
  const runtimeKeys = new Set(runtimeWalk.leaves.map((leaf) => leaf.key));
  const missing = [...expectedRuntime].filter((key) => !runtimeKeys.has(key)).sort();
  const extra = [...runtimeKeys].filter((key) => !sourceKeys.has(key)).sort();
  const runtime = {
    ok: runtimeError == null && missing.length === 0 && extra.length === 0,
    skipped: false,
    checked: expectedRuntime.size,
    runtimeLeaves: runtimeWalk.leaves.length,
    missing,
    error: runtimeError,
  };

  const paymentRoutes = routes
    .filter((row) => row.class === "payment" || row.class === "payment_ui")
    .sort((a, b) => {
      if (a.class !== b.class) return a.class === "payment" ? -1 : 1;
      return a.key.localeCompare(b.key);
    })
    .map((row) => row.key);

  return {
    ok: runtime.ok && source.spaDrift.inReactNotHistory.length === 0 && source.spaDrift.inHistoryNotReact.length === 0,
    command: "census",
    schemaVersion: SCHEMA,
    product: PRODUCT,
    mode: "read_only",
    origin: "local-source",
    live: false,
    payment: false,
    neo: false,
    publish: false,
    probed: false,
    moneyMovement: false,
    counts: countRoutes(routes),
    runtime,
    spaDrift: source.spaDrift,
    paymentRoutes,
    routes,
  };
}

function naiveLooksAccept(claim) {
  const routes = Array.isArray(claim?.routes) ? claim.routes : [];
  if (routes.length === 0 && claim?.readOnly === true) return true;
  if (routes.length === 0) return false;
  return routes.every((row) => row.readOnly === true || row.class === "read_only");
}

export function validateClaim(claim, census) {
  const codes = [];
  const quotedPath = claim?.quotedPath || claim?.file || "claim";

  if (claim == null || typeof claim !== "object" || Array.isArray(claim)) {
    return {
      ok: false,
      naiveVerdict: "reject",
      honestVerdict: "reject",
      codes: ["invalid_claim"],
      errors: [{ code: "invalid_claim", path: quotedPath, message: "claim must be an object" }],
    };
  }

  const origin = typeof claim.origin === "string" ? claim.origin : "";
  if (claim.live === true || /^https?:\/\//i.test(origin) || origin === "live") {
    codes.push("live_origin");
  }
  if (claim.neo === true || /neomorphic/i.test(origin) || claim.loadNeo === true) {
    codes.push("neo_host");
  }
  if (claim.publish === true || claim.mode === "publish") {
    codes.push("publish_refused");
  }
  if (claim.probed === true || claim.mode === "probe") {
    codes.push("probed_as_cold");
  }
  if (claim.payment === true || claim.moneyMovement === true || claim.mode === "pay") {
    codes.push("payment_refused");
  }

  const honestByKey = new Map((census?.routes || []).map((row) => [row.key, row]));
  for (const row of Array.isArray(claim.routes) ? claim.routes : []) {
    const honest = honestByKey.get(`${String(row.method || "GET").toUpperCase()} ${normalizePath(row.path)}`)
      || classify(row.method, row.path);
    const labeledReadOnly = row.readOnly === true || row.class === "read_only";
    if (labeledReadOnly && (honest.moneyMovement || honest.class === "payment" || honest.class === "payment_ui")) {
      codes.push("payment_as_readonly");
    }
    if (labeledReadOnly && honest.class === "mutating") {
      codes.push("mutating_as_readonly");
    }
    if (labeledReadOnly && honest.class === "webhook") {
      codes.push("webhook_as_readonly");
    }
    if (row.probed === true) codes.push("probed_as_cold");
  }

  const unique = [...new Set(codes)];
  const naiveVerdict = naiveLooksAccept(claim) ? "accept" : "reject";
  const honestVerdict = unique.length === 0 ? "accept" : "reject";
  return {
    ok: honestVerdict === "accept",
    claimId: claim.claimId || claim.id || null,
    naiveVerdict,
    honestVerdict,
    codes: unique,
    errors: unique.map((code) => ({
      code,
      path: quotedPath,
      message: `${code} is refused by the read-only SDS route census`,
    })),
  };
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

export function loadInvalidManifest() {
  return loadJson(INVALID_MANIFEST);
}

export function validFixtureDir() {
  return VALID_FIXTURES;
}

export function invalidFixtureDir() {
  return INVALID_FIXTURES;
}

export function seededFailurePath(seed) {
  const spec = SEEDED_FAILURES[seed];
  if (!spec) return null;
  return join(INVALID_FIXTURES, spec.file);
}

export async function evaluateFile(filePath, census) {
  const claim = loadJson(filePath);
  const snapshot = census || (await buildCensus());
  const result = validateClaim({ ...claim, quotedPath: filePath }, snapshot);
  return { ...result, file: filePath };
}

export async function runSuite() {
  const census = await buildCensus();
  const censusOk = census.ok === true;
  const manifest = loadInvalidManifest();
  const invalid = listJsonFiles(INVALID_FIXTURES).map((filePath) => {
    const name = filePath.split("/").pop();
    const expectedCode = manifest[name]?.code;
    const claim = loadJson(filePath);
    const result = validateClaim({ ...claim, quotedPath: filePath }, census);
    const ok = result.ok === false && Boolean(expectedCode) && result.codes.includes(expectedCode);
    return {
      filePath,
      expect: "reject",
      expectedCode,
      ok,
      codes: result.codes,
      result,
    };
  });
  const results = [
    {
      filePath: "(census)",
      expect: "accept",
      ok: censusOk,
      codes: censusOk ? [] : ["census_failed"],
      result: { ok: censusOk },
    },
    ...invalid,
  ];
  const failed = results.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    command: "suite",
    passed: results.length - failed.length,
    failed: failed.length,
    total: results.length,
    censusOk,
    results,
  };
}
