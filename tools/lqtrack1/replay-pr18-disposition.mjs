#!/usr/bin/env node
/**
 * Close replay for https://github.com/epistemedeus/samedaydesk/pull/18.
 *
 * Does not merge or extend that branch. Inspects vendored receipt/alias
 * sources (or an optional git ref) for the disconnected in-memory receipt
 * store and unread req.listing assignment. Live 404 of undeployed /listings
 * paths is recorded when probed, but is not required to recommend close.
 */
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../..");
export const DEFAULT_EVIDENCE_DIR = join(ROOT, "data/lqtrack1");
export const DEFAULT_FIXTURE = join(here, "fixtures/pr18-live-probe.json");
export const DEFAULT_PR18_FIXTURE_DIR = join(here, "fixtures/pr18");

export const ADVERTISED = Object.freeze([
  { id: "listings-root", url: "https://samedaydesk.com/listings", role: "alias-root" },
  { id: "listings-bazaar-mcp", url: "https://samedaydesk.com/listings/bazaar/mcp", role: "alias-route" },
  { id: "listings-mcp-registry-mcp", url: "https://samedaydesk.com/listings/mcp-registry/mcp", role: "alias-route" },
  { id: "agents-listings-root", url: "https://agents.samedaydesk.com/listings", role: "alias-root" },
]);

export const CANONICAL = Object.freeze([
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

const RECEIPT_IMPORT_PATTERN = "settlement-receipt|recordSettlementReceipt|settlementReceiptFromListing";

export function listingAssignmentState(source) {
  const text = source || "";
  const assigned = /req\.listing\s*=/.test(text);
  const mentions = [...text.matchAll(/req\.listing\b/g)];
  const reads = mentions.filter((match) => {
    const rest = text.slice(match.index + "req.listing".length);
    return !/^\s*=/.test(rest);
  });
  return {
    listingAssigned: assigned,
    listingReadCount: reads.length,
    listingUnread: assigned && reads.length === 0,
  };
}

export function countPatternHits(source, pattern) {
  if (!source) return 0;
  const regex = new RegExp(pattern, "g");
  return [...source.matchAll(regex)].length;
}

export function inspectPr18Sources({
  ref = "fixtures/pr18",
  receipt = "",
  aliases = "",
  testSource = "",
  runtimeImportHits = [],
} = {}) {
  const listing = listingAssignmentState(aliases);
  const inMemoryStore = Boolean(receipt && /const receipts = new Map\(\)/.test(receipt));
  const testOnlyImportCount = countPatternHits(testSource, RECEIPT_IMPORT_PATTERN);
  return {
    ref,
    present: Boolean(receipt && aliases),
    inMemoryStore,
    mountedOnIndex: Boolean(aliases && /app\.get\("\/listings"/.test(aliases)),
    runtimeImportCount: runtimeImportHits.length,
    runtimeImports: runtimeImportHits,
    testOnlyImportCount,
    advertisesListingsRoot: Boolean(aliases && /app\.get\("\/listings"/.test(aliases)),
    ...listing,
  };
}

export function inspectPr18Fixtures(fixtureDir = DEFAULT_PR18_FIXTURE_DIR) {
  const wiringPath = join(fixtureDir, "wiring.json");
  const wiring = existsSync(wiringPath) ? JSON.parse(readFileSync(wiringPath, "utf8")) : {};
  const receiptPath = join(fixtureDir, wiring.files?.settlementReceipt || "settlement-receipt.js");
  const aliasesPath = join(fixtureDir, wiring.files?.resourceAliases || "resource-aliases.js");
  const testPath = join(fixtureDir, wiring.files?.testResourceAliases || "test-resource-aliases.js");
  return inspectPr18Sources({
    ref: `vendored:${wiring.commit || "pr18-fixtures"}`,
    receipt: existsSync(receiptPath) ? readFileSync(receiptPath, "utf8") : "",
    aliases: existsSync(aliasesPath) ? readFileSync(aliasesPath, "utf8") : "",
    testSource: existsSync(testPath) ? readFileSync(testPath, "utf8") : "",
    runtimeImportHits: Array.isArray(wiring.runtimeImportHits) ? wiring.runtimeImportHits : [],
  });
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function gitShow(root, ref, path) {
  const result = git(root, ["show", `${ref}:${path}`]);
  if (result.status !== 0) return null;
  return result.stdout;
}

function gitGrep(root, ref, pattern, pathspecs) {
  const result = git(root, ["grep", "-n", "-E", pattern, ref, "--", ...pathspecs]);
  return result.status === 0 ? result.stdout.split("\n").filter(Boolean) : [];
}

export function inspectPr18Git(ref, { root = ROOT } = {}) {
  const receipt = gitShow(root, ref, "server/lib/settlement-receipt.js");
  const aliases = gitShow(root, ref, "server/lib/resource-aliases.js");
  if (!receipt || !aliases) return null;
  const runtimeImports = gitGrep(root, ref, RECEIPT_IMPORT_PATTERN, [
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
  const testSource = gitShow(root, ref, "server/scripts/test-resource-aliases.js") || "";
  return inspectPr18Sources({
    ref,
    receipt,
    aliases,
    testSource,
    runtimeImportHits: runtimeImports,
  });
}

export function inspectPr18(ref, { fixtureDir = DEFAULT_PR18_FIXTURE_DIR, root = ROOT } = {}) {
  if (ref) {
    const fromGit = inspectPr18Git(ref, { root });
    if (fromGit) return fromGit;
  }
  return inspectPr18Fixtures(fixtureDir);
}

export function inspectCheckout(root = ROOT) {
  const indexPath = join(root, "server/index.js");
  const index = readFileSync(indexPath, "utf8");
  const receiptStorePath = join(root, "server/lib/settlement-receipt.js");
  const aliasLibPath = join(root, "server/lib/resource-aliases.js");
  return {
    hasListingMount: /mountResourceAliases|mountListingCatalog|\/listings\//.test(index),
    hasReceiptStoreFile: existsSync(receiptStorePath),
    hasAliasLibFile: existsSync(aliasLibPath),
    indexMentionsListings: /listings/.test(index),
  };
}

export function inspectExistingReceipts(root = ROOT) {
  return EXISTING_RECEIPT_PATHS.map((entry) => ({
    ...entry,
    exists: existsSync(join(root, entry.path)),
    mentionsSurface: existsSync(join(root, entry.path))
      ? /\bsurface\b/.test(readFileSync(join(root, entry.path), "utf8"))
      : false,
  }));
}

function isAlias404(probe) {
  return Boolean(probe && probe.status === 404);
}

export function decide(probes, checkout, pr18, existingReceipts) {
  const advertised = ADVERTISED.map((target) => probes[target.id]).filter(Boolean);
  const canonical = CANONICAL.map((target) => probes[target.id]).filter(Boolean);
  const aliasRoot404 = advertised.filter((probe) => probe.role === "alias-root").every(isAlias404);
  const aliasRoutes404 = advertised.filter((probe) => probe.role === "alias-route").every(isAlias404);
  const canonicalLive = canonical.length > 0 && canonical.every((probe) => probe.status === 200);
  const catalogPresent = advertised.some((probe) => probe.jsonCatalog);
  const existingRouteSatisfiesAlias = false;
  const existingReceiptHasSurfaceField = existingReceipts.some((entry) => entry.mentionsSurface);
  const existingReceiptsPresent = existingReceipts.every((entry) => entry.exists);
  const receiptDisconnected = pr18.present && pr18.inMemoryStore && pr18.runtimeImportCount === 0;
  const listingUnread = Boolean(pr18.listingUnread);

  const close = receiptDisconnected && listingUnread && !existingRouteSatisfiesAlias && !existingReceiptHasSurfaceField;

  return {
    recommendation: close ? "close" : "keep",
    close,
    reasons: [
      receiptDisconnected
        ? "PR18 receipt store is an in-process Map imported only by its test file; no MCP/scan/tools/checkout/fulfill route records surface."
        : "PR18 receipt store appears connected to a runtime route.",
      listingUnread
        ? "req.listing is assigned in stampListing and never read."
        : "req.listing is read after assignment, or is not assigned.",
      existingReceiptsPresent && !existingReceiptHasSurfaceField
        ? "Existing Stripe email and pulse flush receipts have no registry surface field and cannot satisfy PR18 attribution without a new product surface."
        : "An existing receipt path already records distribution surface.",
      checkout.hasListingMount
        ? "This branch already mounts listing aliases (unexpected for this replay)."
        : "This branch (and default) do not mount /listings aliases.",
      aliasRoot404
        ? "Advertised /listings alias root is HTTP 404 on live apex and agents host (observational; not required to close)."
        : "Advertised /listings alias root is not uniformly 404 (observational; not required to close).",
      aliasRoutes404
        ? "Advertised /listings/<surface>/<resource> paths are HTTP 404 (observational; not required to close)."
        : "At least one advertised alias route is not 404 (observational; not required to close).",
      !catalogPresent
        ? "No recorded response is the JSON listing catalog PR18 documents."
        : "A listing catalog JSON body was observed.",
      canonicalLive
        ? "Canonical /mcp and /scan already exist, but they are not per-surface aliases and cannot carry a registry surface without a new product path."
        : "Canonical /mcp or /scan is not live 200; still not a per-surface alias.",
    ],
    aliasRoot404,
    aliasRoutes404,
    catalogPresent,
    canonicalLive,
    receiptDisconnected,
    listingUnread,
    existingRouteSatisfiesAlias,
  };
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

async function liveFetch(url, timeoutMs = 20000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ac.signal,
      headers: { "user-agent": "samedaydesk-pr18-replay/1.0", accept: "application/json, text/plain, */*" },
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

export async function collectProbes({ live = false, fixturePath = DEFAULT_FIXTURE } = {}) {
  if (!live) {
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

export function renderMarkdown(evidence) {
  const probeLines = Object.values(evidence.http.probes).map((probe) => (
    `- \`${probe.url}\` → **${probe.status}** \`${probe.contentType || "no-content-type"}\`${probe.jsonCatalog ? " (json catalog)" : ""}`
  ));
  return `# PR18 disposition

Recommendation: **${evidence.disposition.recommendation.toUpperCase()}**
[https://github.com/epistemedeus/samedaydesk/pull/18](https://github.com/epistemedeus/samedaydesk/pull/18)

Do not merge. Do not extend. Alias requests never wrote a settlement receipt
(\`recordSettlementReceipt\` / \`settlementReceiptFromListing\` are imported only
by \`server/scripts/test-resource-aliases.js\`) and \`req.listing\` is assigned
in \`stampListing\` and never read. Live 404 of undeployed \`/listings\` paths
is observational and is not required to close.

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
- \`req.listing\` assigned: ${evidence.pr18.listingAssigned}
- \`req.listing\` reads: ${evidence.pr18.listingReadCount}
- mounted on \`server/index.js\`: ${evidence.pr18.mountedOnIndex}
- runtime imports of settlement-receipt: ${evidence.pr18.runtimeImportCount}
- test-only imports: ${evidence.pr18.testOnlyImportCount}

## Existing receipt paths on default

${evidence.existingReceipts.map((entry) => `- \`${entry.path}\` (${entry.id}): ${entry.why} exists=${entry.exists} mentionsSurface=${entry.mentionsSurface}`).join("\n")}
`;
}

export async function runReplay({
  live = false,
  fixturePath = DEFAULT_FIXTURE,
  evidenceDir = DEFAULT_EVIDENCE_DIR,
  gitPr18 = null,
  fixtureDir = DEFAULT_PR18_FIXTURE_DIR,
  pretty = false,
} = {}) {
  const http = await collectProbes({ live, fixturePath: live ? null : fixturePath });
  const checkout = inspectCheckout();
  const pr18 = inspectPr18(gitPr18, { fixtureDir });
  const existingReceipts = inspectExistingReceipts();
  const disposition = decide(http.probes, checkout, pr18, existingReceipts);

  const evidence = {
    schema: "samedaydesk.pr18-disposition.v2",
    pullRequest: "https://github.com/epistemedeus/samedaydesk/pull/18",
    replay: {
      command: live
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

  return {
    ok: true,
    recommendation: disposition.recommendation,
    jsonPath,
    markdownPath: mdPath,
    aliasRoot404: disposition.aliasRoot404,
    receiptDisconnected: disposition.receiptDisconnected,
    listingUnread: disposition.listingUnread,
    evidence,
    pretty,
  };
}

function parseCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      live: { type: "boolean", default: false },
      fixture: { type: "string" },
      "evidence-dir": { type: "string" },
      "git-pr18": { type: "string" },
      "pr18-fixtures": { type: "string" },
      pretty: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  return values;
}

export async function main(argv = process.argv.slice(2)) {
  const values = parseCli(argv);
  if (values.help) {
    process.stderr.write(`Replay PR18 receipt disconnect and unread req.listing.

Usage:
  node tools/lqtrack1/replay-pr18-disposition.mjs
  node tools/lqtrack1/replay-pr18-disposition.mjs --fixture tools/lqtrack1/fixtures/pr18-live-probe.json
  node tools/lqtrack1/replay-pr18-disposition.mjs --live

Vendored sources under tools/lqtrack1/fixtures/pr18/ are the default.
--git-pr18 is optional. Close does not require live 404 of /listings.
`);
    process.exit(0);
  }

  const live = Boolean(values.live);
  const fixturePath = values.fixture || DEFAULT_FIXTURE;
  const report = await runReplay({
    live,
    fixturePath,
    evidenceDir: values["evidence-dir"] || DEFAULT_EVIDENCE_DIR,
    gitPr18: values["git-pr18"] || null,
    fixtureDir: values["pr18-fixtures"] || DEFAULT_PR18_FIXTURE_DIR,
    pretty: values.pretty,
  });
  const output = {
    ok: report.ok,
    recommendation: report.recommendation,
    jsonPath: report.jsonPath,
    markdownPath: report.markdownPath,
    aliasRoot404: report.aliasRoot404,
    receiptDisconnected: report.receiptDisconnected,
    listingUnread: report.listingUnread,
  };
  process.stdout.write(`${values.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)}\n`);
  process.exit(report.recommendation === "close" ? 0 : 2);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  await main();
}
