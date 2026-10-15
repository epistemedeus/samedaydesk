/**
 * Match a public chain receipt to one obligation.
 * Counterparty addresses are never copied into the result.
 */

export const BASE_USDC_CONTRACT = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const USDC_DECIMALS = 6;
export const BASE_RPC_URL = "https://mainnet.base.org";

export function normalizeTime(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

export function decimalToUnits(value, decimals = USDC_DECIMALS) {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  if (frac.length > decimals) return null;
  const scale = 10n ** BigInt(decimals);
  return BigInt(whole) * scale + BigInt((frac.padEnd(decimals, "0") || "0"));
}

export function unitsToDecimal(units, decimals = USDC_DECIMALS) {
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const frac = (units % scale).toString().padStart(decimals, "0");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole.toString()}.${trimmed}` : whole.toString();
}

function failed(reason, kind, extra = {}) {
  return {
    verified: false,
    kind,
    reason,
    partial: kind === "partial",
    addressesIncluded: false,
    ...extra,
  };
}

/**
 * @param {object} obligation task, slot, amount, asset, network, and the expected public receipt identity
 * @param {object|null} receipt redacted public observation
 * @param {object|null} knownTx optional registry row binding a tx hash to one task
 */
export function assessSettlement(obligation, receipt, knownTx = null) {
  if (!obligation || typeof obligation.amount !== "string") {
    return failed("obligation_missing", "unconfirmed");
  }
  if (!receipt) return failed("receipt_missing", "unconfirmed");
  if (receipt.addressesIncluded === true) return failed("address_publication_refused", "rejected");
  if (receipt.operatorConfirmationOnly === true) return failed("operator_confirmation_is_not_a_receipt", "unconfirmed");

  const txHash = /^0x[0-9a-f]{64}$/i;
  if (typeof obligation.transactionHash !== "string" || !txHash.test(obligation.transactionHash)
    || !Number.isSafeInteger(obligation.blockNumber) || obligation.blockNumber < 0
    || normalizeTime(obligation.timestamp) == null) {
    return failed("obligation_receipt_binding_missing", "unconfirmed");
  }
  if (typeof receipt.network !== "string" || receipt.network.length === 0
    || typeof receipt.asset !== "string" || receipt.asset.length === 0
    || typeof receipt.transactionHash !== "string" || !txHash.test(receipt.transactionHash)
    || !Number.isSafeInteger(receipt.blockNumber) || receipt.blockNumber < 0
    || normalizeTime(receipt.timestamp) == null
    || receipt.transferCount !== 1
    || (obligation.network === "base" && obligation.asset === "USDC"
      && typeof receipt.tokenContract !== "string")) {
    return failed("receipt_incomplete", "unconfirmed");
  }

  if (knownTx && receipt.transactionHash && knownTx.transactionHash
    && knownTx.transactionHash.toLowerCase() === String(receipt.transactionHash).toLowerCase()
    && (knownTx.taskId !== obligation.taskId || (knownTx.slotId && knownTx.slotId !== obligation.slotId))) {
    return failed("task_mismatch", "rejected");
  }
  if (receipt.taskId && obligation.taskId && receipt.taskId !== obligation.taskId) {
    return failed("task_mismatch", "rejected");
  }
  if (receipt.slotId && obligation.slotId && receipt.slotId !== obligation.slotId) {
    return failed("task_mismatch", "rejected");
  }
  if (receipt.network && obligation.network && receipt.network !== obligation.network) {
    return failed("network_mismatch", "rejected");
  }
  if (receipt.asset && obligation.asset && receipt.asset !== obligation.asset) {
    return failed("asset_mismatch", "rejected");
  }
  if (obligation.network === "base" && obligation.asset === "USDC" && receipt.tokenContract
    && String(receipt.tokenContract).toLowerCase() !== BASE_USDC_CONTRACT) {
    return failed("asset_mismatch", "rejected");
  }

  const success = receipt.status === "success" || receipt.status === "0x1" || receipt.status === 1;
  if (!success) return failed("receipt_not_successful", "unconfirmed");
  if (receipt.transferCount === 0 || receipt.logsMissing === true) return failed("logs_missing", "unconfirmed");

  const owedUnits = decimalToUnits(obligation.amount);
  if (receipt.amountBaseUnits != null
    && (typeof receipt.amountBaseUnits !== "string" || !/^\d+$/.test(receipt.amountBaseUnits))) {
    return failed("amount_unreadable", "unconfirmed");
  }
  const paidUnits = receipt.amountBaseUnits != null
    ? BigInt(receipt.amountBaseUnits)
    : decimalToUnits(String(receipt.amount ?? ""));
  if (owedUnits == null || paidUnits == null) return failed("amount_unreadable", "unconfirmed");
  if (paidUnits !== owedUnits) {
    const partial = paidUnits > 0n && paidUnits < owedUnits;
    return failed(partial ? "partial_amount" : "amount_mismatch", partial ? "partial" : "rejected", {
      paidAmount: unitsToDecimal(paidUnits),
      owedAmount: obligation.amount,
    });
  }
  if (obligation.transactionHash && String(receipt.transactionHash).toLowerCase() !== obligation.transactionHash.toLowerCase()) {
    return failed("transaction_mismatch", "rejected");
  }
  if (obligation.blockNumber != null && Number(receipt.blockNumber) !== Number(obligation.blockNumber)) {
    return failed("block_mismatch", "rejected");
  }
  if (obligation.timestamp && receipt.timestamp && normalizeTime(receipt.timestamp) !== normalizeTime(obligation.timestamp)) {
    return failed("timestamp_mismatch", "rejected");
  }

  return {
    verified: true,
    kind: "verified",
    reason: "public_receipt_matches_obligation",
    partial: false,
    transactionHash: String(receipt.transactionHash).toLowerCase(),
    blockNumber: Number(receipt.blockNumber),
    timestamp: normalizeTime(receipt.timestamp),
    amount: obligation.amount,
    asset: obligation.asset,
    network: obligation.network,
    tokenContract: receipt.tokenContract ? String(receipt.tokenContract).toLowerCase() : null,
    addressesIncluded: false,
  };
}

async function rpc(fetchImpl, rpcUrl, method, params) {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`base rpc ${method} failed`);
  const body = await response.json();
  if (body.error) throw new Error(`base rpc ${method} error`);
  return body.result;
}

/**
 * Replay a public Base transaction. The returned object has no from/to address.
 */
export async function readPublicBaseReceipt(txHash, { rpcUrl = BASE_RPC_URL, fetchImpl = globalThis.fetch } = {}) {
  const receipt = await rpc(fetchImpl, rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) {
    return { addressesIncluded: false, status: "missing", transferCount: 0, logsMissing: true, transactionHash: txHash };
  }
  const block = await rpc(fetchImpl, rpcUrl, "eth_getBlockByNumber", [receipt.blockNumber, false]);
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const transfers = logs.filter((log) => (
    String(log.address).toLowerCase() === BASE_USDC_CONTRACT
    && String(log.topics?.[0]).toLowerCase() === TRANSFER_TOPIC
    && typeof log.data === "string"
  ));
  const amountBaseUnits = transfers.length === 1 ? BigInt(transfers[0].data).toString() : null;
  return {
    network: "base",
    asset: "USDC",
    tokenContract: BASE_USDC_CONTRACT,
    transactionHash: String(receipt.transactionHash).toLowerCase(),
    blockNumber: Number(receipt.blockNumber),
    timestamp: normalizeTime(new Date(Number(block.timestamp) * 1000).toISOString()),
    status: receipt.status === "0x1" ? "success" : "failed",
    transferCount: transfers.length,
    amountBaseUnits,
    amount: amountBaseUnits == null ? null : unitsToDecimal(BigInt(amountBaseUnits)),
    addressesIncluded: false,
    logCount: logs.length,
  };
}
