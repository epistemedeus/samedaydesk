export function normalizeTime(value: any): string | null;
export function decimalToUnits(value: any, decimals?: number): bigint | null;
export function unitsToDecimal(units: any, decimals?: number): string;
/**
 * @param {object} obligation task, slot, amount, asset, network, and the expected public receipt identity
 * @param {object|null} receipt redacted public observation
 * @param {object|null} knownTx optional registry row binding a tx hash to one task
 */
export function assessSettlement(obligation: object, receipt: object | null, knownTx?: object | null): {
    verified: boolean;
    kind: any;
    reason: any;
    partial: boolean;
    addressesIncluded: boolean;
} | {
    verified: boolean;
    kind: string;
    reason: string;
    partial: boolean;
    transactionHash: string;
    blockNumber: number;
    timestamp: string | null;
    amount: any;
    asset: any;
    network: any;
    tokenContract: string | null;
    addressesIncluded: boolean;
};
/**
 * Replay a public Base transaction. The returned object has no from/to address.
 */
export function readPublicBaseReceipt(txHash: any, { rpcUrl, fetchImpl }?: {
    rpcUrl?: string | undefined;
    fetchImpl?: typeof fetch | undefined;
}): Promise<{
    addressesIncluded: boolean;
    status: string;
    transferCount: number;
    logsMissing: boolean;
    transactionHash: any;
    network?: undefined;
    asset?: undefined;
    tokenContract?: undefined;
    blockNumber?: undefined;
    timestamp?: undefined;
    amountBaseUnits?: undefined;
    amount?: undefined;
    logCount?: undefined;
} | {
    network: string;
    asset: string;
    tokenContract: string;
    transactionHash: string;
    blockNumber: number;
    timestamp: string | null;
    status: string;
    transferCount: any;
    amountBaseUnits: string | null;
    amount: string | null;
    addressesIncluded: boolean;
    logCount: any;
    logsMissing?: undefined;
}>;
/**
 * Match a public chain receipt to one obligation.
 * Counterparty addresses are never copied into the result.
 */
export const BASE_USDC_CONTRACT: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const TRANSFER_TOPIC: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const USDC_DECIMALS: 6;
export const BASE_RPC_URL: "https://mainnet.base.org";
