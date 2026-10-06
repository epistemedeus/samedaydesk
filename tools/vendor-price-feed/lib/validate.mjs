import {
  ALLOWED_UNITS,
  LIVE_SDS_SOURCE_MARKERS,
  OBSERVATION_FIELDS,
  PROVENANCE,
} from "./pins.mjs";
import { FeedRefuse } from "./refuse.mjs";

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const EFFECTIVE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isSampleObservation(input) {
  if (!input || typeof input !== "object") return false;
  if (input.sample === true || input.example === true) return true;
  const blob = JSON.stringify(input);
  if (/\bSAMPLE\b/i.test(blob)) return true;
  const url = String(input.sourceUrl || "");
  if (/\/samples\//i.test(url)) return true;
  if (/SAMPLE/i.test(url)) return true;
  return false;
}

export function isLiveSdsPriceSource(sourceUrl) {
  const u = String(sourceUrl || "").toLowerCase();
  if (!u) return false;
  return LIVE_SDS_SOURCE_MARKERS.some((marker) => u.includes(marker.toLowerCase()));
}

export function wantsLiveCatalogWrite(input, flags = {}) {
  if (!input && !flags) return false;
  const obj = input && typeof input === "object" ? input : {};
  return Boolean(
    flags["write-live"] ||
      flags["apply-live"] ||
      flags.writeLive ||
      flags.applyLive ||
      obj.writeLive === true ||
      obj.applyLive === true ||
      obj.mutateLiveCatalog === true ||
      obj.writeLiveCatalog === true,
  );
}

function missingSourceUrl(input) {
  if (!input || typeof input !== "object") return true;
  if (!Object.prototype.hasOwnProperty.call(input, "sourceUrl")) return true;
  if (input.sourceUrl == null) return true;
  if (typeof input.sourceUrl !== "string") return true;
  if (input.sourceUrl.trim() === "") return true;
  return false;
}

function parseHttpOrFileUrl(sourceUrl) {
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new FeedRefuse("missing-source-url", "sourceUrl must be an absolute http(s) or file URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "file:") {
    throw new FeedRefuse("missing-source-url", "sourceUrl must be an http(s) or file URL");
  }
  return parsed;
}

function assertObservedAt(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new FeedRefuse("invalid-observed-at", "observedAt must be an RFC3339 timestamp string");
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new FeedRefuse("invalid-observed-at", "observedAt must be an RFC3339 timestamp string");
  }
}

function assertEffectiveDate(value) {
  if (typeof value !== "string" || !EFFECTIVE_DATE.test(value)) {
    throw new FeedRefuse("invalid-effective-date", "effectiveDate must be YYYY-MM-DD");
  }
}

function assertAmountDecimal(amount) {
  if (typeof amount === "number" || typeof amount === "bigint") {
    throw new FeedRefuse("amount-not-decimal", "amount must be a decimal string, not a float/number");
  }
  if (typeof amount !== "string") {
    throw new FeedRefuse("amount-not-decimal", "amount must be a decimal string");
  }
  if (amount.includes("e") || amount.includes("E") || amount.includes("+")) {
    throw new FeedRefuse("amount-not-decimal", "amount must be a decimal string, not scientific notation");
  }
  if (!DECIMAL.test(amount)) {
    throw new FeedRefuse("amount-not-decimal", "amount must be a decimal string (no float JSON number)");
  }
}

function assertUnit(unit) {
  if (typeof unit !== "string" || !ALLOWED_UNITS.includes(unit)) {
    throw new FeedRefuse(
      "invalid-unit",
      `unit must be one of ${ALLOWED_UNITS.join(", ")} (PR51 vendor-budget pricing units); case-changed units are refused`,
    );
  }
}

function assertProvenance(provenance) {
  if (!PROVENANCE.includes(provenance)) {
    throw new FeedRefuse(
      "invalid-provenance",
      `provenance must be fixture | test | upstream (got ${JSON.stringify(provenance)})`,
    );
  }
}

function assertPriorId(priorObservationId) {
  if (priorObservationId === null) return;
  if (typeof priorObservationId !== "string" || !/^[0-9a-f]{64}$/.test(priorObservationId)) {
    throw new FeedRefuse(
      "invalid-prior-observation",
      "priorObservationId must be null or a 64-char hex digest",
    );
  }
}

/**
 * Shape-check a VendorObservation. Live SDS / SAMPLE / decimal / units
 * are checked in this order so seeded failures map to stable codes.
 *
 * @typedef {{
 *   sourceUrl: string,
 *   observedAt: string,
 *   unit: string,
 *   amount: string,
 *   effectiveDate: string,
 *   priorObservationId: string | null,
 *   provenance: "fixture" | "test" | "upstream",
 * }} VendorObservation
 */
export function validateObservation(input, flags = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new FeedRefuse("invalid-observation", "observation must be a JSON object");
  }

  if (wantsLiveCatalogWrite(input, flags)) {
    throw new FeedRefuse(
      "live-sds-price-mutation",
      "vendor-price-feed cannot change live SDS catalog prices",
    );
  }

  if (missingSourceUrl(input)) {
    throw new FeedRefuse("missing-source-url", "sourceUrl is required");
  }

  parseHttpOrFileUrl(input.sourceUrl);

  if (isLiveSdsPriceSource(input.sourceUrl)) {
    throw new FeedRefuse(
      "live-sds-price-mutation",
      "sourceUrl names a live SDS catalog/offer price; this feed will not ingest or overwrite it",
    );
  }

  if (isSampleObservation(input) && input.provenance === "upstream") {
    throw new FeedRefuse(
      "sample-not-upstream",
      "SAMPLE cannot be provenance upstream",
      { sample: true },
    );
  }

  assertAmountDecimal(input.amount);
  assertUnit(input.unit);
  assertProvenance(input.provenance);
  assertObservedAt(input.observedAt);
  assertEffectiveDate(input.effectiveDate);
  assertPriorId(input.priorObservationId === undefined ? null : input.priorObservationId);

  const extra = Object.keys(input).filter(
    (key) =>
      !OBSERVATION_FIELDS.includes(key) &&
      key !== "sample" &&
      key !== "example" &&
      key !== "writeLive" &&
      key !== "applyLive" &&
      key !== "mutateLiveCatalog" &&
      key !== "writeLiveCatalog",
  );
  if (extra.length) {
    throw new FeedRefuse(
      "unexpected-fields",
      `unexpected observation fields: ${extra.join(", ")}`,
    );
  }

  return {
    sourceUrl: input.sourceUrl,
    observedAt: input.observedAt,
    unit: input.unit,
    amount: input.amount,
    effectiveDate: input.effectiveDate,
    priorObservationId: input.priorObservationId ?? null,
    provenance: input.provenance,
  };
}
