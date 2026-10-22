import type { BaseReceiptObserver, CanonicalSettlementRegistry, QualifiedSettlementPort } from "./types.js";
/** Uses the existing bounded, canonical-block/direct-USDC observer. No signing, uploads or payment writes. */
export declare function createBaseReceiptObserver(options: {
    rpcUrl: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
}): BaseReceiptObserver;
/** Exact work -> accepted obligation -> exclusive canonical receipt -> authorized counterparties. */
export declare function createQualifiedSettlementPort(deps: {
    registry: CanonicalSettlementRegistry;
    observer: BaseReceiptObserver;
    allowSynthetic?: boolean;
}): QualifiedSettlementPort;
