// Read-only probe of POST /api/checkout/seller-repair-session.
// An invalid finding id is rejected, or the route returns 503 before the allowlist.
// This module does not write the catalog or start a checkout.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  COLD_CLIENT_SELLER_REPAIR,
  INVALID_SELLER_FINDING_ID,
  SELLER_REPAIR_PIN,
} from "./handoff.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const CATALOG_PATHS = [
  "server/lib/seller-repair-checkout.js",
  "server/lib/pulse.js",
  "client/src/data/sellerRepairBriefs.ts",
];

function objectExists(rev) {
  try {
    execFileSync("git", ["cat-file", "-e", `${rev}^{commit}`], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function worktreeClean(paths) {
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", ...paths], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch (err) {
    if (err.status === 1) return false;
    throw err;
  }
}

export function catalogFileDigest() {
  const hash = createHash("sha256");
  for (const rel of CATALOG_PATHS) {
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(resolve(repoRoot, rel)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen(server.address().port));
  });
}

function close(server) {
  return new Promise((resolveClose, reject) => {
    server.close((err) => (err ? reject(err) : resolveClose()));
    server.closeAllConnections();
  });
}

async function postFinding(port, findingId) {
  const response = await fetch(`http://127.0.0.1:${port}/api/checkout/seller-repair-session`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ finding_id: findingId }),
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const redirected = response.status >= 300 && response.status < 400;
  const hasUrl = redirected || (typeof body?.url === "string" && body.url.length > 0);
  return {
    status: response.status,
    error: body && typeof body.error === "string" ? body.error : null,
    hasUrl,
  };
}

export async function observeSellerRepairCold() {
  const digestBefore = catalogFileDigest();
  const [
    { default: checkoutRouter },
    { isStripeConfigured },
    { isValidSellerRepairFindingId, SELLER_CONTRACT_REPAIR_SLUG },
    { sellerRepairFindingIds },
  ] = await Promise.all([
    import("../../../server/routes/checkout.js"),
    import("../../../server/lib/stripe.js"),
    import("../../../server/lib/seller-repair-checkout.js"),
    import("../../../server/lib/pulse.js"),
  ]);
  const catalogIds = [...sellerRepairFindingIds].sort();
  const catalogSha256 = createHash("sha256").update(catalogIds.join("\n")).digest("hex");
  const app = express();
  app.use(express.json());
  app.use("/api/checkout", checkoutRouter);
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const invalid = await postFinding(port, INVALID_SELLER_FINDING_ID);
    const stripeConfigured = isStripeConfigured();
    let gate = "unexpected";
    let comparedFindingId = null;
    let comparedFindingHttpStatus = null;
    let comparedFindingError = null;
    let comparedHasUrl = false;
    if (!stripeConfigured && invalid.status === 503 && invalid.error === "Payments not configured" && !invalid.hasUrl) {
      comparedFindingId = catalogIds[0] ?? null;
      if (comparedFindingId) {
        const compared = await postFinding(port, comparedFindingId);
        comparedFindingHttpStatus = compared.status;
        comparedFindingError = compared.error;
        comparedHasUrl = compared.hasUrl;
        if (compared.status === 503 && compared.error === "Payments not configured" && !compared.hasUrl) {
          gate = "503-before-allowlist";
        }
      }
    } else if (stripeConfigured && invalid.status === 400 && invalid.error === "Invalid finding ID" && !invalid.hasUrl) {
      gate = "allowlist-reject";
    }
    const digestAfter = catalogFileDigest();
    const catalogUntouched = digestBefore === digestAfter && worktreeClean(CATALOG_PATHS);
    return {
      access: "read-only",
      pin: SELLER_REPAIR_PIN,
      pinInClone: objectExists(SELLER_REPAIR_PIN),
      route: "POST /api/checkout/seller-repair-session",
      slug: SELLER_CONTRACT_REPAIR_SLUG,
      stripeConfigured,
      invalidFindingId: INVALID_SELLER_FINDING_ID,
      invalidFindingHttpStatus: invalid.status,
      invalidFindingError: invalid.error,
      allowlistRejectsUnknown: isValidSellerRepairFindingId(INVALID_SELLER_FINDING_ID) === false,
      findingIsSellerBrief: isValidSellerRepairFindingId("mcp.unknownTool") === true,
      gate,
      comparedFindingId,
      comparedFindingHttpStatus,
      comparedFindingError,
      comparedHasUrl,
      hasUrl: invalid.hasUrl || comparedHasUrl,
      catalogCount: catalogIds.length,
      catalogSha256,
      catalogFileSha256: digestAfter,
      catalogUntouched,
      catalogMutated: !catalogUntouched,
      coldCommand: COLD_CLIENT_SELLER_REPAIR,
    };
  } finally {
    await close(server);
  }
}
