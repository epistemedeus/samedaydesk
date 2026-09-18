#!/usr/bin/env node
/**
 * SDS 402 amount matrix (w1041).
 * Boundary: tools/verify-sds/w1041-402-matrix/** only.
 * Cold-reads fixtures/presence/catalog/x402.json (23 origin routes).
 * Never pay, checkout, publish, or attach neo.
 *
 * Usage:
 *   node tools/verify-sds/w1041-402-matrix/cli.mjs --cold
 *   node tools/verify-sds/w1041-402-matrix/cli.mjs --seeded-failure stale-listed-amount
 *   node tools/verify-sds/w1041-402-matrix/cli.mjs --suite
 *   node tools/verify-sds/w1041-402-matrix/cli.mjs --matrix
 */
import { parseArgs } from "node:util";
import { FEATURE, PIN, SEEDED, SEEDED_FAILURE, W7_CITE } from "./lib/pin.mjs";
import { envelope, emitEnvelope, exitFor, failError } from "./lib/envelope.mjs";
import { refusedFlag } from "./lib/refuse.mjs";
import { REPO_ROOT, rowsFromX402, loadCatalog } from "./lib/catalog.mjs";
import { matrixSummary, runCold } from "./lib/matrix.mjs";
import { evaluateSeededFailure, runSuite, validateFile } from "./lib/evaluate.mjs";

function usage() {
  return `sds w1041-402-matrix — unpaid HTTP 402 amount matrix over the committed SDS catalog

Pin: ${PIN.catalogItemCount} origin routes, ${PIN.uniqueAmountCount} unique USDC amounts
     origin ${PIN.origin}
     display = atomic / 1e${PIN.decimals}

Commands:
  --cold                         read in-tree x402.json + OpenAPI + bazaar; exit 0 if pin holds and known stale listings are caught
  --matrix                       print the catalog-derived matrix
  --cross-check                  pin vs catalog vs OpenAPI vs bazaar
  --suite                        generated unpaid 402s from catalog accept; seeded files reject
  --seeded-failure <id>          designated naive-accept / honest-reject (default ${SEEDED_FAILURE})
  --expect-reject <code> <file>  require the named code on one fixture
  run                            harness: cold pass + designated seed reject
  cite                           W7 cite + pin (no I/O)

Seeded failures:
  ${Object.keys(SEEDED).join("\n  ")}

Never: --live --pay --checkout --publish --neo --settle
Cite: PR${W7_CITE.pr} ${W7_CITE.branch} (${W7_CITE.note})
Feature: ${FEATURE}
`;
}

function catalogRows(root) {
  return rowsFromX402(loadCatalog(root).raw);
}

function coldEnvelope(cold) {
  return envelope({
    ok: cold.ok,
    command: "cold",
    error: cold.ok
      ? null
      : failError("COLD_FAIL", "catalog pin, OpenAPI display, or known stale detection failed", {
          pinFindings: cold.pin.findings,
          openapiFindings: cold.openapi.findings,
          knownStaleCaught: cold.knownStaleCaught,
        }),
    result: {
      catalogPath: cold.catalogPath,
      openapiPath: cold.openapiPath,
      bazaarPath: cold.bazaarPath,
      catalogItems: cold.rows.length,
      uniqueAmounts: cold.pin.uniqueAmounts,
      liveSdsPricesUnchanged: cold.pin.liveSdsPricesUnchanged,
      pinMatch: cold.pin.pinMatch,
      x402Version: cold.x402Version,
      catalogLastUpdated: cold.catalogLastUpdated,
      openapi: {
        ok: cold.openapi.ok,
        matched: cold.openapi.matched,
        extraMethods: cold.openapi.extraMethods,
      },
      bazaar: {
        listings: cold.bazaar.listings,
        matched: cold.bazaar.matched,
        aliasMatched: cold.bazaar.aliasMatched,
        stale: cold.bazaar.stale,
        staleListings: cold.bazaar.staleListings,
        catalogIntact: cold.bazaar.catalogIntact,
      },
      knownStaleCaught: cold.knownStaleCaught,
      pinFindings: cold.pin.findings,
    },
    findings: cold.bazaar.findings,
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const refused = refusedFlag(argv);
  if (refused) {
    const env = envelope({
      ok: false,
      command: "refused",
      status: "usage",
      error: failError("REFUSED", `${refused} is refused. This pack is unpaid 402-matrix verification only.`),
    });
    emitEnvelope(env);
    process.exit(exitFor(env));
  }

  const { values, positionals } = parseArgs({
    allowPositionals: true,
    args: argv,
    options: {
      cold: { type: "boolean", default: false },
      matrix: { type: "boolean", default: false },
      "cross-check": { type: "boolean", default: false },
      suite: { type: "boolean", default: false },
      "seeded-failure": { type: "string" },
      "expect-reject": { type: "string" },
      pretty: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      root: { type: "string" },
    },
  });

  const pretty = Boolean(values.pretty);
  const root = values.root || REPO_ROOT;

  if (values.help) {
    process.stdout.write(usage());
    process.exit(0);
  }

  const cmdPos = positionals[0];
  const seededId = values["seeded-failure"];
  const exclusive =
    Number(Boolean(values.cold)) +
    Number(Boolean(values.matrix)) +
    Number(Boolean(values["cross-check"])) +
    Number(Boolean(values.suite)) +
    Number(Boolean(seededId));

  if (exclusive > 1) {
    const env = envelope({
      ok: false,
      command: "usage",
      status: "usage",
      error: failError("USAGE", "pass only one of --cold, --matrix, --cross-check, --suite, or --seeded-failure"),
    });
    emitEnvelope(env, { pretty });
    process.exit(exitFor(env));
  }

  let env;
  if (cmdPos === "cite") {
    env = envelope({
      ok: true,
      command: "cite",
      result: {
        pin: PIN,
        seeded: Object.keys(SEEDED),
        w7: W7_CITE,
        writeBoundary: "tools/verify-sds/w1041-402-matrix/**",
      },
    });
  } else if (cmdPos === "run" || (!cmdPos && exclusive === 0 && !values["expect-reject"] && positionals.length === 0)) {
    const command = cmdPos === "run" ? "run" : "cold";
    const cold = runCold(root);
    if (command === "cold") {
      env = coldEnvelope(cold);
    } else {
      const seed = evaluateSeededFailure(SEEDED_FAILURE, cold.rows);
      const ok = cold.ok && seed.caught && seed.naiveWouldAccept;
      env = envelope({
        ok,
        command: "run",
        error: ok
          ? null
          : failError("HARNESS_FAIL", "cold pass + designated seed reject required", {
              coldOk: cold.ok,
              seedCaught: seed.caught,
            }),
        result: {
          coldOk: cold.ok,
          seedsOk: seed.caught && seed.naiveWouldAccept,
          catalogItems: cold.rows.length,
          liveSdsPricesUnchanged: cold.pin.liveSdsPricesUnchanged,
          knownStaleCaught: cold.knownStaleCaught,
          seed: {
            id: SEEDED_FAILURE,
            caught: seed.caught,
            naiveWouldAccept: seed.naiveWouldAccept,
            remappedFromNaiveAccept: seed.remappedFromNaiveAccept,
            codes: seed.result?.codes ?? [],
          },
        },
      });
    }
  } else if (values.cold || cmdPos === "cold") {
    env = coldEnvelope(runCold(root));
  } else if (values.matrix || cmdPos === "matrix") {
    const cold = runCold(root);
    env = envelope({
      ok: cold.ok,
      command: "matrix",
      error: cold.ok ? null : failError("COLD_FAIL", "matrix pin failed"),
      result: matrixSummary(cold.rows, {
        liveSdsPricesUnchanged: cold.pin.liveSdsPricesUnchanged,
        pinMatch: cold.pin.pinMatch,
        bazaarStale: cold.bazaar.staleListings,
      }),
    });
  } else if (values["cross-check"] || cmdPos === "cross-check") {
    const cold = runCold(root);
    env = envelope({
      ok: cold.ok,
      command: "cross-check",
      error: cold.ok ? null : failError("CROSS_CHECK_FAIL", "pin, OpenAPI, or known stale detection failed"),
      result: {
        catalogPath: cold.catalogPath,
        catalogItems: cold.rows.length,
        pinMatch: cold.pin.pinMatch,
        liveSdsPricesUnchanged: cold.pin.liveSdsPricesUnchanged,
        pinFindings: cold.pin.findings,
        openapi: cold.openapi,
        bazaar: cold.bazaar,
        knownStaleCaught: cold.knownStaleCaught,
      },
    });
  } else if (values.suite || cmdPos === "suite") {
    const rows = catalogRows(root);
    const report = runSuite(rows);
    env = envelope({
      ok: report.ok,
      command: "suite",
      error: report.ok ? null : failError("SUITE_FAIL", `${report.failed} of ${report.total} cases failed`),
      result: {
        passed: report.passed,
        failed: report.failed,
        total: report.total,
        generated: report.generated,
        results: report.results.map((item) => ({
          file: item.filePath,
          expect: item.expect,
          ok: item.ok,
          naiveVerdict: item.naiveVerdict,
          honestVerdict: item.honestVerdict,
          codes: item.codes,
        })),
      },
    });
  } else if (seededId || cmdPos === "seeded") {
    const id = seededId || positionals[1] || SEEDED_FAILURE;
    if (!SEEDED[id]) {
      env = envelope({
        ok: false,
        command: "seeded-failure",
        status: "usage",
        error: failError("USAGE", `--seeded-failure must be one of ${Object.keys(SEEDED).join(", ")}`),
      });
    } else {
      const rows = catalogRows(root);
      const seed = evaluateSeededFailure(id, rows);
      env = envelope({
        ok: false,
        command: "seeded-failure",
        error: seed.error,
        result: {
          seed: id,
          file: seed.filePath ?? null,
          fixtureId: seed.result?.fixtureId ?? null,
          statusClass: seed.result?.statusClass ?? null,
          route: seed.result?.route ?? null,
          amountAtomic: seed.result?.amountAtomic ?? null,
          naiveVerdict: seed.result?.naiveVerdict ?? null,
          honestVerdict: seed.result?.honestVerdict ?? null,
          codes: seed.result?.codes ?? [],
          caught: seed.caught,
          naiveWouldAccept: seed.naiveWouldAccept,
          remappedFromNaiveAccept: seed.remappedFromNaiveAccept,
        },
      });
    }
  } else if (positionals.length > 0 && values["expect-reject"]) {
    const filePath = positionals[0];
    const rows = catalogRows(root);
    const result = validateFile(filePath, rows);
    const codes = result.codes;
    const ok = !result.ok && codes.includes(values["expect-reject"]);
    env = envelope({
      ok,
      command: "expect-reject",
      error: ok ? null : failError("EXPECT_REJECT_MISS", `expected ${values["expect-reject"]}, got ${codes.join(",") || "none"}`),
      result: {
        expectReject: values["expect-reject"],
        file: result.filePath,
        fixtureId: result.fixtureId,
        naiveVerdict: result.naiveVerdict,
        honestVerdict: result.honestVerdict,
        codes,
        errors: result.errors,
      },
    });
  } else if (positionals.length > 0) {
    const rows = catalogRows(root);
    const results = positionals.map((filePath) => validateFile(filePath, rows));
    const failed = results.filter((item) => !item.ok);
    env = envelope({
      ok: failed.length === 0,
      command: "validate",
      error: failed.length === 0 ? null : failError("VALIDATE_FAIL", `${failed.length} file(s) rejected`),
      result: {
        passed: results.length - failed.length,
        failed: failed.length,
        total: results.length,
        results: results.map((item) => ({
          file: item.filePath,
          ok: item.ok,
          fixtureId: item.fixtureId,
          naiveVerdict: item.naiveVerdict,
          honestVerdict: item.honestVerdict,
          codes: item.codes,
          errors: item.errors,
        })),
      },
    });
  } else {
    env = envelope({
      ok: false,
      command: "usage",
      status: "usage",
      error: failError("USAGE", "pass --cold, --suite, --seeded-failure, run, or --help"),
    });
  }

  emitEnvelope(env, { pretty });
  process.exit(exitFor(env));
}

main().catch((err) => {
  const env = envelope({
    ok: false,
    command: "runtime",
    status: "error",
    error: failError("RUNTIME", err.message || String(err)),
  });
  emitEnvelope(env, { pretty: false });
  process.exit(exitFor(env));
});
