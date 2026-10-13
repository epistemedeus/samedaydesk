export function normalizeAddress(value: any): string | null;
export function rpcUrlAllowed(value: any): boolean;
/**
 * Read-only Base observation. Fetches the transaction and its receipt.
 * Does not sign, broadcast, or treat a caller JSON verified flag as proof.
 */
export function observeBaseTransfer(txHash: any, options?: {}): Promise<{
    ok: boolean;
    code: any;
    message: any;
} | {
    ok: boolean;
    result: any;
} | {
    ok: boolean;
    code: string;
    observation: {
        chainId: string;
        transactionFrom: string;
        source: string;
        destination: string;
        amountAtomic: string;
        canonicalReceipt: {
            network: string;
            asset: string;
            tokenContract: string;
            transactionHash: any;
            blockNumber: any;
            blockHash: any;
            logIndex: any;
            timestamp: any;
            status: string;
            transferCount: number;
            amount: any;
            amountBaseUnits: any;
            addressesIncluded: boolean;
        };
        assessment: {
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
    };
}>;
export const OBSERVE_TIMEOUT_MS: 8000;
export const OBSERVE_MAX_BYTES: 262144;
export const BASE_CHAIN_ID: 8453n;
