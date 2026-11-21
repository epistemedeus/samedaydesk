// Read-only verification of every published settlement against Base. No signing,
// wallet, transfer, retry, or change to the receipt tape.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(readFileSync(join(root, "client/public/receipts.json"), "utf8"));
const payers = JSON.parse(readFileSync(join(root, "data/receipts/payers.json"), "utf8"));
const endpoint = new URL(process.env.BASE_HASH_RPC || "https://mainnet.base.org");
if (endpoint.protocol !== "https:") throw new Error("An HTTPS Base RPC is required");
const token = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const word = (input, i) => input.slice(10 + 64 * i, 10 + 64 * (i + 1));
const address = (value) => "0x" + value.slice(-40).toLowerCase();
let sequence = 0;
async function rpc(method, params) {
  const response = await fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++sequence, method, params }) });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`RPC code ${body.error.code}`);
  assert.ok(body.result, `${method} returned no record`);
  return body.result;
}

const output = { source: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  verifierSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
  snapshotSha256: createHash("sha256").update(readFileSync(join(root, "client/public/receipts.json"))).digest("hex"),
  checkedAt: new Date().toISOString(), rpcOrigin: endpoint.origin, mode: "read only", rows: [],
  privatePolicyReceived: Boolean(process.env.RECEIPTS_PRIVATE_EXPORT), state: "failed" };
try {
  assert.equal(await rpc("eth_chainId", []), "0x2105");
  const finalized = await rpc("eth_getBlockByNumber", ["finalized", false]);
  const excluded = new Set(payers.internal.map((row) => row.address.toLowerCase()));
  let privateExcluded = () => false;
  if (process.env.RECEIPTS_PRIVATE_EXPORT) {
    const { applyRouteExport } = await import("./receipts-route-projection.mjs");
    const routes = JSON.parse(readFileSync(join(root, "data/receipts/routes.json"), "utf8"));
    const policy = JSON.parse(readFileSync(process.env.RECEIPTS_PRIVATE_EXPORT, "utf8"));
    privateExcluded = applyRouteExport(routes, policy).exclude;
  }
  const rows = snapshot.entries.filter((row) => row.kind === "settlement");
  for (const row of rows) {
    const hash = row.chain.transactionHash;
    const result = { transaction: hash, passed: false };
    try {
      assert.equal(excluded.has(row.payer.address.toLowerCase()), false, "project wallet was published");
      assert.equal(privateExcluded(row.payer.address, hash), false, "private project payer was published");
      assert.ok(row.tool?.name || !row.tool, "unknown tool must remain a Paid call");
      const receipt = await rpc("eth_getTransactionReceipt", [hash]);
      assert.equal(receipt.status, "0x1");
      assert.equal(parseInt(receipt.blockNumber, 16), row.chain.blockNumber);
      assert.ok(BigInt(receipt.blockNumber) <= BigInt(finalized.number), "settlement must be finalized");
      const log = receipt.logs.find((item) => parseInt(item.logIndex, 16) === row.chain.logIndex);
      assert.equal(log?.address.toLowerCase(), token);
      assert.equal(log.topics[0], transfer);
      assert.equal(address(log.topics[1]), row.payer.address.toLowerCase());
      assert.equal(address(log.topics[2]), snapshot.payTo.toLowerCase());
      assert.equal(BigInt(log.data).toString(), row.chain.authorization.value);
      const tx = await rpc("eth_getTransactionByHash", [hash]);
      assert.equal(tx.to.toLowerCase(), token);
      assert.ok(["0xe3ee160e", "0xcf092995"].includes(tx.input.slice(0, 10)), "authorization selector");
      assert.equal(address(word(tx.input, 0)), row.chain.authorization.from);
      assert.equal(address(word(tx.input, 1)), row.chain.authorization.to);
      for (const [index, field] of [[2, "value"], [3, "validAfter"], [4, "validBefore"]]) {
        assert.equal(BigInt("0x" + word(tx.input, index)).toString(), row.chain.authorization[field]);
      }
      assert.equal("0x" + word(tx.input, 5), row.chain.authorization.nonce);
      const block = await rpc("eth_getBlockByHash", [receipt.blockHash, false]);
      assert.equal(new Date(parseInt(block.timestamp, 16) * 1000).toISOString(), row.chain.blockTime);
      result.passed = true;
    } catch (error) { result.error = error.message.slice(0, 240); }
    output.rows.push(result);
    console.log(`${result.passed ? "passed" : "failed"} ${hash}${result.error ? `: ${result.error}` : ""}`);
  }
  output.state = output.rows.length === rows.length && output.rows.every((row) => row.passed) ? "passed" : "failed";
} catch (error) { output.error = error.message.slice(0, 240); }
mkdirSync(join(root, "release/out"), { recursive: true });
writeFileSync(join(root, "release/out/receipts-chain.json"), JSON.stringify(output, null, 2) + "\n");
console.log(`${output.state}: ${output.rows.filter(row => row.passed).length}/${output.rows.length} published settlements; private policy ${output.privatePolicyReceived ? "supplied" : "not supplied"}`);
process.exitCode = output.state === "passed" ? 0 : 1;
