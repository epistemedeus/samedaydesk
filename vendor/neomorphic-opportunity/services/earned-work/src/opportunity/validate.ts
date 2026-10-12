import { z } from "zod";
import { ApiError } from "../errors.js";
import { PROVENANCES } from "../types.js";

const keySchema = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,78}$/);
const labelSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,78}$/);
const atomicSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digestSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{64}$/)
  .transform((value) => value.toLowerCase());

export const SOURCE_ROUTES = [
  "search",
  "feed",
  "api",
  "mcp",
  "another_agent",
  "direct_invitation",
  "other",
  "unknown",
] as const;

const nullableShort = z.string().trim().min(1).max(500).nullable();

export const selfReportSchema = z
  .object({
    listingRef: nullableShort,
    encounterAt: z.string().datetime({ offset: false }).nullable(),
    encounterEstimated: z.boolean(),
    route: z.enum(SOURCE_ROUTES),
    query: nullableShort,
    endpointOrFilter: nullableShort,
    upstreamPublicLink: nullableShort,
    snippetRef: nullableShort,
    pagesFollowed: z.array(z.string().trim().min(1).max(300)).max(20),
    decisionPoint: z.string().trim().min(1).max(500).nullable(),
    role: z.string().trim().min(1).max(120).nullable(),
    activeMinutes: z.number().int().min(0).max(10000).nullable(),
    confidence: z.enum(["measured", "estimated", "unknown"]),
    unknowns: z.array(z.string().trim().min(1).max(80)).max(32),
  })
  .strict();

export const observedSchema = z
  .object({
    eventIds: z.array(z.string().trim().min(1).max(80)).max(32),
    placementId: nullableShort,
    campaignId: nullableShort,
    sourceId: nullableShort,
    providerId: nullableShort,
    query: nullableShort,
    endpoint: nullableShort,
    reconstructed: z.literal(false),
  })
  .strict();

export const sourceBodySchema = z
  .object({
    provenance: z.enum(PROVENANCES),
    selfReport: selfReportSchema,
    observed: observedSchema,
  })
  .strict();

const offerSchema = z
  .object({
    offerKey: keySchema,
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(4000),
    slotCount: z.number().int().min(0).max(10000),
    ownerReservedSlots: z.number().int().min(0).max(10000).optional(),
    rewardAtomic: atomicSchema,
    maxEffortSeconds: z.number().int().min(1).max(86400),
    acceptance: z.string().trim().min(1).max(2000),
    evidenceKind: z.enum(["discovery_trace", "workflow_witness"]),
    publicClaimable: z.boolean(),
    rank: z.number().int().min(0).max(1000),
  })
  .strict();

const alternativeSchema = z
  .object({
    alternativeKey: keySchema,
    rank: z.number().int().min(0).max(1000),
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(2000),
  })
  .strict();

export const createRoundBodySchema = z
  .object({
    roundKey: keySchema,
    provenance: z.enum(PROVENANCES),
    productionAdmission: z.boolean(),
    principalCapAtomic: atomicSchema,
    atomicScale: z.number().int().min(0).max(18),
    asset: z.string().trim().min(1).max(32),
    network: z.string().trim().min(1).max(64),
    chainId: z.number().int().min(1).max(1_000_000),
    submissionDeadline: z.string().datetime({ offset: false }),
    claimTtlSeconds: z.number().int().min(1).max(1_209_600),
    reviewWithinDays: z.number().int().min(0).max(30),
    maxClarifications: z.number().int().min(0).max(1),
    maxEvidenceBytes: z.number().int().min(1).max(16384).optional(),
    transferFeeCap: z
      .object({
        amountAtomic: z.string().trim().regex(/^(0|[1-9][0-9]{0,30})$/),
        asset: z.string().trim().min(1).max(32),
        note: z.string().trim().min(1).max(200),
      })
      .strict(),
    offers: z.array(offerSchema).min(1).max(32),
    alternatives: z.array(alternativeSchema).max(16),
    expectedTermsVersion: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
  })
  .strict();

export const importBodySchema = z
  .object({
    provenance: z.enum(PROVENANCES),
    offerKey: keySchema,
    publicLabel: labelSchema,
    importKey: z.string().trim().min(1).max(160),
    credentialRef: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9:._-]{1,128}$/),
    deferStart: z.boolean().optional(),
  })
  .strict();

export const assignBodySchema = importBodySchema
  .extend({
    scope: z
      .object({
        title: z.string().trim().min(1).max(160),
        instructions: z.string().trim().min(1).max(4000),
      })
      .strict(),
  })
  .strict();

export const claimBodySchema = z
  .object({
    provenance: z.enum(PROVENANCES),
    offerKey: keySchema,
    termsVersion: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    publicLabel: labelSchema,
    volunteeredObservation: observedSchema.omit({ eventIds: true, reconstructed: true, endpoint: true }).optional(),
  })
  .strict();

export const waitlistBodySchema = z
  .object({
    provenance: z.enum(PROVENANCES),
    publicLabel: labelSchema,
    reason: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const artifactSchema = z
  .object({
    ref: z.string().trim().min(1).max(2048),
    digestSha256: digestSchema,
    mediaType: z.string().trim().min(1).max(200),
    bytes: z.number().int().min(1).max(16384),
  })
  .strict();

export const submitBodySchema = z
  .object({
    provenance: z.enum(PROVENANCES),
    artifact: artifactSchema,
    evidence: z.record(z.unknown()),
    modelUsage: z.string().trim().min(1).max(200).nullable().optional(),
    contributorActiveMinutes: z.number().int().min(0).max(10000).nullable().optional(),
  })
  .strict();

export const discoveryEvidenceSchema = z.object({
  kind: z.literal("discovery_trace"),
  selfReport: selfReportSchema,
}).strict();

export const workflowEvidenceSchema = z.object({
  kind: z.literal("workflow_witness"),
  attempt: z.string().trim().min(1).max(4000),
  limitationOrResult: z.string().trim().min(1).max(4000),
  syntheticFailure: z.literal(false),
  versions: z.string().trim().min(1).max(500).optional(),
  minimalInput: z.string().max(4000).optional(),
  expectedResult: z.string().max(4000).optional(),
}).strict();

export const acceptBodySchema = z
  .object({
    provenance: z.enum(PROVENANCES),
    requesterActiveMinutes: z.number().int().min(0).max(10000).nullable().optional(),
  })
  .strict();

export const provenanceBodySchema = z
  .object({
    provenance: z.enum(PROVENANCES),
  })
  .strict();

export const cohortBodySchema = z
  .object({
    kind: z.enum([
      "contacted",
      "delivered",
      "replied",
      "claimed",
      "completed",
      "accepted",
      "paid",
      "useful_later_consumer",
    ]),
    eventRef: z.string().trim().min(1).max(160),
    publicLabel: labelSchema.nullable().optional(),
    activeMinutes: z.number().int().min(0).max(100000).nullable().optional(),
    channel: z.enum(["email", "http", "operator"]).optional(),
  })
  .strict();

export const noticeBodySchema = z
  .object({
    campaignKey: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,78}$/),
    preservedPromise: z.record(z.unknown()),
    nextRoundKey: keySchema.nullable().optional(),
  })
  .strict();

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "request body failed validation");
  }
  return parsed.data;
}
