import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadCatalog as loadBuyerCatalogDefault,
  loadRuntime as loadBuyerRuntimeDefault,
} from "../../buyer-runtimes/lib.mjs";
import {
  BUYER_CATALOG_REL,
  BUYER_STOP_REL,
  CATALOG_REL,
  DISCOVERY_REL,
  OFFER_MATRIX_REL,
  REPO_ROOT,
} from "./pins.mjs";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function createAdapters(repoRoot = REPO_ROOT) {
  return {
    repoRoot,
    loadBuyerCatalog: () => loadBuyerCatalogDefault(),
    loadBuyerRuntime: (name) => loadBuyerRuntimeDefault(name),
    readUsefulJobsCatalog: () => readJson(join(repoRoot, CATALOG_REL)),
    readDiscovery: () => readJson(join(repoRoot, DISCOVERY_REL)),
    readOfferMatrix: () => readJson(join(repoRoot, OFFER_MATRIX_REL)),
    readBuyerStop: () => readJson(join(repoRoot, BUYER_STOP_REL)),
    readBuyerCatalogFile: () => readJson(join(repoRoot, BUYER_CATALOG_REL)),
  };
}

export function loadHonestyInputs(adapters = createAdapters()) {
  const usefulCatalog = adapters.readUsefulJobsCatalog();
  const discovery = adapters.readDiscovery();
  const buyerCatalog = adapters.loadBuyerCatalog();
  const agent402 = adapters.loadBuyerRuntime("agent402");
  const coinbase = adapters.loadBuyerRuntime("coinbase-x402");
  const offerMatrix = adapters.readOfferMatrix();
  const stop = agent402.states.stop;
  const coinbaseStop = coinbase.states.stop;

  const purchaseAuthority = usefulCatalog?.runtime?.purchaseAuthority;
  const discoveryAuthority = discovery?.purchaseAuthority;
  if (purchaseAuthority !== false || discoveryAuthority !== false) {
    throw new Error("useful-jobs catalog/discovery must pin purchaseAuthority false");
  }

  const mustNotRun = uniqueStrings([...(stop.mustNotRun || []), ...(coinbaseStop.mustNotRun || [])]);
  const paidExtract = (offerMatrix.offers || []).find((offer) => offer.id === "sdd.paid_html_extract");

  return {
    usefulCatalog,
    discovery,
    buyerCatalog,
    agent402,
    coinbase,
    stop,
    coinbaseStop,
    offerMatrix,
    paidExtract,
    mustNotRun,
    purchaseAuthority: false,
    laterBindings: {
      buyerRuntimes: "tools/buyer-runtimes/lib.mjs loadRuntime/loadCatalog (SDS main)",
      offerRouting: OFFER_MATRIX_REL,
      i01HashTerms: "Neo PR54 hashTermsVersion; integer F01 termsVersion refused",
      f08: "not imported; paid retry wrap of useful-jobs is refused here",
      f18: "contrast fixture only; no live GET",
      sds52:
        "read-only SDS PR52 aeef964fa188443078958d9d6d393afae1d542ee; D01 owns server/paid-useful-jobs; wrapper not imported",
    },
  };
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
