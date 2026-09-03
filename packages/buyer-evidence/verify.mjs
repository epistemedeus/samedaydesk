import { evmAddr } from "./lib.mjs";

/** Named `reasons[]` entries returned by {@link verify}. */
export const REASONS = Object.freeze({
  FOREIGN_PAY_TO: "foreign_payTo",
  CHANGED_PRICE: "changed_price",
  STALE_TIMESTAMP: "stale_timestamp",
  MISSING_ACCEPTS: "missing_accepts",
});

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function timestampToMs(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && value.trim() !== "") {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * @param {unknown} evidence
 * @returns {object}
 */
function pinFromEvidence(evidence) {
  const rec = asRecord(evidence) || {};
  const contract = asRecord(rec.contract) || rec;
  const route = asRecord(rec.route) || {};
  const extra = asRecord(contract.extra) || {};
  return {
    scheme: contract.scheme,
    network: contract.network,
    payTo: contract.payTo,
    asset: contract.asset,
    amount: contract.amount,
    maxAmountRequired: contract.maxAmountRequired,
    priceUsd: contract.priceUsd,
    decimals: Number(contract.decimals ?? 6),
    extraName: extra.name,
    extraVersion: extra.version,
    origin: route.origin,
    path: route.path,
    now: rec.now,
    maxAgeSeconds: rec.maxAgeSeconds,
  };
}

/**
 * @param {Record<string, unknown>} fields
 * @returns {Record<string, unknown>}
 */
function flattenRequired(fields) {
  const out = { extra: {} };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "extra.name") out.extra.name = value;
    else if (key === "extra.version") out.extra.version = value;
    else if (!key.includes(".")) out[key] = value;
  }
  return out;
}

/**
 * @param {Record<string, unknown>} rec
 * @returns {Record<string, unknown>[]}
 */
function collectCandidates(rec) {
  const out = [];
  if (Array.isArray(rec.accepts)) {
    for (const item of rec.accepts) {
      const row = asRecord(item);
      if (row) out.push(row);
    }
  }
  const contract = asRecord(rec.contract);
  if (contract) out.push(contract);
  const mustReceive = asRecord(rec.mustReceive);
  if (mustReceive) out.push(mustReceive);
  const required = asRecord(rec.requiredFields);
  if (required) out.push(flattenRequired(required));
  const accepts0 = asRecord(rec.accepts0);
  if (accepts0) out.push(accepts0);
  const observed = asRecord(rec.observed);
  if (observed) out.push(...collectCandidates(observed));
  if (Array.isArray(rec.surfaces)) {
    for (const surface of rec.surfaces) {
      const row = asRecord(surface);
      if (row) out.push(...collectCandidates(row));
    }
  }
  const byNetwork = asRecord(rec.payToByNetwork);
  if (byNetwork) {
    for (const [network, payTo] of Object.entries(byNetwork)) {
      out.push({ network, payTo });
    }
  }
  const extract = asRecord(rec.extract);
  if (extract) {
    out.push({
      priceUsd: extract.price,
      route: extract.route,
      method: extract.method,
    });
  }
  const first = asRecord(rec.firstResult);
  if (first) {
    const payTos = Array.isArray(first.bazaarPayTos) ? first.bazaarPayTos : [];
    if (payTos.length) {
      for (const payTo of payTos) out.push({ payTo, priceUsd: first.priceUsd, route: first.route });
    } else {
      out.push({ priceUsd: first.priceUsd, route: first.route });
    }
  }
  const price = asRecord(rec.price);
  const x402 = asRecord(rec.x402);
  if (price && price.amount != null) {
    out.push({ priceUsd: Number(price.amount), ...(x402 || {}) });
  }
  if (rec.payTo != null || rec.amount != null || rec.maxAmountRequired != null) {
    if (!out.includes(rec)) out.push(rec);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} rec
 * @returns {boolean}
 */
function isBarePaymentRequired(rec) {
  if (typeof rec.state === "string") return false;
  if (asRecord(rec.contract) && asRecord(rec.route)) return false;
  return "accepts" in rec || "x402Version" in rec || rec.resource != null;
}

/**
 * @param {Record<string, unknown>} rec
 * @returns {boolean}
 */
function hasAccepts(rec) {
  return Array.isArray(rec.accepts) && rec.accepts.length > 0;
}

/**
 * @param {unknown} candidate
 * @param {object} pin
 * @returns {boolean | null}
 */
function priceMatches(candidate, pin) {
  const rec = asRecord(candidate);
  if (!rec) return null;
  const hasAmount = rec.amount != null && rec.amount !== "";
  const hasMax = rec.maxAmountRequired != null && rec.maxAmountRequired !== "";
  const hasUsd = rec.priceUsd != null && rec.priceUsd !== "";
  if (!hasAmount && !hasMax && !hasUsd) return null;

  if (hasAmount && pin.amount != null && String(rec.amount) === String(pin.amount)) return true;
  if (hasMax && pin.maxAmountRequired != null && String(rec.maxAmountRequired) === String(pin.maxAmountRequired)) {
    return true;
  }
  if (hasUsd && pin.priceUsd != null && Number(rec.priceUsd) === Number(pin.priceUsd)) return true;
  if (hasAmount && pin.priceUsd != null) {
    const atomic = Number(rec.amount);
    const expected = Math.round(Number(pin.priceUsd) * 10 ** Number(pin.decimals ?? 6));
    if (Number.isFinite(atomic) && atomic === expected) return true;
  }
  if (hasMax && pin.priceUsd != null) {
    const atomic = Number(rec.maxAmountRequired);
    const expected = Math.round(Number(pin.priceUsd) * 10 ** Number(pin.decimals ?? 6));
    if (Number.isFinite(atomic) && atomic === expected) return true;
  }
  if (hasUsd && pin.amount != null) {
    const expected = Number(rec.priceUsd) * 10 ** Number(pin.decimals ?? 6);
    if (Number.isFinite(expected) && Math.round(expected) === Number(pin.amount)) return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown>} rec
 * @param {number} now
 * @param {number | null} maxAgeSeconds
 * @param {string[]} reasons
 */
function collectStaleReasons(rec, now, maxAgeSeconds, reasons) {
  /** @type {number[]} */
  const expiries = [];
  /** @type {number[]} */
  const written = [];

  const take = (value, kind) => {
    const ms = timestampToMs(value);
    if (ms == null) return;
    if (kind === "expiry") expiries.push(ms);
    else written.push(ms);
  };

  take(rec.validUntil, "expiry");
  take(rec.lastUpdated, "written");
  take(rec.timestamp, "written");
  take(rec.retrievedAt, "written");

  if (Array.isArray(rec.accepts)) {
    for (const item of rec.accepts) {
      const row = asRecord(item);
      if (row) take(row.validUntil, "expiry");
    }
  }
  if (Array.isArray(rec.items)) {
    take(rec.lastUpdated, "written");
    for (const item of rec.items) {
      const row = asRecord(item);
      if (!row) continue;
      take(row.lastUpdated, "written");
      if (Array.isArray(row.accepts)) {
        for (const accept of row.accepts) {
          const a = asRecord(accept);
          if (a) take(a.validUntil, "expiry");
        }
      }
    }
  }

  let stale = expiries.some((ms) => now > ms);
  if (maxAgeSeconds != null && Number.isFinite(maxAgeSeconds) && maxAgeSeconds >= 0) {
    stale = stale || written.some((ms) => now - ms > maxAgeSeconds * 1000);
  }
  if (stale && !reasons.includes(REASONS.STALE_TIMESTAMP)) {
    reasons.push(REASONS.STALE_TIMESTAMP);
  }
}

/**
 * Compare a 402 body, discovery row, or replay fixture to published evidence.
 *
 * `evidence` is the catalog document from {@link loadCatalog}, optionally with
 * `now` (unix ms) and `maxAgeSeconds` for freshness.
 *
 * Named reasons: `foreign_payTo`, `changed_price`, `stale_timestamp`,
 * `missing_accepts`. Several may be returned together.
 *
 * @param {unknown} resource
 * @param {unknown} evidence
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function verify(resource, evidence) {
  /** @type {string[]} */
  const reasons = [];
  const rec = asRecord(resource);
  if (!rec) {
    return { ok: false, reasons: [REASONS.MISSING_ACCEPTS] };
  }

  const pin = pinFromEvidence(evidence);
  const now = timestampToMs(pin.now) ?? Date.now();
  const maxAgeRaw = pin.maxAgeSeconds;
  const maxAgeSeconds =
    maxAgeRaw == null || maxAgeRaw === ""
      ? null
      : Number(maxAgeRaw);

  collectStaleReasons(rec, now, Number.isFinite(maxAgeSeconds) ? maxAgeSeconds : null, reasons);

  if (rec.state === "construct") {
    return { ok: reasons.length === 0, reasons };
  }
  if (rec.state === "stop") {
    return { ok: reasons.length === 0, reasons };
  }

  if (isBarePaymentRequired(rec) && !hasAccepts(rec)) {
    reasons.push(REASONS.MISSING_ACCEPTS);
    return { ok: false, reasons };
  }

  const candidates = collectCandidates(rec);
  const payTos = candidates.map((row) => row.payTo).filter((value) => value != null && value !== "");
  if (payTos.length && pin.payTo) {
    const expected = evmAddr(pin.payTo);
    if (!payTos.some((value) => evmAddr(value) === expected)) {
      reasons.push(REASONS.FOREIGN_PAY_TO);
    }
  }

  const networks = candidates.map((row) => row.network).filter((value) => value != null && value !== "");
  if (networks.length && pin.network) {
    if (!networks.some((value) => String(value) === String(pin.network))) {
      if (!reasons.includes(REASONS.FOREIGN_PAY_TO)) reasons.push(REASONS.FOREIGN_PAY_TO);
    }
  }

  const assets = candidates.map((row) => row.asset).filter((value) => value != null && value !== "");
  if (assets.length && pin.asset) {
    const expectedAsset = evmAddr(pin.asset);
    if (!assets.some((value) => evmAddr(value) === expectedAsset)) {
      if (!reasons.includes(REASONS.FOREIGN_PAY_TO)) reasons.push(REASONS.FOREIGN_PAY_TO);
    }
  }

  const priceRows = candidates.filter((row) => priceMatches(row, pin) !== null);
  if (priceRows.length && !priceRows.some((row) => priceMatches(row, pin) === true)) {
    reasons.push(REASONS.CHANGED_PRICE);
  }

  return { ok: reasons.length === 0, reasons };
}
