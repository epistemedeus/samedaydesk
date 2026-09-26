import { z } from "zod";
import { hashRequest } from "../crypto.js";
import { ApiError } from "../errors.js";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,159}$/);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
// Canonical VF01 identity domain, separate from bounded workflow IDs.
const gapId = z.string().min(1).max(512).regex(/^[a-zA-Z][a-zA-Z0-9._-]*:[^\s]+$/)
  .refine(s => s === s.trim() && !/[\u0000-\u001f\u007f]/.test(s));
const revision = z.number().int().min(0).max(2_147_483_646);
const text = z.string().trim().min(1).max(2000);
export const artifactSchema = z.object({
  uri: z.string().max(2048).url().refine((s) => {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password;
  }),
  digest,
}).strict();

// VF01 supplies an opaque gap identity and immutable provenance. This adapter
// does not claim the resolver's miss or permission declaration was verified.
export const gapSchema = z.object({
  schema: z.literal("neomorphic.foundry.work-cell-gap.v1"),
  id: gapId,
  contentId: digest,
  resolverSnapshot: artifactSchema,
  reproducer: artifactSchema,
  permission: z.enum(["synthetic", "authorized-reusable"]),
  fundingKind: z.enum(["voluntary", "unfunded-request"]),
}).strict();

export const checkpointSchema = z.object({
  schema: z.literal("neomorphic.foundry.checkpoint.v1"),
  artifact: artifactSchema,
  summary: text,
  nextStep: text,
}).strict();

export const contributionSchema = z.object({
  schema: z.literal("neomorphic.foundry.contribution.v1"),
  gapId,
  gapRevision: digest,
  sourceRevision: digest,
  artifact: artifactSchema,
  rights: text,
  testProposal: text,
  limitations: z.string().max(2000),
  operatorScope: text,
  checkpointRevision: revision.min(1),
}).strict();

const base = { schema: z.literal("neomorphic.foundry.work-cell-command.v1"), expectedRevision: revision };
const fenced = { ...base, fence: revision.min(1) };
const ttlSeconds = z.number().int().min(1).max(900);
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("create"), expectedRevision: z.literal(0), gap: gapSchema, workScope: id }).strict(),
  z.object({ ...base, action: z.literal("claim"), ttlSeconds, voluntaryOptIn: z.literal(true) }).strict(),
  z.object({ ...fenced, action: z.literal("renew"), ttlSeconds }).strict(),
  z.object({ ...fenced, action: z.literal("checkpoint"), checkpoint: checkpointSchema }).strict(),
  z.object({ ...fenced, action: z.literal("transfer"), targetGrantId: id, ttlSeconds }).strict(),
  z.object({ ...fenced, action: z.literal("release") }).strict(),
  z.object({ ...fenced, action: z.literal("submit"), contribution: contributionSchema }).strict(),
  z.object({ ...base, action: z.literal("cancel"), reason: text, fence: revision.min(1).optional() }).strict(),
  z.object({ ...base, action: z.literal("reject"), reason: text }).strict(),
  z.object({ ...base, action: z.literal("disposition"), receipt: artifactSchema }).strict(),
]);

export type Command = z.infer<typeof commandSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Gap = z.infer<typeof gapSchema>;
export type Contribution = z.infer<typeof contributionSchema>;
export type Grant = { id: string; projectId: string; role: "owner" | "writer" | "reader"; expiresAt: string | null };
export type Lease = { grantId: string; fence: number; expiresAt: string };
export type Submission = {
  id: string; revision: number; grantId: string; contributorGrantIds: string[];
  submittedAt: string; contribution: Contribution;
};

// Only a trusted host resolver may produce this envelope. The HTTP command
// contains a reference, never a caller-supplied verdict or execution identity.
export const verificationSchema = z.object({
  schema: z.literal("neomorphic.foundry.verification-receipt.v1"),
  id,
  projectId: id,
  cellId: id,
  submissionId: id,
  candidateRevision: digest,
  artifactDigest: digest,
  executionIdentity: id,
  evaluatorPolicy: artifactSchema,
  environment: text,
  independentlyAssigned: z.literal(true),
  contributorRelationship: z.enum(["independent", "owner-controlled", "unknown"]),
  outcome: z.enum(["accepted", "rejected", "deferred"]),
  limitations: z.string().max(2000),
  nextStep: text,
  retryAfterSeconds: z.number().int().min(1).max(86400).optional(),
}).strict();
export type Verification = z.infer<typeof verificationSchema>;
export type ReceiptResolver = (input: {
  reference: Artifact; projectId: string; cellId: string; submission: Submission; signal: AbortSignal;
}) => Promise<Verification>;
export type Cell = {
  schema: "neomorphic.foundry.work-cell.v1";
  id: string; projectId: string; workScope: string; gap: Gap;
  revision: number; fence: number;
  status: "open" | "leased" | "submitted" | "accepted" | "rejected" | "cancelled";
  lease: Lease | null;
  checkpoint: (z.infer<typeof checkpointSchema> & { revision: number; grantId: string; createdAt: string }) | null;
  contributorGrantIds: string[];
  submission: Submission | null;
  disposition: { source: "owner" | "contributor" | "verification"; reason?: string; receipt?: Artifact; verification?: Verification } | null;
  createdAt: string; updatedAt: string;
};
export type MutationReceipt = {
  schema: "neomorphic.foundry.work-cell-receipt.v1";
  action: Command["action"]; revision: number; actorGrantId: string;
  recordedAt: string; cell: Cell; nextStep: string;
};

export class WorkCellError extends ApiError {
  constructor(status: number, code: string, message: string,
    readonly nextStep: string, readonly retryAfterSeconds?: number) {
    super(status, code, message);
  }
}
export class UnsupportedWorkCell extends WorkCellError {
  readonly result: { schema: string; status: string; reason: string; original: unknown; limit: null; accepted: false };
  constructor(original: unknown) {
    super(422, "unsupported_domain", "PostgreSQL cannot preserve this JSON string", "retain original identity; no partial acceptance");
    this.result = { schema: "neomorphic.foundry.unsupported.v1", status: "unsupported", reason: "postgres_json_unicode_unavailable", original, limit: null, accepted: false };
  }
}
export function fail(status: number, code: string, message: string, nextStep: string, retryAfterSeconds?: number): never {
  throw new WorkCellError(status, code, message, nextStep, retryAfterSeconds);
}
export function parseCommand(raw: unknown): Command {
  if (Buffer.byteLength(JSON.stringify(raw) ?? "") > 24 * 1024) {
    fail(413, "payload_too_large", "command exceeds 24KiB", "use immutable artifact references");
  }
  const result = commandSchema.safeParse(raw);
  if (!result.success) fail(400, "invalid_input", "invalid work-cell command", "validate against commandSchema; no money, code or verdict fields");
  const unsupported = (v: unknown): boolean => typeof v === "string" ? /[\u0000\uD800-\uDFFF]/u.test(v)
    : !!v && typeof v === "object" && Object.entries(v).some(([k,x]) => unsupported(k) || unsupported(x));
  if (unsupported(result.data)) throw new UnsupportedWorkCell(result.data);
  return result.data;
}
export function cellIdFor(projectId: string, gapId: string, workScope: string): string {
  return `wcl_${hashRequest([projectId, gapId, workScope])}`;
}
export function nextStep(cell: Cell): string {
  switch (cell.status) {
    case "open": return "optionally claim with a current revision and explicit voluntaryOptIn";
    case "leased": return "holder may checkpoint, renew, transfer, release or submit before lease/grant expiry; reload before takeover";
    case "submitted": return cell.disposition?.verification?.nextStep ?? "await independent verification; submitted is not accepted";
    case "accepted": return "acceptance is recorded for this candidate; VF01/VF03 separately control publication, reuse and invalidation";
    case "rejected": return "read rejection and request a new work scope for a revised candidate";
    case "cancelled": return "stop work; a new authorized work scope is required to resume";
  }
}
