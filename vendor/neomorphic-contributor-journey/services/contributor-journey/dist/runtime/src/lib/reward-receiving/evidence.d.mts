export function h15Obligation(overrides?: {}): {
    taskId: string;
    slotId: string;
    termsVersion: string;
    amount: string;
    asset: string;
    network: string;
    transactionHash: string;
    blockNumber: number;
    timestamp: string;
};
/**
 * Supplied H15-B facts and the redacted public receipt.
 * Wallet addresses are not stored here.
 */
export const H15_TASK_ID: "H15-BEE";
export const H15_SLOT_ID: "B";
export const H15_TERMS_VERSION: "2026-09-13-price2";
export const H15_AMOUNT: "0.20";
export const H15_ASSET: "USDC";
export const H15_NETWORK: "base";
export const H15_SUBMITTED_AT: "2026-09-26T11:00:39Z";
export const H15_CHOOSE: "decline_all";
export const H15_PUBLISHED_ACCEPTED_AT: "2026-09-26T11:54:00Z";
export const H15_ACCEPTED_AT: "2026-09-26T11:54:13Z";
export const H15_OPERATOR_SENT_AT: "2026-09-30T22:35:49Z";
export const H15_TX_HASH: "0x593559ea7a19277645a76e41aa29e713ed219db1f97e4be29c9dac9cf6cd4b37";
export const H15_BLOCK_NUMBER: 52009071;
export const H15_TRANSFER_AT: "2026-09-30T22:31:29Z";
export const H15_AMOUNT_BASE_UNITS: "200000";
/** Redacted observation of the public Base receipt and its block timestamp. */
export const H15_PUBLIC_RECEIPT: Readonly<{
    network: "base";
    asset: "USDC";
    tokenContract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
    transactionHash: "0x593559ea7a19277645a76e41aa29e713ed219db1f97e4be29c9dac9cf6cd4b37";
    blockNumber: 52009071;
    timestamp: "2026-09-30T22:31:29Z";
    status: "success";
    transferCount: 1;
    amount: "0.20";
    amountBaseUnits: "200000";
    addressesIncluded: false;
    evidenceClass: "public_chain";
}>;
export const H15_KNOWN_TX: Readonly<{
    transactionHash: "0x593559ea7a19277645a76e41aa29e713ed219db1f97e4be29c9dac9cf6cd4b37";
    taskId: "H15-BEE";
    slotId: "B";
    amount: "0.20";
    asset: "USDC";
    network: "base";
}>;
