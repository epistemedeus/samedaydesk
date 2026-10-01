// Read-only seller-repair journey for two ordinary catalog callers.
// The useful result is the brief's maintenance scope. This module does not
// write the handoff, mutate the catalog, or start a checkout.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  JOURNEY_SCHEMA,
  OPERATION_ID,
  ORDINARY_CALLERS,
  RECEIVING_JOB,
  RECEIVING_PRIOR_HEAD,
  RECEIVING_PRIOR_JOB,
} from "./handoff.mjs";
import { CATALOG_PATHS, catalogFileDigest } from "./seller-repair-cold.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const briefsPath = resolve(repoRoot, "client/src/data/sellerRepairBriefs.ts");

export { JOURNEY_SCHEMA, RECEIVING_JOB, RECEIVING_PRIOR_HEAD, RECEIVING_PRIOR_JOB };

export const SEEDED_JOURNEY_REQUESTS = [
  { error: "unknown_finding", request: { findingId: "not-a-catalog-id" } },
  { error: "second_wallet_refused", request: { findingId: ORDINARY_CALLERS[0].findingId, wallet: "create" } },
  { error: "echo_header_refused", request: { findingId: ORDINARY_CALLERS[0].findingId, echoHeader: true } },
  { error: "disposable_only_refused", request: { findingId: ORDINARY_CALLERS[1].findingId, disposableOnly: true } },
  { error: "disposable_finding_refused", request: { findingId: "mcp.unknownTool" } },
];

function catalogWorktreeClean() {
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", ...CATALOG_PATHS], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch (err) {
    if (err.status === 1) return false;
    throw err;
  }
}

function unquote(value) {
  return JSON.parse(`"${value}"`);
}

function stringsIn(body) {
  const items = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let match = re.exec(body);
  while (match) {
    items.push(unquote(match[1]));
    match = re.exec(body);
  }
  return items;
}

function sliceBetween(chunk, startKey, endKey) {
  const start = chunk.indexOf(startKey);
  if (start < 0) return "";
  const end = chunk.indexOf(endKey, start + startKey.length);
  if (end < 0) return "";
  return chunk.slice(start + startKey.length, end);
}

function oneField(chunk, key) {
  const match = chunk.match(new RegExp(`\\n    ${key}: "((?:\\\\.|[^"\\\\])*)"`));
  return match ? unquote(match[1]) : null;
}

function briefChunks(source) {
  const start = source.indexOf("export const sellerRepairBriefs");
  const end = source.indexOf("] satisfies");
  if (start < 0 || end < start) throw new Error("seller-repair briefs marker missing");
  const body = source.slice(start, end);
  const chunks = [];
  let depth = 0;
  let begin = -1;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '"') {
      i += 1;
      while (i < body.length && body[i] !== '"') {
        if (body[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === "{") {
      if (depth === 0) begin = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && begin >= 0) {
        chunks.push(body.slice(begin, i + 1));
        begin = -1;
      }
    }
  }
  return chunks;
}

export function loadSellerRepairBriefs(source = readFileSync(briefsPath, "utf8")) {
  const list = briefChunks(source).map((chunk) => {
    const summary = stringsIn(sliceBetween(chunk, "summary:", "\n    observedContract:"));
    const requiredContract = stringsIn(sliceBetween(chunk, "requiredContract:", "\n    scope:"));
    const scope = stringsIn(sliceBetween(chunk, "\n    scope:", "\n    boundaries:"));
    const boundaries = stringsIn(sliceBetween(chunk, "\n    boundaries:", "\n    evidence:"));
    const brief = {
      id: oneField(chunk, "id"),
      seller: oneField(chunk, "seller"),
      origin: oneField(chunk, "origin"),
      route: oneField(chunk, "route"),
      method: oneField(chunk, "method"),
      routeClass: oneField(chunk, "routeClass"),
      summary: summary.join(""),
      requiredContract,
      scope,
      boundaries,
    };
    if (!brief.id || !brief.seller || !brief.route || !brief.method || !brief.routeClass) {
      throw new Error("seller-repair brief field missing");
    }
    if (!brief.summary || brief.requiredContract.length < 1 || brief.scope.length < 1 || brief.boundaries.length < 1) {
      throw new Error(`seller-repair brief ${brief.id} has no maintenance scope`);
    }
    return brief;
  });
  if (list.length !== 10) throw new Error(`seller-repair brief count ${list.length}`);
  return new Map(list.map((brief) => [brief.id, brief]));
}

function wantsSecondWallet(request) {
  if (!request || typeof request !== "object") return false;
  if (request.secondWallet === true) return true;
  if (typeof request.wallet === "string" && request.wallet.length > 0 && request.wallet !== "none") return true;
  if (typeof request.paymentLink === "string" && request.paymentLink.length > 0) return true;
  if (typeof request.findingId === "string" && request.findingId.startsWith("plink_")) return true;
  return false;
}

function wantsEchoHeader(request) {
  if (request.echoHeader === true) return true;
  if (request.resultKind === "echo-header" || request.resultKind === "protocol-header") return true;
  return typeof request.header === "string" && request.header.includes("MCP-Protocol-Version");
}

function wantsDisposableOnly(request) {
  if (request.disposableOnly === true) return true;
  if (request.target === "disposable-loopback") return true;
  return request.resultKind === "disposable";
}

export function evaluateJourneyRequest(request, briefs) {
  const findingId = typeof request?.findingId === "string" ? request.findingId : "";
  if (wantsSecondWallet(request)) {
    return { ok: false, error: "second_wallet_refused", useful: false, exit: 1 };
  }
  if (wantsEchoHeader(request)) {
    return { ok: false, error: "echo_header_refused", useful: false, exit: 1 };
  }
  if (wantsDisposableOnly(request)) {
    return { ok: false, error: "disposable_only_refused", useful: false, exit: 1 };
  }
  if (findingId === "mcp.unknownTool") {
    return { ok: false, error: "disposable_finding_refused", useful: false, exit: 1 };
  }
  const brief = briefs.get(findingId);
  if (!brief) return { ok: false, error: "unknown_finding", useful: false, exit: 1 };
  return {
    ok: true,
    exit: 0,
    caller: {
      role: "ordinary",
      findingId: brief.id,
      routeClass: brief.routeClass,
      seller: brief.seller,
      method: brief.method,
      route: brief.route,
      useful: true,
      resultKind: "maintenance-scope",
      echoHeader: false,
      disposableOnly: false,
      secondWallet: false,
      wallet: "none",
      checkoutUrl: null,
      maintenance: {
        summary: brief.summary,
        requiredContract: brief.requiredContract,
        scope: brief.scope,
        boundaries: brief.boundaries,
      },
    },
  };
}

export function seededJourneyRejections(briefs = loadSellerRepairBriefs()) {
  return SEEDED_JOURNEY_REQUESTS.map((row) => {
    const verdict = evaluateJourneyRequest(row.request, briefs);
    return {
      id: row.error,
      expectsExit: 1,
      rejected: verdict.ok === false && verdict.error === row.error && verdict.useful === false,
    };
  });
}

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen(server.address().port));
  });
}

function close(server) {
  return new Promise((resolveClose, reject) => {
    server.close((err) => (err ? reject(err) : resolveClose()));
    server.closeAllConnections();
  });
}

async function postFinding(port, findingId) {
  const response = await fetch(`http://127.0.0.1:${port}/api/checkout/seller-repair-session`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ finding_id: findingId }),
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const redirected = response.status >= 300 && response.status < 400;
  const url = typeof body?.url === "string" ? body.url : null;
  return {
    sent: true,
    httpStatus: response.status,
    error: body && typeof body.error === "string" ? body.error : null,
    url: redirected ? "redirect" : url,
    withheld: null,
  };
}

function checkoutForCaller(probe) {
  if (probe.url) throw new Error("seller-repair journey received a checkout url");
  return {
    sent: probe.sent,
    httpStatus: probe.httpStatus,
    error: probe.error,
    url: null,
    withheld: probe.withheld,
  };
}

function callerMatchesPin(caller, pin) {
  return caller.findingId === pin.findingId
    && caller.routeClass === pin.routeClass
    && caller.seller === pin.seller
    && caller.method === pin.method
    && caller.route === pin.route
    && caller.maintenance.requiredContract[0] === pin.requiredFirst
    && caller.maintenance.scope[0] === pin.scopeFirst;
}

export async function observeSellerRepairJourney() {
  const digestBefore = catalogFileDigest();
  const briefs = loadSellerRepairBriefs();
  const [{ sellerRepairFindingIds, sellerRepairFindingRouteClasses }, { isStripeConfigured }, { default: checkoutRouter }] = await Promise.all([
    import("../../../server/lib/pulse.js"),
    import("../../../server/lib/stripe.js"),
    import("../../../server/routes/checkout.js"),
  ]);
  const catalogIds = [...sellerRepairFindingIds];
  if (catalogIds.length !== briefs.size) throw new Error("seller-repair catalog count drifted");
  for (const id of catalogIds) {
    const brief = briefs.get(id);
    if (!brief) throw new Error(`seller-repair catalog id ${id} missing from briefs`);
    if (brief.routeClass !== sellerRepairFindingRouteClasses[id]) {
      throw new Error(`seller-repair route class drifted for ${id}`);
    }
  }
  for (const pin of ORDINARY_CALLERS) {
    const brief = briefs.get(pin.findingId);
    if (!brief || brief.routeClass !== pin.routeClass || brief.requiredContract[0] !== pin.requiredFirst || brief.scope[0] !== pin.scopeFirst) {
      throw new Error(`ordinary caller ${pin.findingId} does not match the catalog brief`);
    }
  }
  const seeded = seededJourneyRejections(briefs);
  if (seeded.some((row) => row.rejected !== true)) {
    throw new Error("seller-repair journey accepted a seeded rejection");
  }

  const stripeConfigured = isStripeConfigured();
  const probes = new Map();
  if (stripeConfigured) {
    for (const pin of ORDINARY_CALLERS) {
      probes.set(pin.findingId, {
        sent: false,
        httpStatus: null,
        error: null,
        url: null,
        withheld: "stripe_configured",
      });
    }
  } else {
    const app = express();
    app.use(express.json());
    app.use("/api/checkout", checkoutRouter);
    const server = http.createServer(app);
    const port = await listen(server);
    try {
      for (const pin of ORDINARY_CALLERS) {
        probes.set(pin.findingId, await postFinding(port, pin.findingId));
      }
    } finally {
      await close(server);
    }
  }

  const callers = ORDINARY_CALLERS.map((pin) => {
    const verdict = evaluateJourneyRequest({ findingId: pin.findingId }, briefs);
    if (!verdict.ok) throw new Error(`ordinary caller ${pin.findingId} ${verdict.error}`);
    const caller = {
      ...verdict.caller,
      checkout: checkoutForCaller(probes.get(pin.findingId)),
    };
    if (!callerMatchesPin(caller, pin)) throw new Error(`ordinary caller ${pin.findingId} pin mismatch`);
    if (caller.checkout.url !== null || caller.checkoutUrl !== null) {
      throw new Error("ordinary caller gained a checkout url");
    }
    const maintenanceText = JSON.stringify(caller.maintenance);
    if (maintenanceText.includes("https://") || maintenanceText.includes("http://") || maintenanceText.includes("plink_")) {
      throw new Error(`ordinary caller ${pin.findingId} maintenance includes a url`);
    }
    return caller;
  });

  const digestAfter = catalogFileDigest();
  const catalogUntouched = digestBefore === digestAfter && catalogWorktreeClean();
  const catalogSha256 = createHash("sha256").update([...catalogIds].sort().join("\n")).digest("hex");
  return {
    schema: JOURNEY_SCHEMA,
    job: RECEIVING_JOB,
    operationId: OPERATION_ID,
    priorJob: RECEIVING_PRIOR_JOB,
    priorHead: RECEIVING_PRIOR_HEAD,
    coldClientWritesHandoff: true,
    listenerWritesHandoff: false,
    stripeConfigured,
    catalogCount: catalogIds.length,
    catalogSha256,
    catalogFileSha256: digestAfter,
    catalogUntouched,
    catalogMutated: !catalogUntouched,
    secondWallet: false,
    disposableOnly: false,
    callers,
    seededRejections: seeded.map((row) => ({ id: row.id, expectsExit: row.expectsExit })),
  };
}
