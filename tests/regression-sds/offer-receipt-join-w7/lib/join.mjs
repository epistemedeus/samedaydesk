/**
 * Join an SDS catalog/402 accept (offer) to an unsigned offer-receipt payload
 * on exact keys. A join is an observation that both sides declared the same
 * key values. It is not settlement, demand, or a paid retry.
 */
import {
  EXACT_JOIN_KEYS,
  EXTRACT_DIGEST,
  INVENTED_FIELDS,
  JOIN_SCHEMA,
  LIVE_PAYLOAD_KEYS,
  PRINCIPLE,
} from "./pin.mjs";
import { assertSdsPin, loadCatalogOffer, originPathname } from "./catalog.mjs";
import { scanMoneyMovement } from "./refuse.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addrKey(value) {
  const s = String(value || "");
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? s.toLowerCase() : s;
}

function objectKeyPaths(value, prefix = "") {
  const out = [];
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      out.push(...objectKeyPaths(item, prefix ? `${prefix}.${index}` : String(index)));
    });
    return out;
  }
  for (const key of Object.keys(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(path);
    out.push(...objectKeyPaths(value[key], path));
  }
  return out;
}

export function offerReceiptBlock(receipt) {
  if (!isPlainObject(receipt)) return null;
  if (isPlainObject(receipt.offerReceipt)) return receipt.offerReceipt;
  const ext = receipt.extensions?.["offer-receipt"]?.info;
  if (isPlainObject(ext)) return ext;
  if (isPlainObject(receipt.extensions?.["offer-receipt"])) return receipt.extensions["offer-receipt"];
  return null;
}

export function receiptPayload(receipt) {
  const block = offerReceiptBlock(receipt);
  const offers = Array.isArray(block?.offers) ? block.offers : [];
  const first = offers[0];
  if (first?.payload && isPlainObject(first.payload)) return first.payload;
  if (isPlainObject(receipt?.payload)) return receipt.payload;
  return null;
}

function settlementPresent(receipt) {
  const block = offerReceiptBlock(receipt);
  if (block?.receipt && typeof block.receipt === "object") return true;
  if (receipt?.settlement && typeof receipt.settlement === "object") return true;
  if (typeof receipt?.transactionHash === "string" && receipt.transactionHash.startsWith("0x")) {
    return true;
  }
  return false;
}

function inventedFields(payload) {
  if (!payload) return [];
  const keys = Object.keys(payload);
  const extra = keys.filter((key) => !LIVE_PAYLOAD_KEYS.includes(key));
  const named = INVENTED_FIELDS.filter(
    (name) => Object.hasOwn(payload, name) || objectKeyPaths(payload).some((p) => p.split(".").pop() === name),
  );
  return [...new Set([...extra, ...named])];
}

function normalizeOffer(raw) {
  if (!isPlainObject(raw)) return null;
  const accept = Array.isArray(raw.accepts) ? raw.accepts[0] : raw;
  const resourceUrl = raw.resourceUrl || raw.resource?.url || accept?.resourceUrl || "";
  const amount = accept?.amount ?? raw.amount;
  return {
    source: raw.source || "fixture",
    routeTemplate: raw.routeTemplate || raw.resource?.routeTemplate || null,
    resourceUrl,
    originPathname: originPathname(resourceUrl),
    scheme: accept?.scheme ?? raw.scheme ?? null,
    network: accept?.network ?? raw.network ?? null,
    asset: accept?.asset ?? raw.asset ?? null,
    amount: amount == null ? null : amount,
    payTo: accept?.payTo ?? raw.payTo ?? null,
  };
}

function loadOffer(caseDoc) {
  const overlay = caseDoc.offer ? normalizeOffer(caseDoc.offer) : null;
  if (typeof caseDoc.offerFromCatalog === "string") {
    const catalog = loadCatalogOffer(caseDoc.offerFromCatalog);
    if (!catalog) return overlay;
    return overlay
      ? {
          ...catalog,
          ...Object.fromEntries(
            Object.entries(overlay).filter(([, v]) => v != null && v !== ""),
          ),
          source: catalog.source,
          routeTemplate: catalog.routeTemplate,
        }
      : catalog;
  }
  return overlay;
}

function comparableAmount(value) {
  if (typeof value === "number") return { ok: false, reason: "amount_not_atomic_string", text: String(value) };
  if (typeof value !== "string") return { ok: false, reason: "amount_missing", text: null };
  if (!/^[1-9][0-9]{0,20}$/.test(value)) {
    return { ok: false, reason: "amount_not_atomic_string", text: value };
  }
  return { ok: true, reason: null, text: value };
}

/**
 * @param {object} caseDoc
 * @returns {{ ok: boolean, joined: boolean, reasons: string[], detail: object }}
 */
export function joinOfferReceipt(caseDoc) {
  const reasons = [];
  const claims = isPlainObject(caseDoc.claims) ? caseDoc.claims : {};
  const money = scanMoneyMovement(caseDoc);
  for (const hit of money) {
    if (!reasons.includes("money_movement_refused")) reasons.push("money_movement_refused");
    reasons.push(`${hit.code}:${hit.path}`);
  }

  const offer = loadOffer(caseDoc);
  const receipt = isPlainObject(caseDoc.receipt) ? caseDoc.receipt : {};
  const payload = receiptPayload(receipt);
  const httpStatus = caseDoc.httpStatus ?? receipt.httpStatus ?? 402;

  if (typeof caseDoc.offerFromCatalog === "string") {
    const catalog = loadCatalogOffer(caseDoc.offerFromCatalog);
    const pinErrors = assertSdsPin(catalog);
    if (!catalog) reasons.push(`catalog_route_missing:${caseDoc.offerFromCatalog}`);
    for (const err of pinErrors) reasons.push(`catalog_pin_mismatch:${err}`);
    if (catalog && offer) {
      for (const key of ["amount", "network", "asset", "scheme", "payTo"]) {
        if (key === "payTo" || key === "asset") {
          if (addrKey(catalog[key]) !== addrKey(offer[key])) {
            reasons.push(`catalog_pin_mismatch:${key}`);
          }
        } else if (String(catalog[key]) !== String(offer[key])) {
          reasons.push(`catalog_pin_mismatch:${key}`);
        }
      }
    }
  }

  if (httpStatus !== 402 && httpStatus != null) {
    reasons.push(`unpaid_402_required:http=${httpStatus}`);
  }
  if (receipt.statusClass && receipt.statusClass !== "unpaid") {
    reasons.push("paid_as_unpaid");
  }
  if (claims.treatOfferAsSettlement === true || claims.independentlySettled === true) {
    reasons.push("offer_as_settlement");
  }
  if (claims.http402IsDelivery === true) {
    reasons.push("http_402_is_delivery");
  }
  if (settlementPresent(receipt)) {
    reasons.push("offer_as_settlement");
    reasons.push("paid_as_unpaid");
  }
  if (!payload) {
    reasons.push("offer_receipt_payload_missing");
  }

  const invented = inventedFields(payload);
  if (invented.length) {
    reasons.push(`invented_receipt_field:${invented.join(",")}`);
  }

  const offerRoute = offer?.originPathname || originPathname(offer?.resourceUrl || "");
  const receiptRoute = originPathname(payload?.resourceUrl || receipt.resource || "");
  const amountOffer = comparableAmount(offer?.amount);
  const amountReceipt = payload ? comparableAmount(payload.amount) : { ok: false, reason: "amount_missing", text: null };

  const exact = {
    origin_pathname: {
      left: offerRoute || null,
      right: receiptRoute || null,
      match: Boolean(offerRoute && receiptRoute && offerRoute === receiptRoute),
    },
    amount: {
      left: amountOffer.text,
      right: amountReceipt.text,
      match: Boolean(amountOffer.ok && amountReceipt.ok && amountOffer.text === amountReceipt.text),
    },
    network: {
      left: offer?.network ?? null,
      right: payload?.network ?? null,
      match: Boolean(offer?.network && payload?.network && offer.network === payload.network),
    },
    asset: {
      left: offer?.asset ?? null,
      right: payload?.asset ?? null,
      match: Boolean(offer?.asset && payload?.asset && addrKey(offer.asset) === addrKey(payload.asset)),
    },
    scheme: {
      left: offer?.scheme ?? null,
      right: payload?.scheme ?? null,
      match: Boolean(offer?.scheme && payload?.scheme && offer.scheme === payload.scheme),
    },
    payTo: {
      left: offer?.payTo ?? null,
      right: payload?.payTo ?? null,
      match: Boolean(offer?.payTo && payload?.payTo && addrKey(offer.payTo) === addrKey(payload.payTo)),
    },
  };

  const presentKeys = EXACT_JOIN_KEYS.filter((key) => exact[key].left && exact[key].right);
  if (presentKeys.length === 0 && !reasons.includes("offer_receipt_payload_missing")) {
    reasons.push("join_without_exact_key");
  }

  if (payload && offer) {
    for (const key of EXACT_JOIN_KEYS) {
      if (!exact[key].left || !exact[key].right) {
        reasons.push(`join_key_missing:${key}`);
      }
    }
    if (exact.origin_pathname.left && exact.origin_pathname.right && !exact.origin_pathname.match) {
      reasons.push(
        `join_key_mismatch:left=${exact.origin_pathname.left},right=${exact.origin_pathname.right}`,
      );
    }
    if (!amountOffer.ok && offer.amount != null) reasons.push(amountOffer.reason);
    if (!amountReceipt.ok && payload.amount != null) reasons.push(amountReceipt.reason);
    if (amountOffer.text != null && amountReceipt.text != null && !exact.amount.match) {
      reasons.push(`amount_mismatch:offer=${amountOffer.text},receipt=${amountReceipt.text}`);
    }
    if (exact.network.left && exact.network.right && !exact.network.match) {
      reasons.push(`network_mismatch:offer=${exact.network.left},receipt=${exact.network.right}`);
    }
    if (exact.asset.left && exact.asset.right && !exact.asset.match) {
      reasons.push(`asset_mismatch`);
    }
    if (exact.scheme.left && exact.scheme.right && !exact.scheme.match) {
      reasons.push(`scheme_mismatch`);
    }
    if (exact.payTo.left && exact.payTo.right && !exact.payTo.match) {
      reasons.push(`payto_mismatch`);
    }
  }

  if (claims.amountUnitConverted === true) {
    reasons.push("unit_conversion");
  }
  if (typeof payload?.amount === "string" && payload.amount.includes(".")) {
    reasons.push("unit_conversion");
    if (!reasons.some((r) => r.startsWith("amount_mismatch")) && offer?.amount != null) {
      reasons.push(`amount_mismatch:offer=${offer.amount},receipt=${payload.amount}`);
    }
  }

  const mismatchReasons = reasons.filter(
    (r) =>
      r.startsWith("amount_mismatch") ||
      r.startsWith("join_key_mismatch") ||
      r.startsWith("join_key_missing") ||
      r.startsWith("network_mismatch") ||
      r.startsWith("asset_mismatch") ||
      r.startsWith("scheme_mismatch") ||
      r === "payto_mismatch" ||
      r === "join_without_exact_key" ||
      r === "unit_conversion" ||
      r === "amount_not_atomic_string",
  );
  const mismatch = mismatchReasons.length > 0;
  if (mismatch && !reasons.includes("seeded_mismatch") && caseDoc.seededMismatch) {
    reasons.unshift("seeded_mismatch");
  }

  const moneyBlocked = reasons.includes("money_movement_refused");
  const joinable =
    !moneyBlocked &&
    Boolean(payload && offer) &&
    EXACT_JOIN_KEYS.every((key) => exact[key].match) &&
    !mismatch &&
    !reasons.includes("offer_as_settlement") &&
    !reasons.includes("paid_as_unpaid") &&
    !reasons.some((r) => r.startsWith("invented_receipt_field")) &&
    !reasons.some((r) => r.startsWith("catalog_pin_mismatch")) &&
    !reasons.includes("offer_receipt_payload_missing") &&
    (httpStatus === 402 || httpStatus == null);

  const unique = [...new Set(reasons)];
  if (joinable && !unique.includes("exact_key_join")) unique.unshift("exact_key_join");

  return {
    schema: JOIN_SCHEMA,
    id: caseDoc.id ?? null,
    ok: joinable,
    joined: joinable,
    reject: !joinable,
    mismatch,
    reasons: unique,
    independentlySettled: false,
    paid: false,
    live: false,
    principle: PRINCIPLE,
    extractDigest: EXTRACT_DIGEST,
    exact,
    presentKeys,
    payloadKeys: payload ? Object.keys(payload) : [],
    offer: offer
      ? {
          source: offer.source,
          routeTemplate: offer.routeTemplate,
          originPathname: offer.originPathname,
          amount: amountOffer.text,
          network: offer.network,
          asset: offer.asset,
          scheme: offer.scheme,
          payTo: offer.payTo,
        }
      : null,
    httpStatus,
  };
}

export function evaluateCase(caseDoc) {
  return joinOfferReceipt(caseDoc);
}

export { originPathname };
