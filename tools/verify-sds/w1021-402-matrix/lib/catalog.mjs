import { existsSync, readFileSync } from "node:fs";
import { ADDR_RE, atomicToDisplay } from "./money.mjs";
import { loadJson, MATRIX_PATH, PIN_PATH } from "./paths.mjs";

export const MATRIX_SCHEMA_VERSION = "samedaydesk.verify-sds.w1021-402-matrix.v1";
export const RECORD_SCHEMA_VERSION = "samedaydesk.verify-sds.w1021-402-matrix.unpaid.v1";
export const SEEDED_FAILURE = "stale-listed-amount";

export const REQUIRED_PROHIBITED_INFERENCES = Object.freeze([
  "paid_as_unpaid",
  "stale_listed_amount_is_catalog",
  "atomic_is_display_usd",
  "http_402_is_delivery",
]);

export function routeKey(method, route) {
  return `${method} ${route}`;
}

export function loadPin() {
  return loadJson(PIN_PATH);
}

export function loadCommittedMatrix() {
  return loadJson(MATRIX_PATH);
}

export function loadCatalog(path) {
  if (!existsSync(path)) {
    throw new Error(`in-tree catalog missing: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function extraFromAccept(accept) {
  const extra = accept?.extra;
  if (!extra || typeof extra !== "object") return undefined;
  const out = {};
  if (typeof extra.name === "string") out.name = extra.name;
  if (typeof extra.version === "string") out.version = extra.version;
  if (typeof extra.verifyingContract === "string") out.verifyingContract = extra.verifyingContract;
  return Object.keys(out).length ? out : undefined;
}

export function rowsFromCatalog(catalog) {
  const items = Array.isArray(catalog.items) ? catalog.items : [];
  return items.map((item) => {
    const accept = Array.isArray(item.accepts) ? item.accepts[0] : null;
    const amountAtomic = accept?.amount;
    const extra = extraFromAccept(accept);
    const row = {
      route: item?.resource?.routeTemplate,
      method: item?.request?.method,
      resource: item?.resource?.url,
      amountAtomic,
      amountDisplayUsd: atomicToDisplay(amountAtomic),
      network: accept?.network,
      asset: accept?.asset,
      payTo: accept?.payTo,
      maxTimeoutSeconds: accept?.maxTimeoutSeconds,
      scheme: accept?.scheme,
    };
    if (extra) row.extra = extra;
    return row;
  });
}

export function uniqueAmountsFromRows(rows) {
  const counts = new Map();
  for (const row of rows) {
    const n = counts.get(row.amountAtomic) || 0;
    counts.set(row.amountAtomic, n + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([amountAtomic, routeCount]) => ({
      amountAtomic,
      amountDisplayUsd: atomicToDisplay(amountAtomic),
      routeCount,
    }));
}

export function pinFromCatalog(catalog, pinFile) {
  const first = Array.isArray(catalog.items) ? catalog.items[0]?.accepts?.[0] : null;
  return {
    origin: pinFile.origin,
    scheme: first?.scheme || pinFile.scheme,
    network: first?.network || pinFile.network,
    payTo: first?.payTo || pinFile.payTo,
    asset: first?.asset || pinFile.asset,
    decimals: pinFile.decimals,
    assetSymbol: pinFile.assetSymbol,
  };
}

export function matrixFromCatalog(catalog, pinFile) {
  const rows = rowsFromCatalog(catalog);
  const uniqueAmounts = uniqueAmountsFromRows(rows);
  const stale = pinFile.knownStaleListing;
  return {
    schemaVersion: MATRIX_SCHEMA_VERSION,
    recordSchemaVersion: RECORD_SCHEMA_VERSION,
    product: "samedaydesk-verify-sds",
    pack: "w1021-402-matrix",
    wave: "w1021",
    statusClasses: ["unpaid"],
    kinds: ["unpaid_payment_required"],
    pin: pinFromCatalog(catalog, pinFile),
    inTreeCatalog: {
      path: pinFile.catalogPath,
      lastUpdated: catalog.lastUpdated ?? null,
      x402Version: catalog.x402Version ?? null,
      itemCount: Array.isArray(catalog.items) ? catalog.items.length : 0,
    },
    uniqueAmounts,
    routes: rows,
    knownStaleListings: [
      {
        id: stale.id,
        surface: stale.surface,
        route: stale.route,
        method: stale.method,
        listedAmountAtomic: stale.listedAmountAtomic,
        catalogAmountAtomic: stale.catalogAmountAtomic,
        listedAmountDisplayUsd: stale.listedAmountDisplayUsd,
        catalogAmountDisplayUsd: stale.catalogAmountDisplayUsd,
        note: `Bazaar listed ${stale.route} amount ${stale.listedAmountAtomic} vs origin catalog ${stale.catalogAmountAtomic}.`,
      },
    ],
    designatedSeed: {
      id: SEEDED_FAILURE,
      file: "seeded/stale-listed-amount.json",
      code: "stale_listed_amount",
      naiveRule: "statusClass-unpaid",
    },
    requiredProhibitedInferences: [...REQUIRED_PROHIBITED_INFERENCES],
    prohibitedInferences: [
      ...REQUIRED_PROHIBITED_INFERENCES,
      "amount_mismatch_is_unpaid_match",
    ],
    boundary: {
      paymentSent: false,
      checkoutMutated: false,
      registryMutated: false,
      published: false,
      neoAttached: false,
      live: false,
      statement:
        "w1021 unpaid SDS 402 matrix. Catalog atomic amounts are the pin. HTTP 402 is not settlement. A stale listed amount, dollar-scale atomic, or paid body labeled unpaid is rejected.",
    },
  };
}

export function indexRoutes(matrix) {
  const byKey = new Map();
  for (const row of matrix.routes) {
    byKey.set(routeKey(row.method, row.route), row);
  }
  return byKey;
}

function pinAddrOk(value, expected) {
  return typeof value === "string" && ADDR_RE.test(value) && value.toLowerCase() === expected.toLowerCase();
}

export function bindPin(catalog, pinFile, committedMatrix) {
  const mismatches = [];
  if (!catalog || typeof catalog !== "object") mismatches.push("catalog is not an object");
  if (catalog?.x402Version !== pinFile.x402Version) {
    mismatches.push(`x402Version ${catalog?.x402Version} != pin ${pinFile.x402Version}`);
  }
  if (catalog?.lastUpdated !== pinFile.lastUpdated) {
    mismatches.push(`lastUpdated ${catalog?.lastUpdated} != pin ${pinFile.lastUpdated}`);
  }
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  if (items.length !== pinFile.itemCount) {
    mismatches.push(`catalog items ${items.length} != pin ${pinFile.itemCount}`);
  }
  const derived = matrixFromCatalog(catalog, pinFile);
  if (derived.uniqueAmounts.length !== pinFile.uniqueAmountCount) {
    mismatches.push(`unique amounts ${derived.uniqueAmounts.length} != pin ${pinFile.uniqueAmountCount}`);
  }
  const derivedAtomics = derived.uniqueAmounts.map((item) => item.amountAtomic);
  if (JSON.stringify(derivedAtomics) !== JSON.stringify(pinFile.uniqueAmounts)) {
    mismatches.push("uniqueAmounts != pin.uniqueAmounts");
  }
  if (derived.pin.origin !== pinFile.origin) mismatches.push("origin != pin");
  if (derived.pin.network !== pinFile.network) mismatches.push("network != pin");
  if (!pinAddrOk(derived.pin.asset, pinFile.asset)) mismatches.push("asset != pin");
  if (!pinAddrOk(derived.pin.payTo, pinFile.payTo)) mismatches.push("payTo != pin");
  if (pinFile.purchaseAuthority !== false) mismatches.push("purchaseAuthority is not false");
  if (pinFile.live !== false) mismatches.push("live is not false");

  if (committedMatrix) {
    if (committedMatrix.schemaVersion !== MATRIX_SCHEMA_VERSION) {
      mismatches.push("committed matrix schemaVersion mismatch");
    }
    if (committedMatrix.routes?.length !== derived.routes.length) {
      mismatches.push(
        `committed matrix routes ${committedMatrix.routes?.length} != catalog ${derived.routes.length}`,
      );
    }
    const committedKeys = new Set(
      (committedMatrix.routes || []).map((row) => routeKey(row.method, row.route)),
    );
    for (const row of derived.routes) {
      const key = routeKey(row.method, row.route);
      const committed = (committedMatrix.routes || []).find(
        (entry) => entry.method === row.method && entry.route === row.route,
      );
      if (!committed) mismatches.push(`committed matrix missing ${key}`);
      else if (committed.amountAtomic !== row.amountAtomic) {
        mismatches.push(`committed ${key} amount ${committed.amountAtomic} != catalog ${row.amountAtomic}`);
      } else if (committed.resource !== row.resource) {
        mismatches.push(`committed ${key} resource drift`);
      }
      committedKeys.delete(key);
    }
    for (const leftover of committedKeys) mismatches.push(`catalog missing committed ${leftover}`);
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    derived,
    catalogItems: items.length,
  };
}

export function unpaidRecordFromRow(row, matrix, observedAt = "2026-09-17T12:00:00.000Z") {
  const slug = `${row.method.toLowerCase()}_${row.route.replace(/^\//, "").replace(/\//g, "-")}_${row.amountAtomic}`;
  const record = {
    schemaVersion: RECORD_SCHEMA_VERSION,
    fixtureId: `w1021_unpaid_${slug}`.replace(/[^a-z0-9_-]/g, "-"),
    kind: "unpaid_payment_required",
    statusClass: "unpaid",
    origin: matrix.pin.origin,
    resource: row.resource,
    route: row.route,
    method: row.method,
    httpStatus: 402,
    charged: false,
    paymentSent: false,
    observedAt,
    amountAtomic: row.amountAtomic,
    amountDisplayUsd: row.amountDisplayUsd,
    network: row.network,
    asset: row.asset,
    payTo: row.payTo,
    maxTimeoutSeconds: row.maxTimeoutSeconds,
    extra: row.extra || { name: "USD Coin", version: "2" },
    request: {
      method: row.method,
      url: row.resource,
      headers: { Accept: "application/json" },
    },
    source: {
      kind: "in_tree_x402_catalog",
      path: matrix.inTreeCatalog.path,
      capturedAt: observedAt,
      note: "Unpaid 402 amount pinned from in-tree x402 catalog. No payment header. Not settlement.",
    },
    unknownWhenAbsent: ["paid_body", "facilitator_settlement", "payment_header"],
    prohibitedInferences: [...REQUIRED_PROHIBITED_INFERENCES],
  };
  return record;
}

export function matrixSummary(matrix) {
  return {
    pack: matrix.pack,
    wave: matrix.wave,
    pin: matrix.pin,
    uniqueAmounts: matrix.uniqueAmounts,
    routes: matrix.routes.map((row) => ({
      method: row.method,
      route: row.route,
      amountAtomic: row.amountAtomic,
      amountDisplayUsd: row.amountDisplayUsd,
    })),
    knownStaleListings: matrix.knownStaleListings,
    designatedSeed: matrix.designatedSeed,
    boundary: matrix.boundary,
    inTreeCatalog: matrix.inTreeCatalog,
  };
}
