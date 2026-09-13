/** Design contract only. No implementation, HTTP route, scheduler, or payment system. */
export type Sha256 = string; // Validate lowercase hex, exactly 64 characters at the boundary.
export type PrincipalId = string; // Resolved by trusted authentication; never a raw bearer token.
export type ExecutionId = string; // Existing execution.v1 ID grammar, 1–128 characters.

export interface RetrievalBinding {
  principalId: PrincipalId;
  executionId: ExecutionId;
  requestHash: Sha256; // Frozen execution request + input byte identities, versioned canonicalization.
}

export interface NamedOutput {
  name: string; // Exact promised basename. No caller filesystem paths or arbitrary filenames.
  kind: 'file';
  bytes: number; // Integer, 0..1,048,576; initial scope max two files and 2,097,152 total bytes.
  sha256: Sha256;
}

export interface AvailableResult extends RetrievalBinding {
  state: 'available';
  jobId: 'lockfile-pin-delta' | 'vendor-budget-impact';
  receiptSha256: Sha256;
  outputsDigest: Sha256; // Existing named-byte projection: name/kind/bytes/sha256, no absolute path.
  outputs: readonly NamedOutput[];
  termsVersion: string;
  sample: boolean;
  expiresAt: string; // Server UTC, persisted once; a GET cannot extend it.
  purchaseAuthority: false;
  sold: false;
}

export type RetrievalResult = AvailableResult | {
  state: 'pending' | 'not-found' | 'expired' | 'identity-conflict' | 'integrity-failed';
};

/** Implement over existing managed-order persistence and verified mailbox artifacts.
 * get/openVerified MUST have no execution, settlement, enqueue, ack, or retry dependency.
 * Miss/expiry/restart ambiguity fail closed. Never call runCreateOrder/runPaidOffer from GET.
 */
export interface AcquisitionReader {
  get(binding: RetrievalBinding, serverNow: string): Promise<RetrievalResult>;
  openVerified(binding: RetrievalBinding & { name: string; sha256: Sha256 }, serverNow: string): Promise<{
    metadata: NamedOutput;
    bytes: Uint8Array; // Bounded, privately opened, fstat/hash checked before any HTTP success bytes.
  }>;
}

/** Called only by the existing execution completion path, before advertised retrieval succeeds.
 * Admission/reservation belongs to managed-order. Artifact paths are private storage internals.
 * Repeated publication must match principal/request/receipt/output identity or refuse.
 */
export interface AcquisitionWriter {
  publishCompleted(result: AvailableResult, verifiedFiles: readonly {
    metadata: NamedOutput;
    bytes: Uint8Array;
  }[]): Promise<'created' | 'identical'>;
  expire(binding: RetrievalBinding, serverNow: string): Promise<void>; // Retain identity tombstone.
}

/** Proposed HTTP contract, mounted only after the three Heavy packages pass integration:
 * GET /results/:executionId             authenticated principal + X-Request-SHA256
 * GET /results/:executionId/artifacts/:name  same binding + X-Artifact-SHA256
 * 200 available/bytes; 202 pending; 404 missing/other principal; 409 same-principal mismatch;
 * 410 expired; 422 integrity failure; 413 oversize; 416 Range unsupported; 503 store unavailable.
 * Private, no-store responses. No redirects, host paths, external URLs, or caller-chosen roots.
 */
