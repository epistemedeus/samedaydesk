import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { atomicToCapString } from "./money-display.mjs";
import { loadB04Money } from "./b04-import.mjs";
import { honestyEnvelope } from "./honesty.mjs";
import {
  ERROR_CODES,
  JOURNEY_CAP,
  LIVE_ASSET,
  LIVE_NETWORK,
  LIVE_PAY_TO,
  LIVE_ROUTES,
  MAX_INPUT_BYTES,
  PAYMENT_POST_HINTS,
  SAMPLE_MARKERS,
  RESULT_SCHEMA,
  SETTLE_PREPARE_NAMES,
  USDC_DECIMALS,
} from "./pins.mjs";

export function reject(code, message, extra = {}) {
  return {
    ok: false,
    status: "reject",
    schema: RESULT_SCHEMA,
    code,
    message,
    purchaseAuthorized: false,
    settleCalled: false,
    prepareCalled: false,
    honesty: honestyEnvelope(),
    ...extra,
  };
}

export function refuseSettle(reason = "this assignment never calls settle") {
  return reject(ERROR_CODES.SETTLE_REFUSED, `settle refused: ${reason}`);
}

export function refusePrepare(reason = "this assignment never calls prepare") {
  return reject(ERROR_CODES.PREPARE_REFUSED, `prepare refused: ${reason}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function walkStrings(input, visit) {
  if (typeof input === "string") {
    visit(input);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) walkStrings(item, visit);
    return;
  }
  if (!isPlainObject(input)) return;
  for (const value of Object.values(input)) walkStrings(value, visit);
}

function textBlob(plan) {
  const parts = [];
  walkStrings(plan, (s) => parts.push(s));
  return parts.join("\n");
}

function hasSampleMarker(plan) {
  const blob = textBlob(plan);
  if (SAMPLE_MARKERS.some((m) => blob.includes(m))) return true;
  if (plan.sample === true || plan.example === true || plan.kind === "SAMPLE") return true;
  if (typeof plan.label === "string" && SAMPLE_MARKERS.some((m) => plan.label.includes(m))) return true;
  return false;
}

function claimsPaidAssurance(plan) {
  return (
    plan.paid === true ||
    plan.assured === true ||
    plan.paidAssurance === true ||
    plan.success === true ||
    plan.sold === true ||
    plan.treatedAsPaid === true
  );
}

function spendDefaulting(plan) {
  return (
    plan.purchaseAuthorized === true ||
    plan.purchaseAuthority === true ||
    plan.autoPay === true ||
    plan.autoPurchase === true ||
    plan.defaultPurchase === true ||
    plan.spendByDefault === true ||
    plan.purchase === true ||
    plan.approvePayment === true ||
    (plan.purchaseAuthorized === undefined &&
      plan.purchaseAuthority === undefined &&
      (plan.default === "purchase" || plan.action === "purchase" || plan.intent === "purchase"))
  );
}

function resolveRoute(line) {
  const keys = [line.tool, line.id, line.route, line.name, line.slug].filter((v) => typeof v === "string");
  for (const key of keys) {
    const lower = key.trim();
    for (const route of Object.values(LIVE_ROUTES)) {
      if (route.aliases.some((alias) => alias.toLowerCase() === lower.toLowerCase())) {
        return route;
      }
    }
  }
  return null;
}

function lineUnitLooksLikeDollars(line) {
  const unit = String(line.unit ?? line.unitKind ?? line.denomination ?? "").toLowerCase();
  return (
    unit === "dollars" ||
    unit === "usd-dollars" ||
    unit === "dollar" ||
    line.unitIsDollars === true ||
    line.treatAtomicAsDollars === true
  );
}

function integerLike(value) {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

function collectLines(plan) {
  if (Array.isArray(plan.lines)) return plan.lines;
  if (Array.isArray(plan.routes)) return plan.routes;
  if (Array.isArray(plan.tools)) return plan.tools;
  return [];
}

function looksLikePaymentPost(plan) {
  if (plan.callSettle === true || plan.callPrepare === true || plan.postPayment === true) return true;
  const actions = [
    ...(Array.isArray(plan.actions) ? plan.actions : []),
    ...(Array.isArray(plan.calls) ? plan.calls : []),
  ];
  for (const action of actions) {
    if (!isPlainObject(action) && typeof action !== "string") continue;
    const method = String(isPlainObject(action) ? action.method ?? "" : "").toUpperCase();
    const path = String(isPlainObject(action) ? action.path ?? action.url ?? action.name ?? "" : action);
    const name = String(isPlainObject(action) ? action.call ?? action.name ?? "" : action);
    if (SETTLE_PREPARE_NAMES.some((n) => name === n || path.endsWith(n))) return true;
    if (method === "POST" && PAYMENT_POST_HINTS.some((h) => path.toLowerCase().includes(h.replace(/^\//, "")))) {
      return true;
    }
    if (method === "POST" && /settle|prepare|pay/.test(path.toLowerCase())) return true;
  }
  const blob = textBlob(plan).toLowerCase();
  if (plan.method === "POST" && PAYMENT_POST_HINTS.some((h) => blob.includes(h.toLowerCase()))) return true;
  return false;
}

function invalidDeliverySpend(plan) {
  const delivery = plan.priorDelivery ?? plan.delivery ?? plan.lastDelivery;
  if (!isPlainObject(delivery)) return false;
  const status = String(delivery.status ?? delivery.state ?? "").toLowerCase();
  const invalid = ["invalid", "failed", "incomplete", "error", "rejected", "undelivered"].includes(status);
  if (!invalid) return false;
  return (
    plan.retrySpend === true ||
    plan.spendBecauseInvalid === true ||
    plan.repurchase === true ||
    plan.reason === "invalid-delivery" ||
    delivery.spendToRetry === true
  );
}

function treats402AsSuccess(plan) {
  const nodes = [plan, ...collectLines(plan)];
  for (const node of nodes) {
    if (!isPlainObject(node)) continue;
    const status = node.httpStatus ?? node.statusCode ?? node.status;
    const is402 = status === 402 || status === "402";
    if (!is402) continue;
    if (
      node.success === true ||
      node.paid === true ||
      node.assured === true ||
      node.treat402AsSuccess === true ||
      node.outcome === "success" ||
      node.paidAssurance === true
    ) {
      return true;
    }
  }
  return false;
}

function proposesLivePriceEdit(plan) {
  if (plan.editLivePrices === true || plan.changeLivePrice === true) return true;
  const proposed = plan.proposedPrices ?? plan.priceEdits ?? [];
  const rows = Array.isArray(proposed) ? proposed : [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const route = resolveRoute(row);
    if (!route) continue;
    const amount = String(row.amount ?? row.price ?? "");
    const atomic = String(row.amountAtomic ?? "");
    if (amount && amount !== route.amount) return true;
    if (atomic && atomic !== route.amountAtomic) return true;
  }
  for (const line of collectLines(plan)) {
    if (!isPlainObject(line)) continue;
    const route = resolveRoute(line);
    if (!route) continue;
    if (line.amountAtomic != null && String(line.amountAtomic) !== route.amountAtomic) {
      if (!lineUnitLooksLikeDollars(line)) return true;
    }
    if (typeof line.amount === "string" && line.amount.includes(".") && line.amount !== route.amount) {
      const unit = String(line.unit ?? line.currency ?? "").toUpperCase();
      if (unit === "USDC" || unit === "USD" || line.currency === "USDC") return true;
    }
  }
  return false;
}

function wrongAtomicAsDollars(plan) {
  for (const line of collectLines(plan)) {
    if (!isPlainObject(line)) continue;
    const route = resolveRoute(line);
    const atomicPin = route?.amountAtomic;
    if (lineUnitLooksLikeDollars(line)) {
      const candidate = String(line.amount ?? line.amountUsd ?? line.amountAtomic ?? "");
      if (atomicPin && candidate === atomicPin) return true;
      if (candidate === "5000" || candidate === "10000") return true;
    }
    const amount = line.amount ?? line.amountUsd;
    const currency = String(line.currency ?? plan.currency ?? "").toUpperCase();
    if (integerLike(amount) && (currency === "USD" || currency === "USDC") && !line.amountAtomic) {
      if (amount === "5000" || amount === "10000" || (atomicPin && amount === atomicPin)) return true;
    }
  }
  if (plan.costCap === "5000" || plan.costCap === "10000" || plan.costCap === "15000") return true;
  if (plan.cap === "5000" || plan.cap === "15000") return true;
  return false;
}

function requiredToolsAndAccounts(lines) {
  const tools = [];
  const seen = new Set();
  for (const line of lines) {
    const route = resolveRoute(line) ?? {
      id: String(line.tool ?? line.id ?? "unknown"),
      route: String(line.route ?? ""),
    };
    if (seen.has(route.id)) continue;
    seen.add(route.id);
    tools.push({
      id: route.id,
      route: route.route,
      amountAtomic: route.amountAtomic ?? String(line.amountAtomic ?? ""),
      amount: route.amount,
      paid: false,
      httpStatus: 402,
      note: "unpaid amount; 402 is not success",
    });
  }
  return {
    tools,
    accounts: [
      {
        id: "base-usdc-wallet",
        network: LIVE_NETWORK,
        asset: "USDC",
        assetAddress: LIVE_ASSET,
        present: "unknown",
        requiredToSpend: true,
        used: false,
        note: "Listed only. This assignment does not open a wallet or authorize a transfer.",
      },
      {
        id: "x402-facilitator",
        role: "verify/settle",
        called: false,
        note: "Listed only. settle/prepare are refused.",
      },
      {
        id: "x402-http-client",
        role: "unpaid GET that observes 402 PAYMENT-REQUIRED",
        present: "unknown",
      },
    ],
    payTo: LIVE_PAY_TO,
    network: LIVE_NETWORK,
  };
}

function loadJsonFile(filePath) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    const err = new Error(`cannot read ${filePath}`);
    err.code = ERROR_CODES.MISSING_REQUIRED_INPUTS;
    throw err;
  }
  if (stat.size > MAX_INPUT_BYTES) {
    const err = new Error("input exceeds 1 MiB");
    err.code = ERROR_CODES.INVALID_JSON;
    throw err;
  }
  const raw = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error(`invalid JSON: ${filePath}`);
    err.code = ERROR_CODES.INVALID_JSON;
    throw err;
  }
}

export function resolvePlanPath(planArg, cwd = process.cwd()) {
  if (!planArg) return null;
  return isAbsolute(planArg) ? planArg : join(cwd, planArg);
}

export async function assurePlan(plan, { b04 } = {}) {
  const money = b04 ?? (await loadB04Money());
  if (!isPlainObject(plan)) {
    return reject(ERROR_CODES.INVALID_JSON, "plan must be a JSON object");
  }

  const floatHit = money.findNumberMoney?.(plan);
  if (floatHit) {
    return reject(ERROR_CODES.FLOAT_MONEY, floatHit.message, { path: floatHit.path });
  }

  if (hasSampleMarker(plan) && claimsPaidAssurance(plan)) {
    return reject(
      ERROR_CODES.SAMPLE_AS_PAID_ASSURANCE,
      "SAMPLE / labelled fixtures are not paid assurance",
    );
  }

  if (spendDefaulting(plan)) {
    return reject(
      ERROR_CODES.DEFAULT_PURCHASE,
      "purchase is not defaulted; purchaseAuthorized is always false in this assignment",
    );
  }

  if (treats402AsSuccess(plan)) {
    return reject(
      ERROR_CODES.HTTP_402_AS_SUCCESS,
      "HTTP 402 is an unpaid paywall, not success or paid delivery",
    );
  }

  if (looksLikePaymentPost(plan)) {
    return reject(
      ERROR_CODES.POST_PAYMENT,
      "plan would POST payment; settle/prepare are refused",
    );
  }

  if (invalidDeliverySpend(plan)) {
    return reject(
      ERROR_CODES.INVALID_DELIVERY_SPEND,
      "invalid delivery is not a reason to spend",
    );
  }

  if (wrongAtomicAsDollars(plan)) {
    return reject(
      ERROR_CODES.WRONG_UNITS,
      "atomic 5000 is 0.005 USDC, not 5000 dollars",
    );
  }

  if (proposesLivePriceEdit(plan)) {
    return reject(
      ERROR_CODES.EDIT_LIVE_PRICES,
      "live extract $0.005 and seller-integrity-audit $0.01 must not be edited",
    );
  }

  const lines = collectLines(plan);
  if (!lines.length) {
    return reject(ERROR_CODES.MISSING_REQUIRED_INPUTS, "plan must name at least one tool/route line");
  }

  let capAtomic = 0n;
  const priced = [];
  for (const line of lines) {
    if (!isPlainObject(line)) {
      return reject(ERROR_CODES.INVALID_JSON, "each plan line must be an object");
    }
    const route = resolveRoute(line);
    if (!route) {
      return reject(
        ERROR_CODES.MISSING_REQUIRED_INPUTS,
        `unknown tool/route ${String(line.tool ?? line.route ?? "")}; this assignment names extract and seller-integrity-audit`,
      );
    }
    const atomicRaw = line.amountAtomic ?? route.amountAtomic;
    let atomic;
    try {
      atomic = money.parseIntegerCount ? money.parseIntegerCount(atomicRaw, `${route.id}.amountAtomic`) : BigInt(String(atomicRaw));
    } catch (err) {
      return reject(err.code ?? ERROR_CODES.WRONG_UNITS, err.message);
    }
    if (String(atomic) !== route.amountAtomic) {
      return reject(
        ERROR_CODES.EDIT_LIVE_PRICES,
        `${route.id} amountAtomic ${String(atomic)} does not match live pin ${route.amountAtomic}`,
      );
    }
    const display = atomicToCapString(money.atomicToDecimal, atomic, USDC_DECIMALS);
    if (display !== route.amount) {
      return reject(
        ERROR_CODES.WRONG_UNITS,
        `${route.id} atomic ${route.amountAtomic} must display as ${route.amount} USDC`,
      );
    }
    capAtomic += atomic;
    priced.push({
      id: route.id,
      route: route.route,
      amountAtomic: route.amountAtomic,
      amount: route.amount,
      currency: "USDC",
      network: LIVE_NETWORK,
      paid: false,
      httpStatus: 402,
    });
  }

  const costCap = atomicToCapString(money.atomicToDecimal, capAtomic, USDC_DECIMALS);
  const required = requiredToolsAndAccounts(lines);

  return {
    ok: true,
    status: "assured",
    schema: RESULT_SCHEMA,
    purchaseAuthorized: false,
    costCap,
    capAtomic: capAtomic.toString(),
    currency: "USDC",
    network: LIVE_NETWORK,
    decimals: USDC_DECIMALS,
    lines: priced,
    required,
    b04: { kind: money.kind, attached: money.attached },
    settleCalled: false,
    prepareCalled: false,
    honesty: honestyEnvelope({
      b04Source: money.kind,
    }),
  };
}

export async function assurePlanFile(planPath, options) {
  const plan = loadJsonFile(planPath);
  return assurePlan(plan, options);
}

export async function runJourney(fixture, { cwd = process.cwd(), b04 } = {}) {
  if (!isPlainObject(fixture)) {
    return reject(ERROR_CODES.INVALID_JSON, "journey fixture must be a JSON object");
  }
  const planRef = fixture.plan ?? fixture.okPlan;
  const postRef = fixture.postPaymentPlan ?? fixture.rejectPlan ?? fixture.postPayment;
  if (!planRef || !postRef) {
    return reject(
      ERROR_CODES.MISSING_REQUIRED_INPUTS,
      "journey fixture needs plan and postPaymentPlan",
    );
  }
  const base = fixture._baseDir ?? cwd;
  const planPath = resolvePlanPath(planRef, base);
  const postPath = resolvePlanPath(postRef, base);
  const money = b04 ?? (await loadB04Money());
  const assurance = await assurePlanFile(planPath, { b04: money });
  const postPayment = await assurePlanFile(postPath, { b04: money });

  if (!assurance.ok) {
    return {
      ...assurance,
      command: "journey",
      postPayment,
    };
  }
  if (assurance.costCap !== JOURNEY_CAP) {
    return reject(
      ERROR_CODES.WRONG_UNITS,
      `journey cap must be ${JOURNEY_CAP} USDC, got ${assurance.costCap}`,
      { assurance, postPayment },
    );
  }
  if (assurance.purchaseAuthorized !== false) {
    return reject(ERROR_CODES.DEFAULT_PURCHASE, "journey must keep purchaseAuthorized false");
  }
  if (postPayment.ok || postPayment.code !== ERROR_CODES.POST_PAYMENT) {
    return reject(
      ERROR_CODES.POST_PAYMENT,
      "journey requires the POST-payment plan to be rejected",
      { assurance, postPayment },
    );
  }

  return {
    ok: true,
    status: "journey",
    schema: RESULT_SCHEMA,
    command: "journey",
    purchaseAuthorized: false,
    costCap: assurance.costCap,
    capAtomic: assurance.capAtomic,
    currency: "USDC",
    network: LIVE_NETWORK,
    required: assurance.required,
    lines: assurance.lines,
    postPayment,
    settleCalled: false,
    prepareCalled: false,
    honesty: honestyEnvelope({ b04Source: money.kind }),
  };
}

export async function runJourneyFile(fixturePath, options) {
  const fixture = loadJsonFile(fixturePath);
  fixture._baseDir = dirname(fixturePath);
  return runJourney(fixture, { ...options, cwd: dirname(fixturePath) });
}
