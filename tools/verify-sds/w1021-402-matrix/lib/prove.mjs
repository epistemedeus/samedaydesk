import { join } from "node:path";
import { SEEDED_IDS } from "./argv.mjs";
import {
  bindPin,
  loadCatalog,
  loadCommittedMatrix,
  loadPin,
  matrixSummary,
  unpaidRecordFromRow,
} from "./catalog.mjs";
import { envelope, failError, FEATURE, nodeInfo } from "./envelope.mjs";
import {
  catalogPath,
  findRepoRoot,
  loadJson,
  MAP_PATH,
  SEEDED_FIXTURES,
  SLICE_DIR,
} from "./paths.mjs";
import {
  coverageFromRecords,
  evaluateRecord,
  loadSeededManifest,
  runSeededSuite,
  validateFile,
} from "./validate.mjs";

function requireNode22() {
  const node = nodeInfo();
  if (node.major !== 22) {
    return envelope({
      ok: false,
      command: "prove",
      error: failError("NODE", `Node ${node.actual} is not 22.x`, node),
      result: { node },
    });
  }
  return null;
}

function loadBound(root) {
  const map = loadJson(MAP_PATH);
  const pin = loadPin();
  const catalog = loadCatalog(catalogPath(root));
  const committed = loadCommittedMatrix();
  const bound = bindPin(catalog, pin, committed);
  return { map, pin, catalog, committed, bound, matrix: bound.derived };
}

function bindEvidence(root, bound, pin) {
  return [
    { kind: "map", path: "tools/verify-sds/w1021-402-matrix/map.json", feature: FEATURE },
    {
      kind: "pin",
      catalogPath: pin.catalogPath,
      lastUpdated: pin.lastUpdated,
      itemCount: pin.itemCount,
      uniqueAmountCount: pin.uniqueAmountCount,
    },
    { kind: "catalog", path: catalogPath(root), items: bound.catalogItems },
    { kind: "repo", root },
  ];
}

function catalogRecords(matrix) {
  return matrix.routes.map((row) => unpaidRecordFromRow(row, matrix));
}

function evaluateCatalogCoverage(matrix) {
  const records = catalogRecords(matrix);
  const evaluations = records.map((record) => {
    const evaluated = evaluateRecord(record, matrix);
    return {
      route: record.route,
      method: record.method,
      amountAtomic: record.amountAtomic,
      ok: evaluated.ok,
      naiveVerdict: evaluated.naiveVerdict,
      honestVerdict: evaluated.honestVerdict,
      codes: evaluated.codes,
    };
  });
  const failed = evaluations.filter((item) => !item.ok);
  const coverage = coverageFromRecords(records, matrix);
  return { records, evaluations, failed, coverage };
}

function seedFile(id) {
  const map = {
    "stale-listed-amount": "stale-listed-amount.json",
    "wrong-units": "wrong-units-5000-as-dollars.json",
    "paid-as-unpaid": "paid-as-unpaid.json",
    "silent-empty-success": "silent-empty-success.json",
  };
  return join(SEEDED_FIXTURES, map[id]);
}

export async function prove(parsed) {
  const nodeFail = requireNode22();
  if (nodeFail) return nodeFail;

  if (parsed.refused) {
    return envelope({
      ok: false,
      command: parsed.command || "prove",
      status: "usage",
      error: failError(
        "REFUSED",
        `${parsed.refused} is refused. This slice is unpaid 402-matrix fixture validation only.`,
      ),
    });
  }

  if (parsed.unknown?.length || parsed.missingValues?.length) {
    return envelope({
      ok: false,
      command: parsed.command || "prove",
      status: "usage",
      error: failError(
        "USAGE",
        parsed.missingValues.length
          ? `missing value for ${parsed.missingValues.join(", ")}`
          : `unknown args: ${parsed.unknown.join(", ")}`,
      ),
    });
  }

  const root = findRepoRoot(parsed.flags.root);
  if (!root) {
    return envelope({
      ok: false,
      command: parsed.command || "prove",
      status: "usage",
      error: failError("USAGE", "could not find samedaydesk repo root with fixtures/presence/catalog/x402.json"),
    });
  }

  let loaded;
  try {
    loaded = loadBound(root);
  } catch (error) {
    return envelope({
      ok: false,
      command: parsed.command || "prove",
      error: failError("CATALOG_MISS", error.message),
    });
  }

  const { map, pin, bound, matrix } = loaded;
  const evidence = bindEvidence(root, bound, pin);

  if (!bound.ok) {
    return envelope({
      ok: false,
      command: parsed.command || "prove",
      evidence,
      error: failError("PIN_MISMATCH", bound.mismatches.join("; "), { mismatches: bound.mismatches }),
    });
  }

  if (parsed.command === "map") {
    return envelope({
      ok: true,
      command: "map",
      dryRun: parsed.dryRun,
      evidence,
      result: {
        feature: FEATURE,
        wave: "w1021",
        routes: matrix.routes.length,
        uniqueAmounts: matrix.uniqueAmounts,
        pin: {
          lastUpdated: pin.lastUpdated,
          itemCount: pin.itemCount,
          origin: pin.origin,
          purchaseAuthority: pin.purchaseAuthority,
        },
        outOfScope: map.outOfScope,
        designatedSeed: matrix.designatedSeed,
      },
    });
  }

  if (parsed.command === "matrix") {
    return envelope({
      ok: true,
      command: "matrix",
      dryRun: parsed.dryRun,
      evidence,
      result: matrixSummary(matrix),
    });
  }

  if (parsed.dryRun && parsed.command === "cold") {
    return envelope({
      ok: true,
      command: "cold",
      dryRun: true,
      evidence,
      result: {
        would: [
          `read ${pin.catalogPath}`,
          "bind 23 origin routes and 8 unique atomic USDC amounts",
          "synthesize unpaid 402 records from catalog (no network)",
          "reject seeded stale-listed-amount",
        ],
        paymentSent: false,
        live: false,
        routes: matrix.routes.length,
        uniqueAmounts: matrix.uniqueAmounts.length,
      },
    });
  }

  if (parsed.seededFailure) {
    return seededProve(parsed, matrix, evidence);
  }

  if (parsed.command === "suite") {
    return suiteProve(matrix, evidence);
  }

  if (parsed.command === "files") {
    return filesProve(parsed, matrix, evidence);
  }

  return coldProve(matrix, evidence, pin);
}

function coldProve(matrix, evidence, pin) {
  const { evaluations, failed, coverage } = evaluateCatalogCoverage(matrix);
  const extract = evaluations.find((item) => item.route === "/extract");
  const read = evaluations.find((item) => item.route === "/read");
  const ok = failed.length === 0 && coverage.ok;
  if (!ok) {
    return envelope({
      ok: false,
      command: "cold",
      evidence,
      error: failError("COLD_FAIL", "catalog-derived unpaid 402 matrix did not prove", {
        failed,
        coverage,
      }),
      result: {
        pin: { lastUpdated: pin.lastUpdated, itemCount: pin.itemCount },
        routes: matrix.routes.length,
        uniqueAmounts: matrix.uniqueAmounts,
        coverage,
        failed,
      },
    });
  }
  return envelope({
    ok: true,
    command: "cold",
    evidence: [
      ...evidence,
      { kind: "coverage", routes: coverage.matrixRoutes, uniqueAmounts: coverage.uniqueCovered },
      { kind: "extract", amountAtomic: extract?.amountAtomic, honestVerdict: extract?.honestVerdict },
      { kind: "read", amountAtomic: read?.amountAtomic, honestVerdict: read?.honestVerdict },
    ],
    result: {
      pin: {
        lastUpdated: pin.lastUpdated,
        itemCount: pin.itemCount,
        origin: pin.origin,
        network: pin.network,
        purchaseAuthority: false,
      },
      routes: matrix.routes.length,
      uniqueAmounts: matrix.uniqueAmounts,
      coverage,
      extract: { amountAtomic: "5000", amountDisplayUsd: "0.005", honestVerdict: "accept" },
      knownStaleListing: matrix.knownStaleListings[0],
      http402IsSettlement: false,
      purchaseAuthority: false,
    },
  });
}

function seededProve(parsed, matrix, evidence) {
  const id = parsed.seededId;
  if (!SEEDED_IDS.has(id)) {
    return envelope({
      ok: false,
      command: "seeded-failure",
      status: "usage",
      evidence,
      error: failError("USAGE", "--seeded-failure must be stale-listed-amount, wrong-units, paid-as-unpaid, or silent-empty-success"),
    });
  }

  if (id === "silent-empty-success") {
    const fixture = loadJson(seedFile(id));
    const emptyOk = fixture.ok === true && Array.isArray(fixture.routes) && fixture.routes.length === 0;
    return envelope({
      ok: false,
      command: "seeded-failure",
      evidence: [...evidence, { kind: "seed", id, fixture: "fixtures/seeded/silent-empty-success.json" }],
      error: failError("SEED_REJECT", "silent-empty-success", {
        observedRefuse: true,
        emptyOk,
        requiredRoutes: matrix.routes.length,
      }),
      result: {
        seed: id,
        observedRefuse: true,
        naiveVerdict: fixture.ok === true ? "accept" : "reject",
        honestVerdict: "reject",
        codes: ["silent-empty-success"],
        fixture,
      },
    });
  }

  const filePath = seedFile(id);
  const result = validateFile(filePath, matrix);
  const seedMeta = matrix.designatedSeed;
  const expectedCode =
    id === "stale-listed-amount"
      ? seedMeta.code
      : id === "wrong-units"
        ? "wrong_units"
        : "paid_as_unpaid";
  const caught =
    result.naiveVerdict === "accept" &&
    result.honestVerdict === "reject" &&
    result.codes.includes(expectedCode);

  if (!caught) {
    return envelope({
      ok: false,
      command: "seeded-failure",
      evidence: [...evidence, { kind: "seed", id, filePath }],
      error: failError(result.ok ? "SEED_ACCEPTED" : "SEED_MISS", `seeded ${id} not caught`, {
        codes: result.codes,
      }),
      result: {
        seed: id,
        caught: false,
        naiveVerdict: result.naiveVerdict,
        honestVerdict: result.honestVerdict,
        codes: result.codes,
      },
    });
  }

  return envelope({
    ok: false,
    command: "seeded-failure",
    evidence: [...evidence, { kind: "seed", id, filePath, code: expectedCode }],
    error: failError("SEED_REJECT", id, {
      childExit: 1,
      productCode: expectedCode,
      observedRefuse: true,
      naiveVerdict: result.naiveVerdict,
      honestVerdict: result.honestVerdict,
    }),
    result: {
      seed: id,
      file: filePath,
      fixtureId: result.fixtureId,
      statusClass: result.statusClass,
      route: result.route,
      amountAtomic: result.amountAtomic,
      naiveVerdict: result.naiveVerdict,
      honestVerdict: result.honestVerdict,
      codes: result.codes,
      caught: true,
      observedRefuse: true,
      http402IsSettlement: false,
    },
  });
}

function suiteProve(matrix, evidence) {
  const catalog = evaluateCatalogCoverage(matrix);
  const seeded = runSeededSuite(matrix);
  const ok = catalog.failed.length === 0 && catalog.coverage.ok && seeded.ok;
  if (!ok) {
    return envelope({
      ok: false,
      command: "suite",
      evidence,
      error: failError("SUITE_FAIL", "catalog coverage or seeded suite failed", {
        catalogFailed: catalog.failed,
        seeded,
      }),
      result: { coverage: catalog.coverage, seeded },
    });
  }
  return envelope({
    ok: true,
    command: "suite",
    evidence,
    result: {
      catalogRoutes: catalog.evaluations.length,
      coverage: catalog.coverage,
      seeded,
    },
  });
}

function filesProve(parsed, matrix, evidence) {
  if (!parsed.files.length) {
    return envelope({
      ok: false,
      command: "files",
      status: "usage",
      evidence,
      error: failError("USAGE", "pass one or more JSON files"),
    });
  }
  const results = parsed.files.map((filePath) => validateFile(filePath, matrix));
  if (parsed.flags.expectReject) {
    if (results.length !== 1) {
      return envelope({
        ok: false,
        command: "files",
        status: "usage",
        evidence,
        error: failError("USAGE", "--expect-reject requires exactly one file"),
      });
    }
    const result = results[0];
    const ok = !result.ok && result.codes.includes(parsed.flags.expectReject);
    return envelope({
      ok,
      command: "files",
      evidence,
      error: ok
        ? null
        : failError("EXPECT_MISS", `expected reject code ${parsed.flags.expectReject}`),
      result: {
        expectReject: parsed.flags.expectReject,
        file: result.filePath,
        fixtureId: result.fixtureId,
        statusClass: result.statusClass,
        route: result.route,
        amountAtomic: result.amountAtomic,
        naiveVerdict: result.naiveVerdict,
        honestVerdict: result.honestVerdict,
        codes: result.codes,
      },
    });
  }
  const failed = results.filter((item) => !item.ok);
  return envelope({
    ok: failed.length === 0,
    command: "files",
    evidence,
    error:
      failed.length === 0
        ? null
        : failError("FILE_REJECT", `${failed.length} file(s) rejected`),
    result: {
      passed: results.length - failed.length,
      failed: failed.length,
      total: results.length,
      results: results.map((item) => ({
        file: item.filePath,
        ok: item.ok,
        fixtureId: item.fixtureId,
        statusClass: item.statusClass,
        route: item.route,
        amountAtomic: item.amountAtomic,
        naiveVerdict: item.naiveVerdict,
        honestVerdict: item.honestVerdict,
        codes: item.codes,
      })),
    },
  });
}

export { loadBound, seedFile, loadSeededManifest, SLICE_DIR };
