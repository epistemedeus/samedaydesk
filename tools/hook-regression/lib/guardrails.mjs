import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BIN_DIR, H4_OWNED_DIR, LIB_DIR, SDS_PRICING, SDS_VERIFIED_FEED } from "./paths.mjs";
import { LIVE_PRICES } from "./rules.mjs";
import {
  CHANGE_LIVE_PRICES,
  EDIT_H4_DIRECTORY,
  INSTALL_LIVE_HOOKS,
} from "./failures.mjs";

const LIVE_HOOK_CALL = /\b(?:registerIndexingPayloadContinuity|installIndexingPayloadContinuity)\s*\(/;
const HOOK_INSTALL = /\.onBefore(?:Verify|Settle)\s*\(/;
const PAYMENT_REASSIGN = /\b(?:verifyPayment|settlePayment)\s*=/;

export function refuseInstallLiveHooks(attempt = {}) {
  void attempt;
  return { ok: false, rejected: true, failure: INSTALL_LIVE_HOOKS };
}

export function refusePriceChange(attempt = {}) {
  void attempt;
  return { ok: false, rejected: true, failure: CHANGE_LIVE_PRICES };
}

export function refusePaymentFnReassignment(attempt = {}) {
  void attempt;
  return { ok: false, rejected: true, failure: CHANGE_LIVE_PRICES };
}

export function refuseH4Edit(attempt = {}) {
  const path = String(attempt.path || attempt.file || "");
  const action = String(attempt.action || "write");
  const touchesH4 =
    path.includes("h4-precise-repairs") || path.includes(H4_OWNED_DIR);
  const mutating = !["read", "import", "stat"].includes(action);
  if (touchesH4 && mutating) {
    return { ok: false, rejected: true, failure: EDIT_H4_DIRECTORY };
  }
  if (attempt.attempt === "edit-h4-directory") {
    return { ok: false, rejected: true, failure: EDIT_H4_DIRECTORY };
  }
  return { ok: false, rejected: true, failure: EDIT_H4_DIRECTORY };
}

export function readSdsLivePrices() {
  const feed = JSON.parse(readFileSync(SDS_VERIFIED_FEED, "utf8"));
  const extract = feed.routes.find((row) => row.route === "/extract");
  const audit = feed.routes.find((row) => row.route === "/commerce/seller-integrity-audit");
  return {
    extract: {
      display: String(extract.price.display),
      amountAtomic: String(extract.price.amount),
      network: String(extract.network),
      asset: String(extract.price.asset),
    },
    "seller-integrity-audit": {
      display: String(audit.price.display),
      amountAtomic: String(audit.price.amount),
      network: String(audit.network),
      asset: String(audit.price.asset),
    },
  };
}

export function assertLivePricesUnchanged() {
  const live = readSdsLivePrices();
  if (live.extract.amountAtomic !== LIVE_PRICES.extract.amountAtomic) {
    throw new Error("SDS extract atomic amount drifted from pin");
  }
  if (live["seller-integrity-audit"].amountAtomic !== LIVE_PRICES["seller-integrity-audit"].amountAtomic) {
    throw new Error("SDS seller-integrity-audit atomic amount drifted from pin");
  }
  if (!String(live.extract.display).includes("0.005")) {
    throw new Error("SDS extract display is not 0.005 USDC");
  }
  if (!String(live["seller-integrity-audit"].display).includes("0.01")) {
    throw new Error("SDS seller-integrity-audit display is not 0.01 USDC");
  }
  const pricing = readFileSync(SDS_PRICING, "utf8");
  if (!pricing.includes("seller_contract_repair")) {
    throw new Error("SDS pricing.js missing seller_contract_repair (read-only check)");
  }
  return {
    ok: true,
    extract: LIVE_PRICES.extract.display,
    sellerIntegrityAudit: LIVE_PRICES["seller-integrity-audit"].display,
  };
}

function scanDir(dir) {
  return readdirSync(dir).filter((name) => name.endsWith(".mjs"));
}

export function scanPackSourceForForbiddenLiveWork() {
  const files = [
    ...scanDir(LIB_DIR).map((name) => join(LIB_DIR, name)),
    ...scanDir(BIN_DIR).map((name) => join(BIN_DIR, name)),
  ];
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (LIVE_HOOK_CALL.test(text) || HOOK_INSTALL.test(text) || PAYMENT_REASSIGN.test(text)) {
      hits.push(file);
    }
  }
  if (hits.length > 0) {
    throw new Error(`pack source installs live hooks or reassigns payment functions in ${hits.join(", ")}`);
  }
  return {
    ok: true,
    installLiveHooks: false,
    verifyPaymentReassigned: false,
    settlePaymentReassigned: false,
    files,
  };
}

export function scanPackDoesNotEditH4() {
  const files = [
    ...scanDir(LIB_DIR).map((name) => join(LIB_DIR, name)),
    ...scanDir(BIN_DIR).map((name) => join(BIN_DIR, name)),
  ];
  const writeHits = [];
  const writeToH4 = /writeFileSync\([^)]*h4-precise-repairs|unlinkSync\([^)]*h4-precise-repairs/;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (writeToH4.test(text)) writeHits.push(file);
  }
  if (writeHits.length > 0) {
    throw new Error(`pack source writes H4 directory from ${writeHits.join(", ")}`);
  }
  return { ok: true, editedH4: false, ownedDir: H4_OWNED_DIR };
}
