import type { CaptureOutcome, CaptureRequest, CapturePort, FundingAuthority, FundingProofContract } from '../../agent-economy-foundation/dist/index.js';

/** A/B boundary. Wire types are F1 exports, never a B copy of the schema. */
export interface RequesterMoneyPort {
  readonly authorityId: FundingAuthority['authorityId'];
  readonly protocol: CapturePort['protocol'];
  /** Source-only laboratory qualification; production is not admitted by B. */
  readonly qualification: 'fake' | 'local_chain';
  readProof(proofId: string): Promise<FundingProofContract | null>;
  captureOutcome(request: CaptureRequest): Promise<CaptureOutcome>;
  capture(request: CaptureRequest): Promise<CaptureOutcome>;
}

export function capturePort(money: RequesterMoneyPort): CapturePort {
  // F1's CapturePort retains readback; final A supplies captureOutcome directly.
  return { protocol: money.protocol, readback: request => money.captureOutcome(request), capture: request => money.capture(request) };
}

/** A's exported class implements these F1 interfaces. No B schema fork. */
export function moneyFromA(rail: CapturePort & FundingAuthority & Pick<RequesterMoneyPort,'captureOutcome'>): RequesterMoneyPort {
  return {authorityId:rail.authorityId,protocol:rail.protocol,qualification:'local_chain',
    readProof:id=>rail.readProof(id),captureOutcome:request=>rail.captureOutcome(request),capture:request=>rail.capture(request)};
}
