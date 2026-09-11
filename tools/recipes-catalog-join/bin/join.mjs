#!/usr/bin/env node
import { writeFileSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { joinRecipesCatalog, reportToJson } from "../lib/join.mjs";
import { WRITE_FORBIDDEN, PUBLISHED } from "../lib/paths.mjs";
import {
  JoinRefusal,
  refuseEditPublishedSurface,
  refuseMissingNamedSource,
  refusePaymentRequiredAsPaid,
  refuseRecipeAsCatalogJob,
} from "../lib/refuse.mjs";
import {
  loadCatalogFromHttp,
  loadFamiliesFromHttp,
  loadRecipeSpecsFromHttp,
  loadRouter,
} from "../lib/adapters.mjs";
import { servePublishedSurfaces } from "../lib/http.mjs";

function usage() {
  return `Read-only join of recurring-job-recipes, repeat-job families, useful-jobs catalog, and offer-routing.

  node tools/recipes-catalog-join/bin/join.mjs [--out PATH] [--http]
      [--catalog PATH] [--recipe-specs DIR]

Named inputs: recipes (specs) and catalog. Change --catalog only to vary source B.
--http serves those named files over loopback HTTP and joins the fetched bytes.

Seeded refusals (exit 2, no writes):

  --claim-recipe-as-catalog-job <recipeId>
  --treat-payment-required-as-paid
  --edit-catalog
  --edit-recipes

executionAuthorized stays false. paymentRequired from routing is not paid.
Does not reimplement recipes. Does not edit catalog or recipes.`;
}

function flagValue(argv, i, name) {
  const value = argv[i + 1];
  if (!value || String(value).startsWith("--")) {
    refuseMissingNamedSource({ name, path: value || null });
  }
  return value;
}

function parseArgs(argv) {
  const out = { rest: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--out") out.out = flagValue(argv, i++, "out");
    else if (arg === "--http") out.http = true;
    else if (arg === "--catalog") out.catalog = flagValue(argv, i++, "catalog");
    else if (arg === "--recipe-specs") out.recipeSpecs = flagValue(argv, i++, "recipes");
    else if (arg === "--claim-recipe-as-catalog-job") out.claimRecipe = flagValue(argv, i++, "recipeId");
    else if (arg === "--treat-payment-required-as-paid") out.treatPaid = true;
    else if (arg === "--edit-catalog") out.editCatalog = true;
    else if (arg === "--edit-recipes") out.editRecipes = true;
    else out.rest.push(arg);
  }
  return out;
}

function isForbiddenOut(path) {
  const resolved = resolve(path);
  for (const forbidden of WRITE_FORBIDDEN) {
    const target = resolve(forbidden);
    if (resolved === target) return true;
    try {
      if (statSync(target).isDirectory() && (resolved === target || resolved.startsWith(`${target}/`))) {
        return true;
      }
    } catch {
      // missing path is still forbidden if it is a known published file
      if (resolved === target) return true;
    }
  }
  return false;
}

async function maybeHttpOptions(useHttp, named = {}) {
  const catalogPath = named.catalogPath;
  const recipeSpecsDir = named.recipeSpecsDir;
  if (!useHttp) {
    return {
      options: {
        ...(catalogPath ? { catalogPath } : {}),
        ...(recipeSpecsDir ? { recipeSpecsDir } : {}),
      },
      stop: async () => {},
    };
  }
  const served = await servePublishedSurfaces({
    ...(catalogPath ? { catalogPath } : {}),
    ...(recipeSpecsDir ? { specsDir: recipeSpecsDir } : {}),
  });
  return {
    options: {
      loadCatalog: () => loadCatalogFromHttp(served.origin),
      loadRecipeSpecs: () => loadRecipeSpecsFromHttp(served.origin),
      loadFamilies: () => loadFamiliesFromHttp(served.origin),
    },
    stop: served.stop,
    origin: served.origin,
  };
}

function requireExisting(path, name) {
  if (!path) return;
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    refuseMissingNamedSource({ name, path: resolved });
  }
}

async function main(argv) {
  const args = parseArgs(argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (args.rest.length) {
    throw new JoinRefusal("unknown_argument", `unknown argument: ${args.rest.join(" ")}`);
  }
  if (args.editCatalog) {
    refuseEditPublishedSurface({ action: "edit-catalog", path: PUBLISHED.catalog });
  }
  if (args.editRecipes) {
    refuseEditPublishedSurface({ action: "edit-recipes", path: PUBLISHED.recipeSpecsDir });
  }
  requireExisting(args.catalog, "catalog");
  requireExisting(args.recipeSpecs, "recipes");

  const router = await loadRouter();
  if (args.treatPaid) {
    const route = router.routeJob({
      type: "bounded_html_observation",
      jobId: "join-seeded-paymentRequired",
      constraints: [],
    });
    refusePaymentRequiredAsPaid(route);
  }

  const http = await maybeHttpOptions(args.http, {
    catalogPath: args.catalog,
    recipeSpecsDir: args.recipeSpecs,
  });
  try {
    const report = await joinRecipesCatalog({ router, ...http.options });
    if (args.claimRecipe) {
      refuseRecipeAsCatalogJob({
        recipeId: args.claimRecipe,
        claimedCatalogJobId: args.claimRecipe,
        catalogJobIds: report.catalog.jobIds,
      });
    }
    const text = reportToJson(report);
    if (args.out) {
      const dest = resolve(args.out);
      if (isForbiddenOut(dest)) {
        throw new JoinRefusal(
          "out_path_hits_published_surface",
          `refusing to write over published surface: ${dest}`,
        );
      }
      writeFileSync(dest, text);
    } else {
      process.stdout.write(text);
    }
  } finally {
    await http.stop();
  }
}

function failureBody(err) {
  if (err instanceof JoinRefusal) return err.toJSON();
  const message = err.message || String(err);
  const transport =
    err.code === "ENOENT" ||
    err.code === "ECONNREFUSED" ||
    /^http_\d+:/.test(message);
  return {
    ok: false,
    outcome: transport ? "transport-failure" : "engine-failure",
    message,
  };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  main(process.argv).catch((err) => {
    const body = failureBody(err);
    process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
    process.exitCode = 2;
  });
}
