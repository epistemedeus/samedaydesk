import { z } from "zod";
import { hashRequest } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { checkInputBounds } from "../../result-reuse/src/limits.mjs";
import { credentialHits } from "../../result-reuse/src/omit.mjs";
import { DEFAULT_LIMITS, INPUT_MAX_BYTES, JourneyError } from "./budget.mjs";

export const PREFIX = "/api/hosted-useful";
export const SCHEMA = "samedaydesk.hosted-useful-job.v1";
export const RECIPE_IDS = Object.freeze(["source-change-alert", "comparable-record-extraction", "issue-to-work-brief", "verification-reconcile"]);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const snapshot = z.object({ id: identifier, kind: z.enum(["json", "html"]), data: z.unknown() }).strict();
const limits = z.object({
  deadlineMs: z.number().int().min(4000).max(30_000).default(DEFAULT_LIMITS.deadlineMs),
  totalBytes: z.number().int().min(16_384).max(DEFAULT_LIMITS.totalBytes).default(DEFAULT_LIMITS.totalBytes),
  outputBytes: z.number().int().min(2048).max(DEFAULT_LIMITS.outputBytes).default(DEFAULT_LIMITS.outputBytes),
}).strict().default({});

export const requestSchema = z.object({
  schema: z.literal("samedaydesk.useful-recipe-request.v1"),
  taskId: identifier,
  recipeId: z.enum(RECIPE_IDS),
  input: z.object({
    clock: z.string().datetime({ offset: true }),
    scheduleHint: z.string().max(80).optional(),
    horizonHours: z.number().min(0).max(8760).optional(),
    fields: z.array(z.enum(["title", "h1", "bytes"])).min(1).max(3).optional(),
    prior: z.record(z.unknown()).optional(),
    priorResult: z.object({ jobId: z.string().regex(/^wcl_[a-f0-9]{64}$/), taskId: identifier, digest }).strict().optional(),
    current: snapshot.optional(),
    sources: z.array(snapshot).max(5).optional(),
    issue: z.record(z.unknown()).optional(),
    candidate: z.record(z.unknown()).optional(),
  }).strict(),
  limits,
}).strict();

export function validateRequest(raw) {
  const bounded = checkInputBounds(raw);
  if (!bounded.ok || bounded.bytes > INPUT_MAX_BYTES) throw new JourneyError(413, "input_too_large");
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) throw new JourneyError(400, "invalid_request", "Supply a supported recipe, caller task, UTC clock and snapshot JSON; server paths, provider keys and trust labels are not inputs.");
  const request = parsed.data;
  if (request.input.prior && request.input.priorResult) throw new JourneyError(400, "ambiguous_prior");
  for (const item of [request.input.current, ...(request.input.sources || [])]) {
    if (item && (item.kind === "html" ? typeof item.data !== "string" : !item.data || typeof item.data !== "object" || Array.isArray(item.data))) throw new JourneyError(400, "invalid_snapshot");
  }
  if (new Set(request.input.sources?.map(s => s.id)).size !== (request.input.sources?.length || 0)) throw new JourneyError(400, "duplicate_source");
  if (request.input.prior && request.input.prior.recipeId !== request.recipeId) throw new JourneyError(409, "prior_recipe_mismatch");
  const unsupported = value => typeof value === "string" ? /[\u0000\uD800-\uDFFF]/u.test(value) || credentialHits(value).length > 0
    : value && typeof value === "object" && Object.entries(value).some(([k, v]) => unsupported(k) || unsupported(v));
  if (unsupported(request)) throw new JourneyError(422, "sensitive_or_unsupported_input", "Remove credential-shaped material and unsupported JSON characters before submitting snapshots.");
  return request;
}

export function operationKey(raw) {
  if (typeof raw !== "string" || !/^[A-Za-z0-9._:-]{8,160}$/.test(raw)) throw new JourneyError(400, "operation_key_required", "Persist an 8–160 character Idempotency-Key before admission and reuse it with the exact body after reply loss.");
  return raw;
}
export function jobId(raw) {
  if (typeof raw !== "string" || !/^wcl_[a-f0-9]{64}$/.test(raw)) throw new JourneyError(404, "not_found");
  return raw;
}
export function taskId(raw) {
  if (!identifier.safeParse(raw).success) throw new JourneyError(400, "task_id_required");
  return raw;
}
export const hash = value => `sha256:${hashRequest(value)}`;
export function recipeCatalog() {
  return { schema: "samedaydesk.useful-journey-entry.v1", recipes: RECIPE_IDS, suppliedSnapshotsOnly: true,
    publicEvaluation: true, admission: "existing project-scoped writer or owner grant",
    sourceAcceptance: "pending Root receiving", publicationVerified: false, productionReady: false,
    earnedWorkAcceptance: false, paymentAttempted: false, outsideUsefulUse: "unobserved", limits: DEFAULT_LIMITS };
}
