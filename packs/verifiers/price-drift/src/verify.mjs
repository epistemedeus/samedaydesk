import {
  ERROR_CODES,
  LIVE_ASSET,
  LIVE_NETWORK,
  LIVE_PAY_TO,
  LIVE_ROUTES,
  OBSERVATION_SCHEMA,
  PIN_SCHEMA,
  REQUIRED_ROUTE_IDS,
  RESULT_SCHEMA,
} from "./constants.mjs";
import { honestyEnvelope } from "./honesty.mjs";
import {
  assertAmountMatchesAtomic,
  findNumberMoney,
  formatCompactUsdc,
  isPlainObject,
  parseAtomicString,
} from "./money.mjs";
import { extractRouteList, looksLikeSample } from "./normalize.mjs";

export function reject(code, message, extra = {}) {
  return {
    ok: false,
    schema: RESULT_SCHEMA,
    status: "reject",
    code,
    message,
    reasons: extra.reasons ?? [code],
    purchaseAuthority: false,
    rewriteAuthorized: false,
    liveSdsPricesUnchanged: true,
    driftDetected: extra.driftDetected === true,
    honesty: honestyEnvelope(extra.honestyExtra),
    ...strip(extra, ["reasons", "driftDetected", "honestyExtra"]),
  };
}

export function pass(extra = {}) {
  return {
    ok: true,
    schema: RESULT_SCHEMA,
    status: "match",
    code: "match",
    message: extra.message ?? "observation matches recorded SDS live prices",
    reasons: [],
    purchaseAuthority: false,
    rewriteAuthorized: false,
    liveSdsPricesUnchanged: true,
    driftDetected: false,
    honesty: honestyEnvelope(),
    ...extra,
  };
}

function strip(obj, keys) {
  const out = { ...obj };
  for (const key of keys) delete out[key];
  return out;
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

function pinIndex(pin) {
  const routes = extractRouteList(pin);
  const byId = new Map();
  for (const row of routes) {
    if (row.id) byId.set(row.id, row);
  }
  for (const live of Object.values(LIVE_ROUTES)) {
    if (!byId.has(live.id)) {
      byId.set(live.id, {
        id: live.id,
        route: live.route,
        method: live.method,
        amount: live.amount,
        amountAtomic: live.amountAtomic,
        network: LIVE_NETWORK,
        asset: LIVE_ASSET,
        payTo: LIVE_PAY_TO,
        required: live.required,
      });
    } else {
      const existing = byId.get(live.id);
      existing.required = existing.required || live.required;
    }
  }
  return byId;
}

function claimsRewrite(observation, flags) {
  if (observation?.editLivePrices === true) return "editLivePrices is true";
  if (observation?.rewriteAuthorized === true) return "rewriteAuthorized is true";
  if (observation?.catalogWrite === true) return "catalogWrite is true";
  if (Array.isArray(observation?.proposedPrices) && observation.proposedPrices.length > 0) {
    return "proposedPrices is present";
  }
  if (flags?.editPrices === true || flags?.["edit-prices"] === true) return "--edit-prices";
  if (flags?.["sku-write"] === true) return "--sku-write";
  return null;
}

function claimsPayment(observation, flags) {
  if (observation?.purchaseAuthority === true || observation?.purchaseAuthorized === true) {
    return "purchaseAuthority";
  }
  if (observation?.checkout === true || flags?.checkout === true) return "checkout";
  if (observation?.pay === true || flags?.pay === true || flags?.payment === true) return "payment";
  if (observation?.settle === true || flags?.settle === true) return "settle";
  if (observation?.prepare === true || flags?.prepare === true) return "prepare";
  return null;
}

function claimsPublish(observation, flags) {
  if (observation?.publish === true || flags?.publish === true) return "publish";
  if (observation?.deploy === true || flags?.deploy === true) return "deploy";
  return null;
}

function claimsLiveHttp(observation, flags) {
  if (flags?.live === true) return "--live";
  if (typeof observation?.liveUrl === "string" && /^https?:\/\//i.test(observation.liveUrl)) {
    return observation.liveUrl;
  }
  if (observation?.fetchLive === true) return "fetchLive";
  return null;
}

function compareRoute(observed, pinned) {
  const findings = [];
  const path = observed.id || observed.route || "route";
  let observedAtomic;
  try {
    if (observed.amountAtomic == null) {
      findings.push({
        code: ERROR_CODES.MISSING_REQUIRED_ROUTE,
        message: `${path} is missing amountAtomic`,
      });
      return findings;
    }
    if (observed.amount != null) {
      observedAtomic = assertAmountMatchesAtomic(observed.amount, observed.amountAtomic, path);
    } else {
      observedAtomic = parseAtomicString(observed.amountAtomic, `${path}.amountAtomic`);
    }
  } catch (err) {
    findings.push({ code: err.code || ERROR_CODES.NONCANONICAL_MONEY, message: err.message, path: err.path });
    return findings;
  }

  const pinAtomic = parseAtomicString(pinned.amountAtomic, `${pinned.id}.amountAtomic`);
  if (observedAtomic !== pinAtomic) {
    findings.push({
      code: ERROR_CODES.AMOUNT_DRIFT,
      message: `${path} drifted: observed ${formatCompactUsdc(observedAtomic)} atomic ${observedAtomic} vs pin ${pinned.amount} atomic ${pinned.amountAtomic}. Live SDS prices are recorded, not rewritten.`,
      route: pinned.route,
      observedAtomic: observedAtomic.toString(),
      pinAtomic: pinAtomic.toString(),
      observedAmount: formatCompactUsdc(observedAtomic),
      pinAmount: pinned.amount,
    });
  }

  const network = observed.network || LIVE_NETWORK;
  const asset = observed.asset || LIVE_ASSET;
  const payTo = observed.payTo || LIVE_PAY_TO;
  if (network !== (pinned.network || LIVE_NETWORK)) {
    findings.push({
      code: ERROR_CODES.NETWORK_DRIFT,
      message: `${path} network ${JSON.stringify(network)} does not match pin ${pinned.network || LIVE_NETWORK}`,
    });
  }
  if (typeof asset === "string" && asset.toLowerCase() !== (pinned.asset || LIVE_ASSET).toLowerCase()) {
    findings.push({
      code: ERROR_CODES.ASSET_DRIFT,
      message: `${path} asset does not match recorded Base USDC`,
    });
  }
  if (typeof payTo === "string" && payTo.toLowerCase() !== (pinned.payTo || LIVE_PAY_TO).toLowerCase()) {
    findings.push({
      code: ERROR_CODES.PAYTO_DRIFT,
      message: `${path} payTo does not match recorded recipient`,
    });
  }
  return findings;
}

export function verifyDocuments({ pin, observation, flags = {}, paths = {} }) {
  const numberHit = findNumberMoney(pin, ["pin"]) || findNumberMoney(observation, ["observation"]);
  if (numberHit) {
    return reject(ERROR_CODES.FLOAT_MONEY, numberHit.message, { path: numberHit.path });
  }

  if (!isPlainObject(pin)) {
    return reject(ERROR_CODES.INVALID_JSON, "pin must be a JSON object");
  }
  if (!isPlainObject(observation)) {
    return reject(ERROR_CODES.INVALID_JSON, "observation must be a JSON object");
  }

  if (pin.schema && pin.schema !== PIN_SCHEMA) {
    return reject(ERROR_CODES.INVALID_JSON, `pin.schema must be ${PIN_SCHEMA}`);
  }
  if (observation.schema && observation.schema !== OBSERVATION_SCHEMA) {
    return reject(ERROR_CODES.INVALID_JSON, `observation.schema must be ${OBSERVATION_SCHEMA}`);
  }

  const liveHttp = claimsLiveHttp(observation, flags);
  if (liveHttp) {
    return reject(
      ERROR_CODES.LIVE_HTTP_REFUSED,
      `cold run only; live HTTP refused (${liveHttp})`,
    );
  }

  const publish = claimsPublish(observation, flags);
  if (publish) {
    return reject(ERROR_CODES.PUBLISH_ATTEMPTED, `publish refused (${publish})`);
  }

  const payment = claimsPayment(observation, flags);
  if (payment === "purchaseAuthority") {
    return reject(ERROR_CODES.PURCHASE_AUTHORITY, "purchaseAuthority must be false");
  }
  if (payment === "checkout") {
    return reject(ERROR_CODES.CHECKOUT_ATTEMPTED, "checkout is out of bounds for this pack");
  }
  if (payment) {
    return reject(ERROR_CODES.PAYMENT_ATTEMPTED, `payment/settle/prepare refused (${payment})`);
  }

  if (pin.purchaseAuthority === true || pin.rewriteAuthorized === true) {
    return reject(ERROR_CODES.FORBIDDEN_CLAIM, "pin cannot claim purchase or rewrite authority");
  }

  const rewrite = claimsRewrite(observation, flags);
  if (rewrite) {
    return reject(
      ERROR_CODES.EDIT_LIVE_PRICES,
      `live extract $0.005 and seller-integrity-audit $0.01 must not be edited (${rewrite})`,
    );
  }

  if (observation.httpStatus === 200 && observation.success === true && observation.charged !== false) {
    return reject(
      ERROR_CODES.HTTP_402_AS_SUCCESS,
      "HTTP 402 is an unpaid paywall, never success",
    );
  }
  if (observation.http402AsSuccess === true || observation.unpaidAsPaid === true) {
    return reject(ERROR_CODES.HTTP_402_AS_SUCCESS, "HTTP 402 is an unpaid paywall, never success");
  }

  const sample =
    looksLikeSample(observation, paths.observation) || looksLikeSample(pin, paths.pin);
  if (sample && (observation.claimsLiveCatalog === true || observation.sourceKind === "live_catalog")) {
    return reject(
      ERROR_CODES.SAMPLE_AS_LIVE,
      "SAMPLE / labelled fixtures cannot be sold as a live catalog observation",
    );
  }

  const pins = pinIndex(pin);
  const observedRoutes = extractRouteList(observation);
  if (observedRoutes.length === 0) {
    return reject(ERROR_CODES.MISSING_REQUIRED_INPUTS, "observation has no routes");
  }

  const findings = [];
  const compared = [];
  const seenIds = new Set();

  for (const row of observedRoutes) {
    if (!row.id) continue;
    seenIds.add(row.id);
    const pinned = pins.get(row.id);
    if (!pinned) {
      if (row.proposed || row.catalogWrite || observation.newSku === true) {
        findings.push({
          code: ERROR_CODES.EXTRA_SKU,
          message: `unpinned billed SKU ${row.id} ${row.route ?? ""} is a proposed catalog write; this pack does not add SKUs`,
          route: row.route,
        });
      }
      continue;
    }
    const routeFindings = compareRoute(row, pinned);
    findings.push(...routeFindings);
    compared.push({
      id: row.id,
      route: pinned.route,
      pinAmount: pinned.amount,
      pinAtomic: pinned.amountAtomic,
      observedAtomic: row.amountAtomic,
      match: routeFindings.length === 0,
    });
  }

  for (const requiredId of REQUIRED_ROUTE_IDS) {
    if (!seenIds.has(requiredId)) {
      const live = LIVE_ROUTES[requiredId];
      findings.push({
        code: ERROR_CODES.MISSING_REQUIRED_ROUTE,
        message: `required live route ${live.route} (${live.amount} USDC) is missing from the observation`,
        route: live.route,
      });
    }
  }

  let blobHasWrongUnits = false;
  walkStrings(observation, (s) => {
    if (/5000 dollars|\$5000|5000 USD\b/i.test(s)) blobHasWrongUnits = true;
  });
  if (blobHasWrongUnits) {
    findings.push({
      code: ERROR_CODES.WRONG_UNITS,
      message: "atomic 5000 is 0.005 USDC, not 5000 dollars",
    });
  }

  if (findings.length > 0) {
    const primary = findings[0];
    const drift = findings.some((f) =>
      [
        ERROR_CODES.AMOUNT_DRIFT,
        ERROR_CODES.NETWORK_DRIFT,
        ERROR_CODES.ASSET_DRIFT,
        ERROR_CODES.PAYTO_DRIFT,
        ERROR_CODES.MISSING_REQUIRED_ROUTE,
        ERROR_CODES.EXTRA_SKU,
      ].includes(f.code),
    );
    return reject(primary.code, primary.message, {
      reasons: findings.map((f) => f.code),
      findings,
      compared,
      driftDetected: drift,
    });
  }

  return pass({
    compared,
    requiredRoutesPresent: REQUIRED_ROUTE_IDS.slice(),
    charged: false,
    httpStatus: observation.httpStatus ?? 402,
    message: "observation matches recorded SDS live prices; pack did not rewrite catalog",
  });
}
