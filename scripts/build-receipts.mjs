#!/usr/bin/env node
// Builds the tape of real settlements and delivered work (client/public/receipts.json) from
// receiving records and the chain, never by hand:
//   1. every x402 settlement received on Base at the gateway's payout address, read from a public
//      Base RPC: the USDC Transfer log, the transferWithAuthorization call that made it (the way
//      an x402 facilitator settles), the block and its time. Plain transfers and smart-wallet
//      sends cannot be attributed to a paid call and are left out. Settlements before the log
//      scan's first block come from data/receipts/earlier-settlements.json, read by hash;
//   2. each payer classified from data/receipts/payers.json: project-controlled wallets are left
//      off, independent ones carry a short name for what they were, the rest are unresolved and
//      shown as their wallet with no claim about who they are;
//   3. the route a payment bought, where data/receipts/routes.json joins its transaction to a
//      receiving record;
//   4. delivered work with a public proof, from data/receipts/delivered.json, where each entry
//      names the receiving record it comes from.
// A named customer appears only when the work is public; otherwise the kind of buyer is named.
//   node scripts/build-receipts.mjs [--from-block N]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// Ranges of old logs need an RPC that serves them (publicnode does, 10,000 blocks a call); single
// transactions and blocks by hash or number are read from Base's own endpoint, which serves old ones.
const LOG_RPC = process.env.BASE_RPC || "https://base-rpc.publicnode.com";
const HASH_RPC = process.env.BASE_HASH_RPC || "https://mainnet.base.org";
// What a visitor runs to check a receipt: the public endpoint, one request, the same log back.
const CHECK_RPC = "https://mainnet.base.org";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const FLOOR = 12;
const STEP = 9_999;
const fromArg = process.argv.indexOf("--from-block");
const FROM = fromArg > 0 ? Number(process.argv[fromArg + 1]) : 51_000_000;
const read = (path) => JSON.parse(readFileSync(`${root}/${path}`, "utf8"));

async function rpc(url, method, params, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const body = await res.json();
      if (body.error) throw new Error(JSON.stringify(body.error));
      return body.result;
    } catch (error) {
      if (i === tries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

// One transaction, receipt or block: the log RPC first, Base's endpoint for what it will not serve.
const byHash = (method, params) => rpc(LOG_RPC, method, params, 2).catch(() => rpc(HASH_RPC, method, params));

// If the history cannot be read, the build stops rather than shipping a thin tape.
const topicTo = "0x" + PAY_TO.slice(2).toLowerCase().padStart(64, "0");
const logs = [];
let head;
try {
  head = parseInt(await rpc(LOG_RPC, "eth_blockNumber", []), 16);
  for (let from = FROM; from <= head; from += STEP) {
    const to = Math.min(head, from + STEP - 1);
    logs.push(...await rpc(LOG_RPC, "eth_getLogs", [{ address: USDC, topics: [TRANSFER, null, topicTo], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]));
  }
  for (const { hash } of read("data/receipts/earlier-settlements.json").transactions) {
    const receipt = await byHash("eth_getTransactionReceipt", [hash]);
    if (receipt?.status !== "0x1") throw new Error(`earlier settlement ${hash} has no successful receipt`);
    logs.push(...receipt.logs.filter((l) => l.address.toLowerCase() === USDC && l.topics[0] === TRANSFER && l.topics[2] === topicTo));
  }
} catch (error) {
  console.error(`receipts: on-chain history unavailable (${String(error.message).slice(0, 160)}). Set BASE_RPC to an endpoint that serves old log ranges.`);
  process.exit(1);
}

// transferWithAuthorization (v,r,s and bytes-signature forms): an x402 settlement. Both start
// with the same six words: from, to, value, validAfter, validBefore, nonce.
const X402_SETTLE = new Set(["0xe3ee160e", "0xcf092995"]);
const word = (input, i) => input.slice(10 + 64 * i, 10 + 64 * (i + 1));
const address = (w) => "0x" + w.slice(24);
const payers = read("data/receipts/payers.json");
const internal = new Set(payers.internal.map((p) => p.address.toLowerCase()));
const independent = new Map(payers.independent.map((p) => [p.address.toLowerCase(), p]));
const routes = read("data/receipts/routes.json");
const delivered = read("data/receipts/delivered.json").entries;
const deliveredTx = new Set(delivered.map((e) => e.proof.match(/\/tx\/(0x[0-9a-f]{64})/i)?.[1]?.toLowerCase()).filter(Boolean));
const blockTimes = new Map();
const blockTime = async (number) => {
  if (!blockTimes.has(number)) blockTimes.set(number, parseInt((await byHash("eth_getBlockByNumber", [number, false])).timestamp, 16));
  return blockTimes.get(number);
};

const builtAt = new Date().toISOString();
const settlements = [];
let left = { notSettlement: 0, internal: 0, duplicate: 0 };
const seen = new Set();
for (const log of logs) {
  const hash = log.transactionHash.toLowerCase();
  if (seen.has(`${hash}:${log.logIndex}`)) continue;
  seen.add(`${hash}:${log.logIndex}`);
  const [tx, receipt] = [await byHash("eth_getTransactionByHash", [hash]), await byHash("eth_getTransactionReceipt", [hash])];
  const selector = tx.input.slice(0, 10);
  if (tx.to?.toLowerCase() !== USDC || !X402_SETTLE.has(selector) || receipt.status !== "0x1") { left.notSettlement++; continue; }
  const from = address(word(tx.input, 0)).toLowerCase();
  if (from === PAY_TO.toLowerCase() || from !== address(log.topics[1].slice(2)).toLowerCase()) { left.notSettlement++; continue; }
  if (internal.has(from)) { left.internal++; continue; }
  if (deliveredTx.has(hash)) { left.duplicate++; continue; }
  const value = BigInt("0x" + word(tx.input, 2));
  const seconds = await blockTime(log.blockNumber);
  const iso = new Date(seconds * 1000).toISOString();
  const usdc = Number(value) / 1e6;
  const join = routes.joins[hash];
  const known = independent.get(from);
  settlements.push({
    kind: "settlement",
    date: iso.slice(0, 10),
    time: iso,
    for: "a paid call to the SameDayDesk gateway",
    delivered: join ? `${routes.tools[join.route].tool}: ${routes.tools[join.route].what}` : "an answer from the SameDayDesk gateway",
    amount: `${usdc.toFixed(usdc < 0.01 ? 3 : 2)} USDC`,
    rail: "Base",
    paidHow: "x402",
    payer: known
      ? { address: from, class: "independent", label: known.label, who: known.who }
      : { address: from, class: "unresolved" },
    tool: join ? { route: join.route, name: routes.tools[join.route].tool, what: routes.tools[join.route].what } : null,
    chain: {
      network: "eip155:8453",
      token: "USDC",
      tokenContract: USDC,
      method: "transferWithAuthorization",
      authorization: {
        from,
        to: address(word(tx.input, 1)).toLowerCase(),
        value: value.toString(),
        validAfter: BigInt("0x" + word(tx.input, 3)).toString(),
        validBefore: BigInt("0x" + word(tx.input, 4)).toString(),
        nonce: "0x" + word(tx.input, 5),
      },
      transactionHash: hash,
      blockNumber: parseInt(log.blockNumber, 16),
      blockTime: iso,
      logIndex: parseInt(log.logIndex, 16),
      submittedBy: tx.from.toLowerCase(),
      status: "success",
      verifiedAt: builtAt,
    },
    check: {
      rpc: CHECK_RPC,
      request: { jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] },
      expect: `a log at index ${parseInt(log.logIndex, 16)} (0x${parseInt(log.logIndex, 16).toString(16)}) from ${USDC}, its topics the Transfer event, the payer and the payout address (each padded to 32 bytes), and its data ending in ${value.toString(16)}, which is ${value} units or ${usdc} USDC`,
    },
    proof: `https://basescan.org/tx/${hash}`,
    source: "on-chain USDC transferWithAuthorization to the gateway payout address",
  });
}

const entries = [...delivered, ...settlements]
  .filter((e) => /^https:\/\//.test(e.proof))
  .sort((a, b) => (b.time ?? b.date).localeCompare(a.time ?? a.date));
const calls = settlements.length;
const out = {
  schema: "samedaydesk.receipts.v2",
  generatedAt: builtAt,
  chainReadThroughBlock: head,
  floor: FLOOR,
  payTo: PAY_TO,
  count: entries.length,
  classes: {
    delivered: delivered.length,
    paidCalls: calls,
    distinctWallets: new Set(settlements.map((s) => s.payer.address)).size,
    independent: settlements.filter((s) => s.payer.class === "independent").length,
    unresolved: settlements.filter((s) => s.payer.class === "unresolved").length,
    ourOwnWalletsLeftOut: left.internal,
  },
  method: "Each paid call is read from Base: the USDC Transfer to the payout address, made by a transferWithAuthorization call. Payers are classified from cited records; our own wallets are left out; unresolved payers are shown with no claim about who they are.",
  entries,
};
writeFileSync(`${root}/client/public/receipts.json`, JSON.stringify(out, null, 2) + "\n");
// The same bytes, imported by the tape and /receipts at build time.
writeFileSync(`${root}/client/src/data/receipts.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`receipts: ${calls} paid calls (${out.classes.independent} independent, ${out.classes.unresolved} unresolved; ${left.internal} from our own wallets and ${left.notSettlement} other transfers left out, ${left.duplicate} already delivered work) of ${logs.length} transfers in through block ${head}; ${delivered.length} delivered; ${entries.length} total (floor ${FLOOR})`);
if (entries.length < FLOOR) {
  console.error(`receipts: ${entries.length} entries is under the floor of ${FLOOR}; the tape would not show.`);
  process.exit(1);
}
