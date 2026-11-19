#!/usr/bin/env node
// Builds the tape of real settlements and delivered work (client/public/receipts.json) from
// receiving records, never by hand:
//   1. every x402 settlement received on Base at the gateway's payout address (on-chain, each
//      with its transaction link), read from a public Base RPC. Only EIP-3009
//      transferWithAuthorization calls count, the way an x402 facilitator settles; plain
//      transfers and smart-wallet sends cannot be attributed to a paid call and are left out;
//   2. delivered work with a public proof, from data/receipts/delivered.json, where each entry
//      names the receiving record it comes from.
// A named customer appears only when the work is public; otherwise the kind of buyer is named.
//   node scripts/build-receipts.mjs [--from-block N]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const RPC = process.env.BASE_RPC || "https://base-rpc.publicnode.com";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const FLOOR = 12;
const STEP = 9_999;
const fromArg = process.argv.indexOf("--from-block");
const FROM = fromArg > 0 ? Number(process.argv[fromArg + 1]) : 51_000_000;

async function rpc(method, params, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const body = await res.json();
      if (body.error) throw new Error(JSON.stringify(body.error));
      return body.result;
    } catch (error) {
      if (i === tries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

// Historical logs need an RPC that serves old ranges (publicnode does, 10,000 blocks a call).
// If it cannot be read, the build stops rather than shipping a thin tape.
const topicTo = "0x" + PAY_TO.slice(2).toLowerCase().padStart(64, "0");
const logs = [];
try {
  const head = parseInt(await rpc("eth_blockNumber", []), 16);
  for (let from = FROM; from <= head; from += STEP) {
    const to = Math.min(head, from + STEP - 1);
    logs.push(...await rpc("eth_getLogs", [{ address: USDC, topics: [TRANSFER, null, topicTo], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]));
  }
} catch (error) {
  console.error(`receipts: on-chain history unavailable from ${RPC} (${String(error.message).slice(0, 120)}). Set BASE_RPC to an endpoint that serves old log ranges.`);
  process.exit(1);
}
// transferWithAuthorization (v,r,s and bytes-signature forms): an x402 settlement.
const X402_SETTLE = new Set(["0xe3ee160e", "0xcf092995"]);
const settled = [];
for (const log of logs) {
  const tx = await rpc("eth_getTransactionByHash", [log.transactionHash]);
  const payer = "0x" + tx.input.slice(34, 74);
  if (tx.to?.toLowerCase() === USDC.toLowerCase() && X402_SETTLE.has(tx.input.slice(0, 10)) && payer !== PAY_TO.toLowerCase()) settled.push(log);
}
const times = new Map();
for (const block of [...new Set(settled.map((l) => l.blockNumber))]) {
  times.set(block, parseInt((await rpc("eth_getBlockByNumber", [block, false])).timestamp, 16) * 1000);
}
const settlements = settled.map((log) => {
  const units = BigInt(log.data);
  const usdc = Number(units) / 1e6;
  return {
    kind: "settlement",
    date: new Date(times.get(log.blockNumber)).toISOString().slice(0, 10),
    for: "a paid API call",
    delivered: "an answer from the SameDayDesk gateway",
    amount: `${usdc.toFixed(usdc < 0.01 ? 3 : 2)} USDC`,
    rail: "Base",
    paidHow: "x402, paid by the calling agent",
    proof: `https://basescan.org/tx/${log.transactionHash}`,
    source: "on-chain USDC transfer to the gateway payout address",
  };
});

const delivered = JSON.parse(readFileSync(`${root}/data/receipts/delivered.json`, "utf8")).entries;
const entries = [...delivered, ...settlements]
  .filter((e) => /^https:\/\//.test(e.proof))
  .sort((a, b) => b.date.localeCompare(a.date));
const out = {
  schema: "samedaydesk.receipts.v1",
  generatedAt: new Date().toISOString(),
  floor: FLOOR,
  payTo: PAY_TO,
  count: entries.length,
  entries,
};
writeFileSync(`${root}/client/public/receipts.json`, JSON.stringify(out, null, 2) + "\n");
// The same bytes, imported by the tape and /receipts at build time.
writeFileSync(`${root}/client/src/data/receipts.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`receipts: ${settlements.length} settlements (of ${logs.length} transfers in), ${delivered.length} delivered, ${entries.length} total (floor ${FLOOR})`);
if (entries.length < FLOOR) {
  console.error(`receipts: ${entries.length} entries is under the floor of ${FLOOR}; the tape would not show.`);
  process.exit(1);
}
