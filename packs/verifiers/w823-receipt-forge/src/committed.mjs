import { readFileSync } from "node:fs";
import {
  COMMITTED,
  EXTRACT_AMOUNT,
  KNOWN_SETTLEMENT,
  SDS_PIN,
} from "./constants.mjs";
import { committedPath, findRepoRoot } from "./paths.mjs";

function error(code, path, message) {
  return { code, path, message };
}

function addr(value) {
  return String(value || "").toLowerCase();
}

function acceptMatchesPin(accept, path, errors) {
  if (!accept || typeof accept !== "object") {
    errors.push(error("pin_mismatch", path, "missing committed accept"));
    return;
  }
  if (accept.scheme !== SDS_PIN.scheme) {
    errors.push(error("pin_mismatch", `${path}.scheme`, "scheme is not the SDS pin"));
  }
  if (accept.network !== SDS_PIN.network) {
    errors.push(error("pin_mismatch", `${path}.network`, "network is not the SDS pin"));
  }
  if (String(accept.amount) !== EXTRACT_AMOUNT) {
    errors.push(
      error(
        "pin_mismatch",
        `${path}.amount`,
        `extract amount is ${accept.amount}, pin is ${EXTRACT_AMOUNT}`,
      ),
    );
  }
  if (addr(accept.asset) !== addr(SDS_PIN.asset)) {
    errors.push(error("pin_mismatch", `${path}.asset`, "asset is not the SDS pin"));
  }
  if (addr(accept.payTo) !== addr(SDS_PIN.payTo)) {
    errors.push(error("pin_mismatch", `${path}.payTo`, "payTo is not the SDS pin"));
  }
}

function loadJson(rel, repoRoot, errors) {
  const filePath = committedPath(rel, repoRoot);
  try {
    return { filePath, value: JSON.parse(readFileSync(filePath, "utf8")) };
  } catch (cause) {
    errors.push(error("committed_missing", rel, `cannot read committed SDS artifact: ${cause.message}`));
    return { filePath, value: null };
  }
}

export function pinCommittedArtifacts(repoRoot = findRepoRoot()) {
  const errors = [];
  const files = {};

  const catalog = loadJson(COMMITTED.x402Catalog, repoRoot, errors);
  files.x402Catalog = catalog.filePath;
  const items = Array.isArray(catalog.value?.items) ? catalog.value.items : [];
  const extract = items.find((item) => item?.resource?.routeTemplate === "/extract");
  if (!extract) {
    errors.push(error("committed_missing", COMMITTED.x402Catalog, "GET /extract row is absent"));
  } else {
    acceptMatchesPin(extract.accepts?.[0], "x402.items[/extract].accepts[0]", errors);
    if (extract.request?.method !== "GET") {
      errors.push(error("pin_mismatch", "x402.items[/extract].request.method", "extract method is not GET"));
    }
  }

  const observation = loadJson(COMMITTED.extractObservation, repoRoot, errors);
  files.extractObservation = observation.filePath;
  if (observation.value) {
    if (observation.value.route !== "/extract") {
      errors.push(error("pin_mismatch", "extract-current.route", "observation route is not /extract"));
    }
    if (observation.value.status !== 402) {
      errors.push(
        error(
          "not_unpaid",
          "extract-current.status",
          `observation status is ${observation.value.status}, expected 402`,
        ),
      );
    }
    acceptMatchesPin(observation.value.body?.accepts?.[0], "extract-current.body.accepts[0]", errors);
    const headers = observation.value.headers && typeof observation.value.headers === "object"
      ? observation.value.headers
      : {};
    for (const name of Object.keys(headers)) {
      if (/^(PAYMENT-SIGNATURE|X-PAYMENT|PAYMENT-RESPONSE)$/i.test(name)) {
        errors.push(
          error(
            "payment_header_forge",
            `extract-current.headers.${name}`,
            "committed unpaid extract observation carries a payment header",
          ),
        );
      }
    }
  }

  const settlement = loadJson(COMMITTED.settlement, repoRoot, errors);
  files.settlement = settlement.filePath;
  const row = settlement.value?.settlement;
  if (!row) {
    errors.push(error("committed_missing", COMMITTED.settlement, "settlement object is absent"));
  } else {
    if (String(row.transaction).toLowerCase() !== KNOWN_SETTLEMENT.transaction.toLowerCase()) {
      errors.push(
        error(
          "pin_mismatch",
          "settlement.transaction",
          "committed settlement tx is not the SDS pin",
        ),
      );
    }
    if (row.operationId !== KNOWN_SETTLEMENT.operationId) {
      errors.push(error("pin_mismatch", "settlement.operationId", "operationId is not the SDS pin"));
    }
    if (row.amountUsdc !== KNOWN_SETTLEMENT.amountUsdc) {
      errors.push(error("pin_mismatch", "settlement.amountUsdc", "amountUsdc is not the SDS pin"));
    }
    const surface = String(settlement.value.producer?.observedSurface || "");
    if (!surface.includes(KNOWN_SETTLEMENT.boundRoute)) {
      errors.push(
        error(
          "copied_settlement",
          "settlement.producer.observedSurface",
          "known tx is not bound to /commerce/seller-integrity-audit",
        ),
      );
    }
  }

  const stop = loadJson(COMMITTED.buyerStop, repoRoot, errors);
  files.buyerStop = stop.filePath;
  if (stop.value) {
    if (stop.value.state !== "stop") {
      errors.push(error("not_unpaid", "buyer-stop.state", "buyer runtime is not a stop"));
    }
    const mustNotRun = Array.isArray(stop.value.mustNotRun) ? stop.value.mustNotRun : [];
    if (!mustNotRun.some((item) => String(item).includes("facilitator") && String(item).includes("settle"))) {
      errors.push(
        error(
          "money_movement_refused",
          "buyer-stop.mustNotRun",
          "buyer stop does not refuse facilitator settle",
        ),
      );
    }
    if (stop.value.reason !== "no wallet") {
      errors.push(error("pin_mismatch", "buyer-stop.reason", "buyer stop reason is not no wallet"));
    }
  }

  return {
    ok: errors.length === 0,
    live: false,
    paymentSent: false,
    extractAmount: EXTRACT_AMOUNT,
    payTo: SDS_PIN.payTo,
    settlementTransaction: KNOWN_SETTLEMENT.transaction,
    boundRoute: KNOWN_SETTLEMENT.boundRoute,
    files,
    errors,
  };
}
