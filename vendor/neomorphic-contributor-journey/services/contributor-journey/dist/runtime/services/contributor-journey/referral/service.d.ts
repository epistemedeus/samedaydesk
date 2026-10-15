import type { OwnShare, PublicShare, ReferralConfig, ReferralPorts, Result, SharePreview, SourceEvent } from './types.js';
export declare function createReferralService(ports: ReferralPorts, config: ReferralConfig): {
    preview(context: unknown, command: unknown): Promise<Result<SharePreview>>;
    create(context: unknown, command: unknown): Promise<Result<OwnShare>>;
    readOwn(context: unknown, shareRef: unknown): Promise<Result<OwnShare>>;
    readOperation(context: unknown, command: unknown): Promise<Result<OwnShare>>;
    readPublic(shareRef: unknown): Promise<Result<PublicShare>>;
    narrow(context: unknown, command: unknown): Promise<Result<OwnShare>>;
    withdraw(context: unknown, command: unknown): Promise<Result<OwnShare>>;
    declareSource(context: unknown, command: unknown): Promise<Result<SourceEvent>>;
    /** Only the host's actual link-arrival handler calls this. The visitor port
     * binds its trusted request reference. No public POST accepts observed flags. */
    observeArrival(context: unknown, shareRef: unknown): Promise<Result<SourceEvent>>;
    /** Internal callback from account/claim/accepted-work owners. Exact evidence
     * is re-read; these stages have no HTTP write route in this module. */
    recordMilestone(command: unknown): Promise<Result<SourceEvent>>;
};
export type ReferralService = ReturnType<typeof createReferralService>;
