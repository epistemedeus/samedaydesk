import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const transaction = /^0x[0-9a-f]{64}$/;
const wallet = /^0x[0-9a-f]{40}$/;
const digest = /^[0-9a-f]{64}$/;
const source = "Railway gateway settlement journal, exact transaction and route";
const ROUTES = {
  "/enrich": { tool: "enrich", what: "read public company and domain information" },
  "/wallet-enrich": { tool: "wallet_enrich", what: "inspect a public Base wallet or contract" },
  "/work/opportunity-preflight": { tool: "opportunity_preflight", what: "check an agent work listing" },
  "/distribution/agent-discoverability-audit": { tool: "agent_discoverability_audit", what: "check how agents find a service" },
  "/commerce/payment-offer-preflight": { tool: "payment_offer_preflight", what: "compare payment terms for a route" },
  "/commerce/settlement-proof": { tool: "settlement_proof", what: "verify an exact Base USDC settlement" },
  "/chain/transaction-receipt": { tool: "transaction_receipt", what: "inspect a transaction receipt" },
};
const hashWallet = (value) => createHash("sha256").update(value).digest("hex");

export function exclusionPolicy(hashes, references = []) {
  if (!Array.isArray(hashes) || hashes.some((x) => typeof x !== "string" || !digest.test(x)) ||
      !Array.isArray(references) || references.some((x) => typeof x !== "string" || !transaction.test(x))) {
    throw new Error("Invalid private receipts exclusion policy");
  }
  const deniedHashes = new Set(hashes);
  const deniedTransactions = new Set(references);
  return (address, hash) => deniedTransactions.has(hash) || typeof address === "string" &&
    wallet.test(address.toLowerCase()) && deniedHashes.has(hashWallet(address.toLowerCase()));
}

export function applyRouteExport(previous, input) {
  if (!Array.isArray(input?.rows) || input.invalid !== 0) throw new Error("Missing or incomplete settlement export");
  const seen = new Set();
  const internalTransactions = [];
  const joins = { ...previous.joins };
  const tools = { ...ROUTES, ...previous.tools };
  for (const row of input.rows) {
    if (!row || typeof row.transaction !== "string" || !transaction.test(row.transaction) ||
        typeof row.internal !== "boolean" || typeof row.route !== "string" || seen.has(row.transaction)) {
      throw new Error("Invalid or duplicate settlement export row");
    }
    seen.add(row.transaction);
    const existing = joins[row.transaction];
    if (existing && existing.route !== row.route) throw new Error("A settlement has conflicting route evidence");
    if (row.internal) {
      internalTransactions.push(row.transaction);
      delete joins[row.transaction];
    } else if (Object.hasOwn(tools, row.route) && !existing) {
      joins[row.transaction] = { route: row.route, source };
    }
  }
  return {
    routes: {
      ...previous, tools,
      joins: Object.fromEntries(Object.entries(joins).sort(([a], [b]) => a.localeCompare(b))),
    },
    exclude: exclusionPolicy(input.internalHashes, internalTransactions),
  };
}

// Update labels from the saved chain receipts without treating an offline
// reprojection as another chain read or claiming all gateway payments match it.
export function applySavedReceipts(previous, { routes, exclude }) {
  if (previous?.schema !== "samedaydesk.receipts.v2" || !Array.isArray(previous.entries)) {
    throw new Error("Expected an existing chain receipt snapshot");
  }
  let withheld = 0;
  const entries = previous.entries.flatMap((entry) => {
    if (entry.kind !== "settlement") return [entry];
    const reference = entry.chain?.transactionHash;
    if (!transaction.test(reference) || entry.proof !== `https://basescan.org/tx/${reference}` ||
        entry.chain.network !== "eip155:8453" || entry.chain.status !== "success") {
      throw new Error("Saved settlement lacks the expected chain evidence");
    }
    if (exclude(entry.payer?.address, reference)) {
      withheld += 1;
      return [];
    }
    const route = routes.joins[reference]?.route;
    if (!route || !Object.hasOwn(routes.tools, route)) return [entry];
    const { tool, what } = routes.tools[route];
    return [{ ...entry, delivered: `${tool}: ${what}`, tool: { route, name: tool, what } }];
  });
  const paid = entries.filter((entry) => entry.kind === "settlement");
  const independent = paid.filter((entry) => entry.payer?.class === "independent").length;
  return {
    ...previous,
    count: entries.length,
    entries,
    classes: {
      delivered: entries.length - paid.length,
      paidCalls: paid.length,
      distinctWallets: new Set(paid.map((entry) => entry.payer.address)).size,
      independent,
      unresolved: paid.length - independent,
      ourOwnWalletsLeftOut: (previous.classes.ourOwnWalletsLeftOut ?? 0) + withheld,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [exportPath, mode] = process.argv.slice(2);
  if (!exportPath || !["--check", "--write"].includes(mode)) {
    throw new Error("Usage: node scripts/receipts-route-projection.mjs <private-export.json> --check|--write");
  }
  const root = fileURLToPath(new URL("..", import.meta.url));
  const read = (file) => JSON.parse(readFileSync(file, "utf8"));
  const routeFile = resolve(root, "data/receipts/routes.json");
  const tape = resolve(root, "client/public/receipts.json");
  const tapeSource = resolve(root, "client/src/data/receipts.json");
  const projection = applyRouteExport(read(routeFile), read(exportPath));
  const prior = read(tape);
  const result = applySavedReceipts(prior, projection);
  if (result.count < result.floor) throw new Error("The projected receipt tape does not pass the display floor");
  if (mode === "--write") {
    writeFileSync(routeFile, JSON.stringify(projection.routes, null, 2) + "\n");
    const bytes = JSON.stringify(result, null, 2) + "\n";
    writeFileSync(tape, bytes);
    writeFileSync(tapeSource, bytes);
  }
  console.log(JSON.stringify({
    priorPaid: prior.classes.paidCalls, paid: result.classes.paidCalls,
    named: result.entries.filter((entry) => entry.kind === "settlement" && entry.tool).length,
    excludedAdditional: result.classes.ourOwnWalletsLeftOut - prior.classes.ourOwnWalletsLeftOut,
    savedBlock: result.chainReadThroughBlock,
  }));
}
