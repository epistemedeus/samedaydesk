import { z } from "zod";
import {
  APPEAL_BIND,
  EFFORT_UNITS,
  FUNDING_STATES,
  ID_MAX,
  MAX_CORRECTIONS,
  MAX_RESERVATION_SECONDS,
  MAX_TOKEN_DECIMALS,
  MEDIA_TYPE_MAX,
  MIN_RESERVATION_SECONDS,
  NETWORK_MAX,
  OBLIGATION_EVENTS,
  PROVENANCES,
  RAIL_SETTLEMENT,
  SCHEMA_ID,
  SCHEMA_VERSION,
  SPDX_MAX,
  TEXT_MAX,
  URI_MAX,
  USDC_DECIMALS,
  VERIFIER_MAX,
} from "./constants.js";
import {
  assertUsdcDecimals,
  decimalToAtomic,
  isAtomicAmountString,
  isDecimalAmountString,
} from "./money.js";
import type { FundedTaskTerms } from "./types.js";

function rejectUnknownKeys<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}

const TERMS_VERSION = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "termsVersion must be sha256:<64 lowercase hex>");

const opaqueId = z.string().trim().min(1).max(ID_MAX);

const digestSha256 = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{64}$/, "artifact.digestSha256 must be 64 lowercase hex characters");

const mediaType = z
  .string()
  .trim()
  .min(3)
  .max(MEDIA_TYPE_MAX)
  .regex(
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i,
    "artifact.mediaType must be a type/subtype",
  );

const artifactRef = z
  .string()
  .trim()
  .min(1)
  .max(URI_MAX)
  .refine((value) => {
    if (/^(javascript|data|vbscript|file|node|vm):/i.test(value)) return false;
    return true;
  }, "artifact.ref must be metadata only; execution URI schemes are rejected");

/**
 * ISO-8601 duration with at least one positive component.
 * Accepts e.g. PT24H, P7D, P1DT2H. Rejects P, PT, and all-zero durations.
 */
export function isPositiveIsoDuration(value: string): boolean {
  const match = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/.exec(
    value,
  );
  if (!match) return false;
  const nums = [...value.matchAll(/\d+/g)].map((item) => Number(item[0]));
  return nums.some((n) => n > 0);
}

const isoDuration = z
  .string()
  .min(2)
  .max(64)
  .refine(isPositiveIsoDuration, "duration must be a positive ISO-8601 duration");

const secondsDuration = z
  .number()
  .int()
  .min(MIN_RESERVATION_SECONDS)
  .max(MAX_RESERVATION_SECONDS);

export const durationSchema = z.union([secondsDuration, isoDuration]);

const isoInstant = z
  .string()
  .min(1)
  .max(64)
  .datetime({ offset: true });

const rewardSchema = rejectUnknownKeys({
  amount: z.string().min(1).max(78).refine(isDecimalAmountString, {
    message:
      "reward.amount must be a positive decimal string (no exponent, NaN, Infinity, or JS number)",
  }),
  asset: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/, "reward.asset must be a token symbol"),
  network: z
    .string()
    .trim()
    .min(1)
    .max(NETWORK_MAX)
    .regex(/^[A-Za-z0-9._:-]+$/, "reward.network must be an opaque network label"),
  amountAtomic: z
    .string()
    .refine(isAtomicAmountString, "reward.amountAtomic must be a positive integer string")
    .optional(),
  decimals: z.number().int().min(0).max(MAX_TOKEN_DECIMALS).optional(),
}).superRefine((reward, ctx) => {
  try {
    assertUsdcDecimals(reward.asset, reward.decimals);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "USDC decimals invalid",
      path: ["decimals"],
    });
  }
  if (reward.amountAtomic != null && reward.decimals == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "reward.decimals is required when amountAtomic is present",
      path: ["decimals"],
    });
    return;
  }
  if (reward.decimals != null && reward.amountAtomic != null) {
    try {
      const expected = decimalToAtomic(reward.amount, reward.decimals);
      if (expected !== reward.amountAtomic) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `reward.amountAtomic must equal amount scaled by 10^decimals (expected ${expected})`,
          path: ["amountAtomic"],
        });
      }
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "atomic conversion failed",
        path: ["amountAtomic"],
      });
    }
  }
  if (reward.asset === "USDC" && reward.decimals == null && reward.amountAtomic != null) {
    try {
      const expected = decimalToAtomic(reward.amount, USDC_DECIMALS);
      if (expected !== reward.amountAtomic) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `USDC amountAtomic must use decimals=6 (expected ${expected})`,
          path: ["amountAtomic"],
        });
      }
    } catch {
      /* amount refine already reported */
    }
  }
});

const artifactSchema = rejectUnknownKeys({
  ref: artifactRef,
  digestSha256,
  mediaType,
  bytes: z.number().int().positive().max(1024 * 1024 * 1024),
});

const acceptanceCriterionSchema = rejectUnknownKeys({
  id: opaqueId,
  text: z.string().trim().min(1).max(TEXT_MAX),
});

const effortSchema = z.discriminatedUnion("kind", [
  rejectUnknownKeys({
    kind: z.literal("expected"),
    value: z.number().int().positive().max(100_000),
    unit: z.enum(EFFORT_UNITS),
  }),
  rejectUnknownKeys({
    kind: z.literal("unknown"),
  }),
]);

const contributorLicenseSchema = z.discriminatedUnion("kind", [
  rejectUnknownKeys({
    kind: z.literal("spdx"),
    spdxId: z
      .string()
      .trim()
      .min(1)
      .max(SPDX_MAX)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9.+_-]*( WITH [A-Za-z0-9.+_-]+)?$/,
        "contributorLicense.spdxId must be an SPDX license identifier",
      ),
  }),
  rejectUnknownKeys({
    kind: z.literal("custom"),
    text: z.string().trim().min(8).max(TEXT_MAX),
  }),
]);

const correctionPolicySchema = rejectUnknownKeys({
  maxCorrections: z
    .number({
      required_error: "correctionPolicy.maxCorrections is required (bounded; not unlimited)",
      invalid_type_error: "correctionPolicy.maxCorrections must be an integer >= 0",
    })
    .int()
    .min(0, "correctionPolicy.maxCorrections must be >= 0 (negative means unlimited, forbidden)")
    .max(MAX_CORRECTIONS, `correctionPolicy.maxCorrections must be <= ${MAX_CORRECTIONS}`),
  window: durationSchema.optional(),
});

const paymentTimingSchema = rejectUnknownKeys({
  obligationBecomesOwed: z.enum(OBLIGATION_EVENTS),
  railMayPay: z.literal(RAIL_SETTLEMENT),
});

const fundTransferAuthoritySchema = rejectUnknownKeys({
  requesterAcceptRequired: z.literal(true),
  llmVerdictAlone: z.literal(false),
});

const failureAppealRouteSchema = rejectUnknownKeys({
  id: opaqueId,
  decider: z.string().trim().min(1).max(ID_MAX),
  boundTo: z.literal(APPEAL_BIND),
});

export const fundedTaskTermsSchema: z.ZodType<FundedTaskTerms> = rejectUnknownKeys({
  schema: z.literal(SCHEMA_ID),
  schemaVersion: z.literal(SCHEMA_VERSION),
  taskId: opaqueId,
  termsVersion: TERMS_VERSION.optional(),
  fundingState: z.enum(FUNDING_STATES),
  provenance: z.enum(PROVENANCES),
  execute: z.literal(false),
  reward: rewardSchema,
  artifact: artifactSchema,
  acceptanceCriterion: acceptanceCriterionSchema,
  verifierVersion: z.string().trim().min(1).max(VERIFIER_MAX),
  effort: effortSchema,
  contributorLicense: contributorLicenseSchema,
  reservationDuration: durationSchema,
  reservationExpiresAt: isoInstant.optional(),
  correctionPolicy: correctionPolicySchema,
  paymentTiming: paymentTimingSchema,
  fundTransferAuthority: fundTransferAuthoritySchema,
  failureAppealRoute: failureAppealRouteSchema,
});
