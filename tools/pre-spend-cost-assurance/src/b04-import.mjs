import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { OWNED_DIR, REPO_ROOT } from "./pins.mjs";

const FIXTURE = join(OWNED_DIR, "fixtures/b04-price-arithmetic-verifier/index.mjs");

function candidates() {
  const extra = process.env.NEO_PRICE_ARITHMETIC_VERIFIER;
  return [
    extra,
    join(REPO_ROOT, "../neomorphic-io/packs/price-arithmetic-verifier/src/index.mjs"),
    join(REPO_ROOT, "../../neomorphic-io/packs/price-arithmetic-verifier/src/index.mjs"),
    join(dirname(REPO_ROOT), "neomorphic-io/packs/price-arithmetic-verifier/src/index.mjs"),
    FIXTURE,
  ].filter(Boolean);
}

function looksLikeB04(mod) {
  return typeof mod?.atomicToDecimal === "function" && typeof mod?.decimalToAtomic === "function";
}

/**
 * Load B04 money helpers. Prefer an attached Neo pack; otherwise the fixture.
 */
export async function loadB04Money() {
  const tried = [];
  for (const spec of candidates()) {
    tried.push(spec);
    if (!existsSync(spec)) continue;
    try {
      const mod = await import(pathToFileURL(spec).href);
      if (!looksLikeB04(mod)) continue;
      const attached = spec !== FIXTURE;
      return {
        atomicToDecimal: mod.atomicToDecimal,
        decimalToAtomic: mod.decimalToAtomic,
        findNumberMoney: mod.findNumberMoney,
        moneyScale: mod.moneyScale,
        isCanonicalMoneyString: mod.isCanonicalMoneyString,
        isIntegerString: mod.isIntegerString,
        parseIntegerCount: mod.parseIntegerCount,
        source: spec,
        attached,
        kind: attached ? "attached-neo" : "fixture",
      };
    } catch {
      continue;
    }
  }
  const err = new Error("B04 price-arithmetic-verifier import shape is not available");
  err.code = "b04_import_missing";
  err.tried = tried;
  throw err;
}
