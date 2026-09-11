import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE_PRICES } from "./constants.ts";
import { LIVE_PAYMENT_SURFACE_IMMUTABLE } from "./failures.ts";
import { PACK_ROOT, SDS_PRICING, SDS_VERIFIED_FEED } from "./paths.ts";

export function refusePriceChange(attempt: Record<string, unknown>): {
  ok: false;
  rejected: true;
  failure: typeof LIVE_PAYMENT_SURFACE_IMMUTABLE;
} {
  void attempt;
  return { ok: false, rejected: true, failure: LIVE_PAYMENT_SURFACE_IMMUTABLE };
}

export function refusePaymentFnReassignment(attempt: {
  verifyPayment?: unknown;
  settlePayment?: unknown;
}): {
  ok: false;
  rejected: true;
  failure: typeof LIVE_PAYMENT_SURFACE_IMMUTABLE;
} {
  void attempt;
  return { ok: false, rejected: true, failure: LIVE_PAYMENT_SURFACE_IMMUTABLE };
}

export function readSdsLivePrices(): {
  extract: { display: string; amountAtomic: string; network: string; asset: string };
  "seller-integrity-audit": {
    display: string;
    amountAtomic: string;
    network: string;
    asset: string;
  };
} {
  const feed = JSON.parse(readFileSync(SDS_VERIFIED_FEED, "utf8"));
  const extract = feed.routes.find((row: { route: string }) => row.route === "/extract");
  const audit = feed.routes.find(
    (row: { route: string }) => row.route === "/commerce/seller-integrity-audit",
  );
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

export function assertLivePricesUnchanged(): {
  ok: true;
  extract: string;
  sellerIntegrityAudit: string;
} {
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

export function scanPackSourceForPaymentReassignment(): {
  ok: true;
  verifyPaymentReassigned: false;
  settlePaymentReassigned: false;
  files: string[];
} {
  const srcDir = join(PACK_ROOT, "src");
  const files = readdirSync(srcDir).filter((name) => name.endsWith(".ts"));
  const hits: string[] = [];
  for (const name of files) {
    const text = readFileSync(join(srcDir, name), "utf8");
    if (/\bverifyPayment\s*=/.test(text) || /\bsettlePayment\s*=/.test(text)) {
      hits.push(name);
    }
  }
  if (hits.length > 0) {
    throw new Error(`pack source reassigns payment functions in ${hits.join(", ")}`);
  }
  return {
    ok: true,
    verifyPaymentReassigned: false,
    settlePaymentReassigned: false,
    files,
  };
}
