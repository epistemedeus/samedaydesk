import {
  EXPECTED_ROUTES,
  KNOWN_STALE_LISTINGS,
  PIN,
  UNIQUE_AMOUNTS,
} from "./pin.mjs";
import {
  atomicToDisplay,
  hostOf,
  indexRows,
  listingsFromBazaar,
  loadBazaar,
  loadCatalog,
  loadOpenApi,
  paidOperationsFromOpenApi,
  routeKey,
  rowsFromX402,
  uniqueAmountsFromRows,
} from "./catalog.mjs";

function finding(code, path, message, extra = {}) {
  return { code, path, message, ...extra };
}

export function expectedIndex() {
  const byKey = new Map();
  for (const row of EXPECTED_ROUTES) {
    byKey.set(routeKey(row.method, row.route), row);
  }
  return byKey;
}

export function compareToPin(observedRows) {
  const findings = [];
  const expected = expectedIndex();
  const observed = indexRows(observedRows);

  if (observedRows.length !== PIN.catalogItemCount) {
    findings.push(
      finding(
        "catalog_count_mismatch",
        "$.items",
        `catalog has ${observedRows.length} items, pin expects ${PIN.catalogItemCount}`,
      ),
    );
  }

  for (const [key, pinRow] of expected) {
    const got = observed.get(key);
    if (!got) {
      findings.push(finding("missing_route", key, `pin route ${key} missing from catalog`));
      continue;
    }
    if (got.amountAtomic !== pinRow.amountAtomic) {
      findings.push(
        finding("amount_drift", key, `catalog ${got.amountAtomic} != pin ${pinRow.amountAtomic}`, {
          catalogAmountAtomic: got.amountAtomic,
          pinAmountAtomic: pinRow.amountAtomic,
        }),
      );
    }
    const display = atomicToDisplay(got.amountAtomic);
    if (display !== got.amountDisplayUsd) {
      findings.push(finding("display_mismatch", key, "atomic/display conversion failed"));
    }
    if (got.network !== PIN.network) {
      findings.push(finding("pin_mismatch", `${key}.network`, "network is not the SDS pin"));
    }
    if (String(got.asset).toLowerCase() !== PIN.asset.toLowerCase()) {
      findings.push(finding("pin_mismatch", `${key}.asset`, "asset is not the SDS pin"));
    }
    if (String(got.payTo).toLowerCase() !== PIN.payTo.toLowerCase()) {
      findings.push(finding("pin_mismatch", `${key}.payTo`, "payTo is not the SDS pin"));
    }
    if (got.extraName !== pinRow.extraName) {
      findings.push(
        finding("pin_mismatch", `${key}.extra.name`, `extra.name ${got.extraName} != ${pinRow.extraName}`),
      );
    }
    if (got.maxTimeoutSeconds !== pinRow.maxTimeoutSeconds) {
      findings.push(
        finding(
          "pin_mismatch",
          `${key}.maxTimeoutSeconds`,
          `maxTimeoutSeconds ${got.maxTimeoutSeconds} != ${pinRow.maxTimeoutSeconds}`,
        ),
      );
    }
  }

  for (const [key] of observed) {
    if (!expected.has(key)) {
      findings.push(finding("unexpected_route", key, `catalog route ${key} is not in the w1041 pin`));
    }
  }

  const unique = uniqueAmountsFromRows(observedRows);
  if (unique.length !== PIN.uniqueAmountCount) {
    findings.push(
      finding(
        "unique_amount_count_mismatch",
        "$.uniqueAmounts",
        `catalog has ${unique.length} unique amounts, pin expects ${PIN.uniqueAmountCount}`,
      ),
    );
  }
  for (const pinAmt of UNIQUE_AMOUNTS) {
    const got = unique.find((item) => item.amountAtomic === pinAmt.amountAtomic);
    if (!got) {
      findings.push(finding("missing_unique_amount", pinAmt.amountAtomic, "pinned unique amount missing"));
      continue;
    }
    if (got.amountDisplayUsd !== pinAmt.amountDisplayUsd) {
      findings.push(
        finding(
          "display_mismatch",
          pinAmt.amountAtomic,
          `display ${got.amountDisplayUsd} != pin ${pinAmt.amountDisplayUsd}`,
        ),
      );
    }
    if (got.routeCount !== pinAmt.routeCount) {
      findings.push(
        finding(
          "unique_amount_route_count",
          pinAmt.amountAtomic,
          `routeCount ${got.routeCount} != pin ${pinAmt.routeCount}`,
        ),
      );
    }
  }

  return {
    ok: findings.length === 0,
    liveSdsPricesUnchanged: findings.every((item) => item.code !== "amount_drift"),
    pinMatch: findings.length === 0,
    findings,
    uniqueAmounts: unique,
  };
}

export function crossCheckOpenApi(observedRows, openapi) {
  const findings = [];
  const catalog = indexRows(observedRows);
  const ops = paidOperationsFromOpenApi(openapi);
  let matched = 0;
  const extra = [];

  for (const op of ops) {
    const key = routeKey(op.method, op.route);
    const row = catalog.get(key);
    if (!row) {
      extra.push({ method: op.method, route: op.route, displayAmount: op.displayAmount });
      continue;
    }
    matched += 1;
    if (op.displayAmount !== row.amountDisplayUsd) {
      findings.push(
        finding(
          "openapi_display_mismatch",
          key,
          `OpenAPI display ${op.displayAmount} != catalog display ${row.amountDisplayUsd} (atomic ${row.amountAtomic})`,
          {
            openapiDisplay: op.displayAmount,
            catalogDisplay: row.amountDisplayUsd,
            catalogAtomic: row.amountAtomic,
          },
        ),
      );
    }
    if (op.has402Response !== true) {
      findings.push(finding("missing_402_response", key, "OpenAPI operation has no 402 response"));
    }
    if (op.network && op.network !== PIN.network) {
      findings.push(finding("pin_mismatch", `${key}.openapi.network`, "OpenAPI network is not the SDS pin"));
    }
    if (op.asset && String(op.asset).toLowerCase() !== PIN.asset.toLowerCase()) {
      findings.push(finding("pin_mismatch", `${key}.openapi.asset`, "OpenAPI asset is not the SDS pin"));
    }
  }

  return {
    ok: findings.length === 0,
    matched,
    extraMethods: extra,
    findings,
  };
}

export function matchKnownStale(listing) {
  return KNOWN_STALE_LISTINGS.find(
    (item) =>
      item.route === listing.route &&
      item.method === listing.method &&
      item.host === listing.host &&
      item.listedAmountAtomic === listing.amountAtomic,
  );
}

export function crossCheckBazaar(observedRows, bazaar) {
  const catalog = indexRows(observedRows);
  const listings = listingsFromBazaar(bazaar);
  const findings = [];
  let matched = 0;
  let stale = 0;
  let aliasMatched = 0;
  const staleListings = [];

  for (const listing of listings) {
    const row = catalog.get(routeKey(listing.method, listing.route));
    if (!row) {
      findings.push(
        finding("unknown_listed_route", listing.resource, "bazaar resource path is not in the origin catalog", {
          host: listing.host,
          route: listing.route,
        }),
      );
      continue;
    }
    const originHost = listing.host === PIN.originHost;
    if (listing.amountAtomic === row.amountAtomic) {
      if (originHost) matched += 1;
      else aliasMatched += 1;
      continue;
    }
    stale += 1;
    const known = matchKnownStale(listing);
    const item = {
      code: "stale_listed_amount",
      host: listing.host,
      route: listing.route,
      method: listing.method,
      listedAmountAtomic: listing.amountAtomic,
      catalogAmountAtomic: row.amountAtomic,
      listedAmountDisplayUsd: atomicToDisplay(listing.amountAtomic),
      catalogAmountDisplayUsd: row.amountDisplayUsd,
      known: Boolean(known),
      knownId: known?.id || null,
      resource: listing.resource,
    };
    staleListings.push(item);
    findings.push(
      finding(
        "stale_listed_amount",
        listing.resource,
        `listed ${listing.amountAtomic} vs catalog ${row.amountAtomic} for ${listing.method} ${listing.route}`,
        item,
      ),
    );
  }

  return {
    listings: listings.length,
    matched,
    aliasMatched,
    stale,
    staleListings,
    findings,
    // Catalog pin can be intact while bazaar is stale. Cold run reports this; it does not rewrite listings.
    catalogIntact: true,
  };
}

export function matrixSummary(observedRows, extras = {}) {
  return {
    schemaVersion: "samedaydesk.w1041-402-matrix.v1",
    pin: PIN,
    catalogItemCount: observedRows.length,
    uniqueAmounts: uniqueAmountsFromRows(observedRows),
    routes: observedRows.map((row) => ({
      route: row.route,
      method: row.method,
      resource: row.resource,
      amountAtomic: row.amountAtomic,
      amountDisplayUsd: row.amountDisplayUsd,
      network: row.network,
      asset: row.asset,
      payTo: row.payTo,
      maxTimeoutSeconds: row.maxTimeoutSeconds,
      extraName: row.extraName,
    })),
    knownStaleListings: KNOWN_STALE_LISTINGS,
    ...extras,
  };
}

export function runCold(root) {
  const catalog = loadCatalog(root);
  const openapi = loadOpenApi(root);
  const bazaar = loadBazaar(root);
  const rows = rowsFromX402(catalog.raw);

  if (catalog.raw.x402Version !== PIN.x402Version) {
    throw new Error(`x402Version ${catalog.raw.x402Version} != pin ${PIN.x402Version}`);
  }
  if (catalog.raw.lastUpdated !== PIN.catalogLastUpdated) {
    // Catalog timestamp drift is a pin miss, not a silent accept.
  }

  const pinCmp = compareToPin(rows);
  if (catalog.raw.lastUpdated !== PIN.catalogLastUpdated) {
    pinCmp.findings.push(
      finding(
        "catalog_timestamp_drift",
        "$.lastUpdated",
        `catalog lastUpdated ${catalog.raw.lastUpdated} != pin ${PIN.catalogLastUpdated}`,
      ),
    );
    pinCmp.ok = false;
    pinCmp.pinMatch = false;
  }

  const openCmp = crossCheckOpenApi(rows, openapi.raw);
  const bazaarCmp = crossCheckBazaar(rows, bazaar.raw);

  const knownStaleCaught = KNOWN_STALE_LISTINGS.every((known) =>
    bazaarCmp.staleListings.some(
      (item) =>
        item.route === known.route &&
        item.method === known.method &&
        item.host === known.host &&
        item.listedAmountAtomic === known.listedAmountAtomic,
    ),
  );

  const ok = pinCmp.ok && openCmp.ok && knownStaleCaught;
  return {
    ok,
    rows,
    pin: pinCmp,
    openapi: openCmp,
    bazaar: bazaarCmp,
    knownStaleCaught,
    catalogPath: catalog.rel,
    openapiPath: openapi.rel,
    bazaarPath: bazaar.rel,
    catalogLastUpdated: catalog.raw.lastUpdated,
    x402Version: catalog.raw.x402Version,
    host: hostOf(PIN.origin),
  };
}
