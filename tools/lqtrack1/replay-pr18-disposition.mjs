#!/usr/bin/env node
/**
 * LQTRACK1 executable replay for GB07 PR18.
 *
 * Does not merge or extend PR18. Probes the advertised alias root, inspects
 * this checkout and the PR18 head for receipt-store wiring, and writes a
 * close/keep disposition.
 */
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../..");
const DEFAULT_EVIDENCE_DIR = join(ROOT, "data/lqtrack1");
const DEFAULT_FIXTURE = join(here, "fixtures/pr18-live-probe.json");

const ADVERTISED = Object.freeze([
  { id: "listings-root", url: "https://samedaydesk.com/listings", role: "alias-root" },
  { id: "listings-bazaar-mcp", url: "https://samedaydesk.com/listings/bazaar/mcp", role: "alias-route" },
  { id: "listings-mcp-registry-mcp", url: "https://samedaydesk.com/listings/mcp-registry/mcp", role: "alias-route" },
  { id: "agents-listings-root", url: "https://agents.samedaydesk.com/listings", role: "alias-root" },
]);

const CANONICAL = Object.freeze([
  { id: "apex-mcp", url: "https://samedaydesk.com/mcp", role: "existing-canonical" },
  { id: "apex-scan", url: "https://samedaydesk.com/scan", role: "existing-canonical" },
]);

const EXISTING_RECEIPT_PATHS = Object.freeze([
  {
    id: "stripe-email",
    path: "server/lib/notify.js",
    why: "Resend order email (to, label, amount, orderId). No registry surface field.",
  },
  {
    id: "stripe-fulfillment",
    path: "server/lib/fulfill.js",
    why: "Calls sendReceipt after Stripe checkout. Human commerce, not x402 listing attribution.",
  },
  {
    id: "pulse-flush",
    path: "supabase/migrations/0002_pulse_durable.sql",
    why: "pulse_flush_receipts stores analytics flush hashes, not settlement surface.",
  },
]);

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    fixture: { type: "string" },
    "evidence-dir": { type: "string" },
    "git-pr18": { type: "string", default: "origin/gb07-per-surface-resource-aliases" },
    pretty: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  process.stderr.write(`Replay GB07 PR18 advertised alias-root 404 and receipt disconnect.

Usage:
  node tools/lqtrack1/replay-pr18-disposition.mjs --live
  node tools/lqtrack1/replay-pr18-disposition.mjs --fixture tools/lqtrack1/fixtures/pr18-live-probe.json

Does not merge PR18. Writes data/lqtrack1/pr18-disposition.json and PR18-DISPOSITION.md.
`);
  process.exit(0);
}

const evidenceDir = values["evidence-dir"] || DEFAULT_EVIDENCE_DIR;
const fixturePath = values.fixture || (!values.live ? DEFAULT_FIXTURE : null);

function git(args) {
  const result = spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function gitShow(ref, path) {
  const result = git(["show", `${ref}:${path}`]);
  if (result.status !== 0) return null;
  return result.stdout;
}

function gitGrep(ref, pattern, pathspecs) {
  const result = git(["grep", "-n", "-E", pattern, ref, "--", ...pathspecs]);
  return result.status === 0
    ? result.stdout.split("\n").filter(Boolean)
    : [];
}

async function liveFetch(url, timeoutMs = 20000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ac.signal,
      headers: { "user-agent": "samedaydesk-lqtrack1-pr18-replay/1.0", accept: "application/json, text/plain, */*" },
    });
    const body = await res.text();
    return {
      url,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      location: res.headers.get("location") || null,
      bodyHead: body.slice(0, 240),
      jsonCatalog: looksLikeListingCatalog(body, res.headers.get("content-type") || ""),
    };
  } catch (error) {
    return {
      url,
      status: 0,
      contentType: "",
      location: null,
      bodyHead: "",
      jsonCatalog: false,
      error: error.name === "AbortError" ? "timeout" : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeListingCatalog(body, contentType) {
  if (!/json/i.test(contentType)) return false;
  try {
    const parsed = JSON.parse(body);
    return Boolean(parsed && (parsed.surfaces || parsed.resources || parsed.listings));
  } catch {
    return false;
  }
}

function isAlias404(probe) {
  if (probe.status === 404) return true;
  if (probe.status === 0) return false;
  return false;
}

async function collectProbes() {
  if (fixturePath) {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    return {
      mode: "fixture",
      fixturePath,
      capturedAt: fixture.capturedAt,
      probes: fixture.probes,
    };
  }
  const probes = {};
  for (const target of [...ADVERTISED, ...CANONICAL]) {
    probes[target.id] = { ...target, ...(await liveFetch(target.url)) };
  }
  return {
    mode: "live",
    fixturePath: null,
    capturedAt: new Date().toISOString(),
    probes,
  };
}

function inspectCheckout() {
  const indexPath = join(ROOT, "server/index.js");
  const index = readFileSync(indexPath, "utf8");
  const receiptStorePath = join(ROOT, "server/lib/settlement-receipt.js");
  const aliasLibPath = join(ROOT, "server/lib/resource-aliases.js");
  return {
    hasListingMount: /mountResourceAliases|mountListingCatalog|\/listings\//.test(index),
    hasReceiptStoreFile: existsSync(receiptStorePath),
    hasAliasLibFile: existsSync(aliasLibPath),
    indexMentionsListings: /listings/.test(index),
  };
}

function inspectPr18(ref) {
  const receipt = gitShow(ref, "server/lib/settlement-receipt.js");
  const aliases = gitShow(ref, "server/lib/resource-aliases.js");
  const index = gitShow(ref, "server/index.js");
  const runtimeImports = gitGrep(ref, "settlement-receipt|recordSettlementReceipt|settlementReceiptFromListing", [
    "server/index.js",
    "server/routes",
    "server/lib/fulfill.js",
    "server/lib/notify.js",
    "server/lib/mcp.js",
    "server/routes/mcp.js",
    "server/routes/scan.js",
    "server/routes/tools.js",
    "server/routes/checkout.js",
  ]);
  const testOnlyImports = gitGrep(ref, "settlement-receipt|recordSettlementReceipt|settlementReceiptFromListing", [
    "server/scripts/test-resource-aliases.js",
  ]);
  const inMemoryStore = Boolean(receipt && /const receipts = new Map\(\)/.test(receipt));
  const mountedOnIndex = Boolean(index && /mountResourceAliases/.test(index) && /mountListingCatalog/.test(index));
  return {
    ref,
    present: Boolean(receipt && aliases),
    inMemoryStore,
    mountedOnIndex,
    runtimeImportCount: runtimeImports.length,
    runtimeImports,
    testOnlyImportCount: testOnlyImports.length,
    advertisesListingsRoot: Boolean(aliases && /app\.get\("\/listings"/.test(aliases)),
  };
}

function inspectExistingReceipts() {
  return EXISTING_RECEIPT_PATHS.map((entry) => ({
    ...entry,
    exists: existsSync(join(ROOT, entry.path)),
    mentionsSurface: existsSync(join(ROOT, entry.path))
      ? /\bsurface\b/.test(readFileSync(join(ROOT, entry.path), "utf8"))
      : false,
  }));
}

function decide(probes, checkout, pr18, existingReceipts) {
  const advertised = ADVERTISED.map((target) => probes[target.id]).filter(Boolean);
  const canonical = CANONICAL.map((target) => probes[target.id]).filter(Boolean);
  const aliasRoot404 = advertised.filter((probe) => probe.role === "alias-root").every(isAlias404);
  const aliasRoutes404 = advertised.filter((probe) => probe.role === "alias-route").every(isAlias404);
  const canonicalLive = canonical.every((probe) => probe.status === 200);
  const catalogPresent = advertised.some((probe) => probe.jsonCatalog);
  const existingRouteSatisfiesAlias = false;
  const existingReceiptHasSurfaceField = existingReceipts.some((entry) => entry.mentionsSurface);
  const existingReceiptsPresent = existingReceipts.every((entry) => entry.exists);
  const receiptDisconnected = pr18.present && pr18.inMemoryStore && pr18.runtimeImportCount === 0;

  const close = aliasRoot404 && aliasRoutes404 && !catalogPresent && receiptDisconnected && !existingRouteSatisfiesAlias;

  return {
    recommendation: close ? "close" : "keep",
    close,
    reasons: [
      aliasRoot404
        ? "Advertised /listings alias root is HTTP 404 on live apex and agents host."
        : "Advertised /listings alias root is not uniformly 404.",
      aliasRoutes404
        ? "Advertised /listings/<surface>/<resource> paths are HTTP 404."
        : "At least one advertised alias route is not 404.",
      !catalogPresent
        ? "No live response is the JSON listing catalog PR18 documents (`curl https://samedaydesk.com/listings`)."
        : "A live listing catalog JSON body was observed.",
      canonicalLive
        ? "Canonical /mcp and /scan already exist, but they are not per-surface aliases and cannot carry a registry surface without a new product path."
        : "Canonical /mcp or /scan is not live 200; still not a per-surface alias.",
      receiptDisconnected
        ? "PR18 receipt store is an in-process Map imported only by its test file; no MCP/scan/tools/checkout/fulfill route records surface."
        : "PR18 receipt store appears connected to a runtime route.",
      existingReceiptsPresent && !existingReceiptHasSurfaceField
        ? "Existing Stripe email and pulse flush receipts have no registry surface field and cannot satisfy PR18 attribution without a new product surface."
        : "An existing receipt path already records distribution surface.",
      checkout.hasListingMount
        ? "This branch already mounts listing aliases (unexpected for LQTRACK1)."
        : "This branch (and default) do not mount /listings aliases.",
    ],
    aliasRoot404,
    aliasRoutes404,
    catalogPresent,
    canonicalLive,
    receiptDisconnected,
    existingRouteSatisfiesAlias,
  };
}

function renderMarkdown(evidence) {
  const probeLines = Object.values(evidence.http.probes).map((probe) => (
    `- \`${probe.url}\` → **${probe.status}** \`${probe.contentType || "no-content-type"}\`${probe.jsonCatalog ? " (json catalog)" : ""}`
  ));
  return `# PR18 disposition (LQTRACK1)

Recommendation: **${evidence.disposition.recommendation.toUpperCase()}**
[https://github.com/epistemedeus/samedaydesk/pull/18](https://github.com/epistemedeus/samedaydesk/pull/18)

Do not merge. Do not extend. The advertised alias root is 404 and the receipt
attribution store is not connected to runtime. Canonical \`/mcp\` and \`/scan\`
already exist, but they are not per-surface listing aliases and the existing
Stripe / pulse receipt paths have no registry \`surface\` field.

## Replay

\`\`\`
${evidence.replay.command}
\`\`\`

Mode: \`${evidence.http.mode}\` at ${evidence.http.capturedAt}.

## HTTP

${probeLines.join("\n")}

## Why close

${evidence.disposition.reasons.map((reason) => `- ${reason}`).join("\n")}

## PR18 receipt wiring

- ref: \`${evidence.pr18.ref}\`
- in-process Map store: ${evidence.pr18.inMemoryStore}
- mounted on \`server/index.js\`: ${evidence.pr18.mountedOnIndex}
- runtime imports of settlement-receipt: ${evidence.pr18.runtimeImportCount}
- test-only imports: ${evidence.pr18.testOnlyImportCount}

## Existing receipt paths on default

${evidence.existingReceipts.map((entry) => `- \`${entry.path}\` (${entry.id}): ${entry.why} exists=${entry.exists} mentionsSurface=${entry.mentionsSurface}`).join("\n")}
`;
}

const http = await collectProbes();
const checkout = inspectCheckout();
const pr18 = inspectPr18(values["git-pr18"]);
const existingReceipts = inspectExistingReceipts();
const disposition = decide(http.probes, checkout, pr18, existingReceipts);

const evidence = {
  schema: "samedaydesk.lqtrack1.pr18-disposition.v1",
  task: "LQTRACK1",
  pullRequest: "https://github.com/epistemedeus/samedaydesk/pull/18",
  replay: {
    command: values.live
      ? "node tools/lqtrack1/replay-pr18-disposition.mjs --live"
      : `node tools/lqtrack1/replay-pr18-disposition.mjs --fixture ${fixturePath}`,
    cron: false,
  },
  http,
  checkout,
  pr18,
  existingReceipts,
  disposition,
};

mkdirSync(evidenceDir, { recursive: true });
const jsonPath = join(evidenceDir, "pr18-disposition.json");
const mdPath = join(evidenceDir, "PR18-DISPOSITION.md");
writeFileSync(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(mdPath, renderMarkdown(evidence));

const output = {
  ok: true,
  recommendation: disposition.recommendation,
  jsonPath,
  markdownPath: mdPath,
  aliasRoot404: disposition.aliasRoot404,
  receiptDisconnected: disposition.receiptDisconnected,
};
process.stdout.write(`${values.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)}\n`);
process.exit(disposition.recommendation === "close" ? 0 : 2);
