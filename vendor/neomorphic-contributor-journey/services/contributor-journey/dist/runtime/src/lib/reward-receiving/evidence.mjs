/**
 * Supplied H15-B facts and the redacted public receipt.
 * Wallet addresses are not stored here.
 */

export const H15_TASK_ID = "H15-BEE";
export const H15_SLOT_ID = "B";
export const H15_TERMS_VERSION = "2026-09-13-price2";
export const H15_AMOUNT = "0.20";
export const H15_ASSET = "USDC";
export const H15_NETWORK = "base";
export const H15_SUBMITTED_AT = "2026-09-26T11:00:39Z";
export const H15_CHOOSE = "decline_all";
export const H15_PUBLISHED_ACCEPTED_AT = "2026-09-26T11:54:00Z";
export const H15_ACCEPTED_AT = "2026-09-26T11:54:13Z";
export const H15_OPERATOR_SENT_AT = "2026-09-30T22:35:49Z";
export const H15_TX_HASH = "0x593559ea7a19277645a76e41aa29e713ed219db1f97e4be29c9dac9cf6cd4b37";
export const H15_BLOCK_NUMBER = 52009071;
export const H15_TRANSFER_AT = "2026-09-30T22:31:29Z";
export const H15_AMOUNT_BASE_UNITS = "200000";

/** Redacted observation of the public Base receipt and its block timestamp. */
export const H15_PUBLIC_RECEIPT = Object.freeze({
  network: H15_NETWORK,
  asset: H15_ASSET,
  tokenContract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  transactionHash: H15_TX_HASH,
  blockNumber: H15_BLOCK_NUMBER,
  timestamp: H15_TRANSFER_AT,
  status: "success",
  transferCount: 1,
  amount: H15_AMOUNT,
  amountBaseUnits: H15_AMOUNT_BASE_UNITS,
  addressesIncluded: false,
  evidenceClass: "public_chain",
});

export const H15_KNOWN_TX = Object.freeze({
  transactionHash: H15_TX_HASH,
  taskId: H15_TASK_ID,
  slotId: H15_SLOT_ID,
  amount: H15_AMOUNT,
  asset: H15_ASSET,
  network: H15_NETWORK,
});

export function h15Obligation(overrides = {}) {
  return {
    taskId: H15_TASK_ID,
    slotId: H15_SLOT_ID,
    termsVersion: H15_TERMS_VERSION,
    amount: H15_AMOUNT,
    asset: H15_ASSET,
    network: H15_NETWORK,
    transactionHash: H15_TX_HASH,
    blockNumber: H15_BLOCK_NUMBER,
    timestamp: H15_TRANSFER_AT,
    ...overrides,
  };
}
