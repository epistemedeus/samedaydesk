#!/usr/bin/env node
/**
 * NL-DISTRIBUTION-03 CLI — acquisition package
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs build <inventory.json>
 *   node src/cli.mjs validate <package.json>
 *   node src/cli.mjs site-section
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAcquisitionPackage } from "./acquisition.mjs";
import { validateAcquisitionPackage } from "./validate.mjs";
import { renderAcquisitionSectionHtml, renderAcquisitionSectionMd } from "./site-section.mjs";
import { GREXAL_PUBLIC } from "./constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs build <inventory.json>
  node src/cli.mjs validate <package.json>
  node src/cli.mjs site-section`);
  process.exit(2);
}

function loadListingCapture() {
  return loadJson(join(root, "evidence/listing-recheck-20260910T124127Z.json"));
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

const clock = () => Date.parse("2026-09-10T19:45:00.000Z");

try {
  if (cmd === "build") {
    if (!a) usage();
    const pkg = buildAcquisitionPackage({
      inventory: loadJson(a),
      listingCapture: loadListingCapture(),
      clock,
    });
    console.log(JSON.stringify(pkg, null, 2));
    process.exit(0);
  } else if (cmd === "validate") {
    if (!a) usage();
    const pkg = validateAcquisitionPackage(loadJson(a));
    console.log(
      JSON.stringify(
        {
          ok: true,
          schema: pkg.schema,
          listingUrl: pkg.listing?.url,
          agentId: pkg.listing?.agentId,
          paidReady: pkg.paidReady,
          budgetHandoff: pkg.budgetHandoff,
          agensi: pkg.packages?.agensi,
        },
        null,
        2,
      ),
    );
  } else if (cmd === "site-section") {
    const md = renderAcquisitionSectionMd({
      listing: {
        url: GREXAL_PUBLIC.marketplaceUrl,
        agentId: GREXAL_PUBLIC.agentId,
      },
      budgetHandoff: {
        listPriceUsd: GREXAL_PUBLIC.listPriceUsd,
        estimateReserveUsd: GREXAL_PUBLIC.estimateReserveUsd,
      },
    });
    const html = renderAcquisitionSectionHtml();
    const mdPath = join(root, "candidate-site/acquisition-section.md");
    const htmlPath = join(root, "candidate-site/acquisition-section.html");
    writeFileSync(mdPath, md);
    writeFileSync(htmlPath, html);
    console.log(
      JSON.stringify(
        {
          wrote: [mdPath, htmlPath],
          previewHead: md.split("\n").slice(0, 8),
        },
        null,
        2,
      ),
    );
  } else if (cmd === "demo") {
    const inventory = loadJson(join(root, "fixtures/inventory.positive.json"));
    const listingCapture = loadListingCapture();
    const pkg = buildAcquisitionPackage({ inventory, listingCapture, clock });
    const outPath = "/tmp/nl-dist-03-acquisition.json";
    writeFileSync(outPath, JSON.stringify(pkg, null, 2));
    writeFileSync(join(root, "candidate-site/acquisition-section.md"), pkg.acquisitionSectionMd);
    writeFileSync(join(root, "candidate-site/acquisition-section.html"), renderAcquisitionSectionHtml({ listing: pkg.listing, budgetHandoff: pkg.budgetHandoff }));

    // Reject paid-without-confirmation (demo assertion print)
    let paidReject = null;
    try {
      buildAcquisitionPackage({
        inventory,
        listingCapture,
        confirmation: { markPaidReady: true, confirmed: false },
        clock,
      });
    } catch (err) {
      paidReject = { code: err.code, message: err.message };
    }

    let inventedReject = null;
    try {
      buildAcquisitionPackage({
        inventory,
        listingCapture: {
          ...listingCapture,
          observedUrl: "https://example.com/fake-listing",
        },
        clock,
      });
    } catch (err) {
      inventedReject = { code: err.code, message: err.message };
    }

    console.log(
      JSON.stringify(
        {
          schema: pkg.schema,
          listing: pkg.listing,
          readinessSteps: pkg.readiness.steps.map((s) => s.t),
          freeVsPriced: pkg.freeVsPriced.map((x) => ({ action: x.action, cost: x.cost })),
          budgetHandoff: pkg.budgetHandoff,
          paidReady: pkg.paidReady,
          packages: pkg.packages,
          mutationBoundary: pkg.mutationBoundary,
          wrotePackage: outPath,
          paidWithoutConfirmationRejected: paidReject,
          inventedUrlRejected: inventedReject,
        },
        null,
        2,
      ),
    );
  } else {
    usage();
  }
} catch (err) {
  console.error(
    JSON.stringify({
      error: err.code || "error",
      message: err.message,
      details: err.details || null,
    }),
  );
  process.exit(1);
}
