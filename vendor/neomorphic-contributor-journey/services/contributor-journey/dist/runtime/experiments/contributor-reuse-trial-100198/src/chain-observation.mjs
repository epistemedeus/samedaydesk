import { OFFER_ID, REWARD } from "./constants.mjs";
import { NATIVE_USDC } from "./settlement-state.mjs";
import {
  TRANSFER_TOPIC,
  assessSettlement,
  normalizeTime,
  unitsToDecimal,
} from "../../../src/lib/reward-receiving/settlement.mjs";
import { H15_KNOWN_TX } from "../../../src/lib/reward-receiving/evidence.mjs";

export const OBSERVE_TIMEOUT_MS = 8000;
export const OBSERVE_MAX_BYTES = 262144;
export const BASE_CHAIN_ID = 8453n;
const LOG_CAP = 64;
const TX = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;

export function normalizeAddress(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  return ADDRESS.test(text) ? text : null;
}

export function rpcUrlAllowed(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol !== "http:") return false;
  return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
}

function hexQuantity(value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function topicAddress(topic) {
  if (typeof topic !== "string" || !/^0x[0-9a-f]{64}$/i.test(topic)) return null;
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

function failed(code, message) {
  return { ok: false, code, message };
}

async function readBody(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) return { ok: false, code: "bounded_read" };
    return { ok: true, text };
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, code: "bounded_read" };
    }
    chunks.push(value);
  }
  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

async function rpcCall(fetchImpl, rpcUrl, method, params, timeoutMs, maxBytes) {
  let response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  } catch (error) {
    const name = error?.name;
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return failed("unavailable", timedOut ? "base rpc timed out" : "base rpc unavailable");
  }
  if (response.status !== 200) {
    await response.body?.cancel?.().catch(() => {});
    return failed("unavailable", "base rpc status was not readable");
  }
  let body;
  try {
    body = await readBody(response, maxBytes);
  } catch {
    return failed("unavailable", "base rpc body was unavailable");
  }
  if (!body.ok) return failed("unavailable", "base rpc response exceeds the read bound");
  let parsed;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return failed("unavailable", "base rpc response was not json");
  }
  if (!parsed || parsed.error || !Object.prototype.hasOwnProperty.call(parsed, "result")) {
    return failed("unavailable", "base rpc response was incomplete");
  }
  return { ok: true, result: parsed.result };
}

function canonicalReceipt(fields) {
  return {
    network: "base",
    asset: "USDC",
    tokenContract: NATIVE_USDC,
    transactionHash: fields.transactionHash,
    blockNumber: fields.blockNumber,
    blockHash: fields.blockHash,
    logIndex: fields.logIndex,
    timestamp: fields.timestamp,
    status: "success",
    transferCount: 1,
    amount: fields.amount,
    amountBaseUnits: fields.amountBaseUnits,
    addressesIncluded: false,
  };
}

/**
 * Read-only Base observation. Fetches the transaction and its receipt.
 * Does not sign, broadcast, or treat a caller JSON verified flag as proof.
 */
export async function observeBaseTransfer(txHash, options = {}) {
  const requested = typeof txHash === "string" ? txHash.toLowerCase() : "";
  if (!TX.test(requested)) return failed("malformed", "transaction hash");
  const rpcUrl = options.rpcUrl;
  if (!rpcUrlAllowed(rpcUrl)) return failed("rpc_unconfigured", "base rpc is not configured");
  const timeoutMs = options.timeoutMs ?? OBSERVE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? OBSERVE_MAX_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > OBSERVE_TIMEOUT_MS) {
    return failed("malformed", "observe timeout");
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > OBSERVE_MAX_BYTES) {
    return failed("malformed", "observe read bound");
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const call = (method, params) => rpcCall(fetchImpl, rpcUrl, method, params, timeoutMs, maxBytes);

  const chain = await call("eth_chainId", []);
  if (!chain.ok) return chain;
  const chainId = hexQuantity(chain.result);
  if (chainId == null) return failed("partial", "chain id was not readable");
  if (chainId !== BASE_CHAIN_ID) return failed("network_mismatch", "rpc is not Base mainnet");

  const txCall = await call("eth_getTransactionByHash", [requested]);
  if (!txCall.ok) return txCall;
  const receiptCall = await call("eth_getTransactionReceipt", [requested]);
  if (!receiptCall.ok) return receiptCall;
  const tx = txCall.result;
  const receipt = receiptCall.result;
  if (!tx || !receipt) return failed("receipt_missing", "base transaction or receipt is missing");
  const txHashObserved = typeof tx.hash === "string" ? tx.hash.toLowerCase() : "";
  const receiptHash = typeof receipt.transactionHash === "string" ? receipt.transactionHash.toLowerCase() : "";
  if (txHashObserved !== requested || receiptHash !== requested) {
    return failed("transaction_mismatch", "transaction hash does not match the receipt");
  }
  const transactionFrom = normalizeAddress(tx.from);
  if (!transactionFrom) return failed("partial", "transaction source was not readable");
  if (receipt.status !== "0x1") return failed("reverted", "base receipt was not successful");

  const blockNumber = hexQuantity(receipt.blockNumber);
  if (blockNumber == null || blockNumber > BigInt(Number.MAX_SAFE_INTEGER)) {
    return failed("partial", "block number was not readable");
  }
  const blockCall = await call("eth_getBlockByNumber", [receipt.blockNumber, false]);
  if (!blockCall.ok) return blockCall;
  const block = blockCall.result;
  const blockStamp = hexQuantity(block?.timestamp);
  if (!block || blockStamp == null) return failed("partial", "block timestamp was not readable");
  const blockHash = typeof block.hash === "string" ? block.hash.toLowerCase() : "";
  if (!TX.test(blockHash) || block.number !== receipt.blockNumber || receipt.blockHash?.toLowerCase() !== blockHash
    || tx.blockHash?.toLowerCase() !== blockHash || tx.blockNumber !== receipt.blockNumber) {
    return failed("canonical_block_mismatch", "transaction and receipt do not bind the canonical block");
  }
  const date = new Date(Number(blockStamp) * 1000);
  if (!Number.isFinite(date.getTime())) return failed("partial", "block timestamp was not readable");
  const timestamp = normalizeTime(date.toISOString());
  if (!timestamp) return failed("partial", "block timestamp was not readable");

  const logs = Array.isArray(receipt.logs) ? receipt.logs : null;
  if (!logs) return failed("partial", "receipt logs were not readable");
  if (logs.length > LOG_CAP) return failed("partial", "receipt log set exceeds the bound");
  const usdc = [];
  let foreignToken = false;
  for (const log of logs) {
    const address = normalizeAddress(log?.address);
    const topic = typeof log?.topics?.[0] === "string" ? log.topics[0].toLowerCase() : "";
    if (topic !== TRANSFER_TOPIC) continue;
    if (address !== NATIVE_USDC) {
      foreignToken = true;
      continue;
    }
    if (log.removed === true || log.transactionHash?.toLowerCase() !== requested
      || log.blockHash?.toLowerCase() !== blockHash || log.blockNumber !== receipt.blockNumber
      || !Array.isArray(log.topics) || log.topics.length !== 3
      || !log.topics.slice(1).every(t => /^0x0{24}[0-9a-f]{40}$/i.test(t))
      || typeof log.data !== "string" || !/^0x[0-9a-f]{64}$/i.test(log.data)) {
      return failed("canonical_log_mismatch", "native USDC log does not bind the canonical receipt");
    }
    const logIndex = hexQuantity(log.logIndex);
    if (logIndex == null || logIndex > BigInt(Number.MAX_SAFE_INTEGER)) return failed("partial", "log index was not readable");
    const source = topicAddress(log.topics?.[1]);
    const destination = topicAddress(log.topics?.[2]);
    const amount = hexQuantity(log.data);
    if (!source || !destination || amount == null) return failed("partial", "usdc transfer was not readable");
    usdc.push({ source, destination, amount, logIndex: Number(logIndex) });
  }
  if (usdc.length !== 1) {
    if (foreignToken && usdc.length === 0) return failed("wrong_token", "transfer is not native Base USDC");
    return failed("partial", "receipt does not contain one native USDC transfer");
  }
  const transfer = usdc[0];
  if (transfer.source !== transactionFrom) return failed("partial", "token source and transaction source disagree");
  const input = typeof tx.input === "string" ? tx.input.toLowerCase() : "";
  const expectedInput = "0xa9059cbb" + transfer.destination.slice(2).padStart(64, "0") + transfer.amount.toString(16).padStart(64, "0");
  if (normalizeAddress(tx.to) !== NATIVE_USDC || input !== expectedInput) {
    return failed("transaction_input_mismatch", "transaction input does not match the observed direct USDC transfer");
  }
  const amountBaseUnits = transfer.amount.toString();
  const amount = unitsToDecimal(transfer.amount);
  const canonical = canonicalReceipt({
    transactionHash: requested,
    blockNumber: Number(blockNumber),
    blockHash,
    logIndex: transfer.logIndex,
    timestamp,
    amount,
    amountBaseUnits,
  });
  const assessment = assessSettlement(
    {
      taskId: OFFER_ID,
      slotId: options.reservationId,
      amount: REWARD,
      asset: "USDC",
      network: "base",
      transactionHash: requested,
      blockNumber: Number(blockNumber),
      timestamp,
    },
    canonical,
    H15_KNOWN_TX,
  );
  return {
    ok: true,
    code: "ok",
    observation: {
      chainId: chainId.toString(),
      transactionFrom,
      source: transfer.source,
      destination: transfer.destination,
      amountAtomic: amountBaseUnits,
      canonicalReceipt: canonical,
      assessment,
    },
  };
}
