import { createHash } from "node:crypto";
import type pg from "pg";
import { hashRequest, newId } from "../crypto.js";
import { ApiError } from "../errors.js";
import type { ContributorPrincipal, Provenance } from "../types.js";
import { atomicToDecimal } from "./atomic.js";
import { assertNoPrivate } from "./redact.js";
import { canonicalRoundTerms, hashRoundTerms, type RoundTermsInput } from "./terms.js";
import { absentHostedDelivery, projectionForRound, type HostedDeliveryProjection } from "./hosted.js";
import {
  observedSchema,
  discoveryEvidenceSchema,
  workflowEvidenceSchema,
  selfReportSchema,
  type createRoundBodySchema,
  type importBodySchema,
} from "./validate.js";
import type { z } from "zod";

type RoundBody = z.infer<typeof createRoundBodySchema>;
type ImportBody = z.infer<typeof importBodySchema>;

export type OpportunityKernel = {
  now(): Date;
  withOpportunityClient<T>(
    fn: (client: pg.PoolClient) => Promise<T>,
    recover: "idempotent" | "read" | "none",
  ): Promise<T>;
};

type RoundRow = {
  id: string;
  round_key: string;
  provenance: Provenance;
  status: "open" | "closed";
  production_admission: boolean;
  principal_cap_atomic: string;
  atomic_scale: number;
  asset: string;
  network: string;
  chain_id: number;
  terms_version: string;
  terms_document: unknown;
  submission_deadline: Date;
  claim_ttl_seconds: number;
  review_within_days: number;
  max_clarifications: number;
  max_evidence_bytes: number;
  transfer_fee_cap: unknown;
  created_at: Date;
  updated_at: Date;
};

type OfferRow = {
  id: string;
  round_id: string;
  offer_key: string;
  title: string;
  summary: string;
  slot_count: number;
  owner_reserved_slots: number;
  reward_atomic: string;
  max_effort_seconds: number;
  acceptance: string;
  evidence_kind: "discovery_trace" | "workflow_witness";
  public_claimable: boolean;
  rank: number;
};

type ClaimRow = {
  id: string;
  round_id: string;
  offer_id: string;
  kind: "imported_personal" | "owner_assigned" | "public_claim";
  status: string;
  public_label: string;
  credential_ref: string;
  contributor_token_id: string;
  import_key: string | null;
  import_request_hash: string | null;
  settlement_key: string;
  terms_version: string;
  reward_atomic: string;
  defer_start: boolean;
  expires_at: Date;
  assigned_scope: unknown;
  created_at: Date;
  updated_at: Date;
};

const OCCUPYING = "('reserved','submitted','accepted','owed')";
const OWNER = "owner";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function uniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}

function iso(value: Date): string {
  return value.toISOString();
}

function big(value: string | number | bigint): bigint {
  return BigInt(value);
}

function digestText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function settlementKey(parts: string[]): string {
  return `stl_${digestText(parts.join("|")).slice(0, 32)}`;
}

function emptyObservation(): Record<string, number> {
  return {
    contacted: 0,
    delivered: 0,
    replied: 0,
    claimed: 0,
    completed: 0,
    accepted: 0,
    paid: 0,
    useful_later_consumer: 0,
  };
}

function rewardView(atomic: bigint, round: RoundRow) {
  return {
    amount: atomicToDecimal(atomic, round.atomic_scale),
    atomic: atomic.toString(),
    asset: round.asset,
    network: round.network,
    chainId: round.chain_id,
  };
}

export class OpportunityService {
  constructor(
    private readonly kernel: OpportunityKernel,
    private readonly hosted: HostedDeliveryProjection = absentHostedDelivery(),
  ) {}

  private hostedFor(roundKey: string): HostedDeliveryProjection {
    return projectionForRound(this.hosted, roundKey);
  }

  async createRound(body: RoundBody, idempotencyKey: string): Promise<{ replayed: boolean; statusCode: number; body: unknown }> {
    assertNoPrivate(body, "round");
    const termsInput = toTermsInput(body);
    if (body.offers.some((offer) => (offer.ownerReservedSlots ?? 0) > offer.slotCount)) {
      throw new ApiError(400, "invalid_input", "personal reserved capacity cannot exceed offer slots");
    }
    const catalog = body.offers.reduce((sum, offer) => sum + BigInt(offer.slotCount) * BigInt(offer.rewardAtomic), 0n);
    const cap = BigInt(body.principalCapAtomic);
    if (body.provenance === "production" && body.productionAdmission !== true) {
      throw new ApiError(400, "fixture_not_admitted", "production admission must be explicit");
    }
    if (body.provenance !== "production" && body.productionAdmission) {
      throw new ApiError(400, "fixture_not_admitted", "fixture and test rounds cannot be admitted as production");
    }
    const terms = canonicalRoundTerms(termsInput);
    const termsVersion = hashRoundTerms(termsInput);
    if (body.expectedTermsVersion && body.expectedTermsVersion !== termsVersion) {
      throw new ApiError(409, "terms_changed", "expectedTermsVersion does not match the canonical terms");
    }
    if (catalog > cap) {
      const existing = await this.kernel.withOpportunityClient(async (client) => {
        const found = await client.query<{ terms_version: string }>(
          `SELECT terms_version FROM opportunity_rounds WHERE round_key = $1 AND provenance = $2`,
          [body.roundKey, body.provenance],
        );
        return found.rows[0] ?? null;
      }, "read");
      if (existing && existing.terms_version !== termsVersion) {
        throw new ApiError(409, "round_unchanged", "round terms are already fixed and were not replaced");
      }
      if (!existing) {
        throw new ApiError(400, "oversubscribed", "offer catalog exceeds the principal cap");
      }
    }
    const requestHash = hashRequest(body);
    const scopeId = `${body.provenance}:${body.roundKey}`;
    try {
      return await this.kernel.withOpportunityClient(async (client) => {
        const replay = await loadIdempotency(client, "opportunity_round_create", scopeId, idempotencyKey, requestHash, OWNER);
        if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
        const now = this.kernel.now();
        const id = newId("rnd");
        await client.query(
          `INSERT INTO opportunity_rounds (
             id, round_key, provenance, status, production_admission, principal_cap_atomic, atomic_scale,
             asset, network, chain_id, terms_version, terms_document, submission_deadline, claim_ttl_seconds,
             review_within_days, max_clarifications, max_evidence_bytes, transfer_fee_cap, created_at, updated_at
           ) VALUES (
             $1,$2,$3,'open',$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17::jsonb,$18,$18
           )`,
          [
            id,
            body.roundKey,
            body.provenance,
            body.productionAdmission,
            body.principalCapAtomic,
            body.atomicScale,
            body.asset,
            body.network,
            body.chainId,
            termsVersion,
            JSON.stringify(terms),
            new Date(body.submissionDeadline),
            body.claimTtlSeconds,
            body.reviewWithinDays,
            body.maxClarifications,
            body.maxEvidenceBytes ?? 12000,
            JSON.stringify(body.transferFeeCap),
            now,
          ],
        );
        for (const offer of body.offers) {
          await client.query(
            `INSERT INTO opportunity_offers (
               id, round_id, offer_key, title, summary, slot_count, reward_atomic, max_effort_seconds,
               acceptance, evidence_kind, public_claimable, rank, created_at, owner_reserved_slots
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              newId("ofr"),
              id,
              offer.offerKey,
              offer.title,
              offer.summary,
              offer.slotCount,
              offer.rewardAtomic,
              offer.maxEffortSeconds,
              offer.acceptance,
              offer.evidenceKind,
              offer.publicClaimable,
              offer.rank,
              now,
              offer.ownerReservedSlots ?? 0,
            ],
          );
        }
        for (const alternative of body.alternatives) {
          await client.query(
            `INSERT INTO opportunity_alternatives (
               id, round_id, rank, alternative_key, title, summary, funded, paid_slot, created_at
             ) VALUES ($1,$2,$3,$4,$5,$6,FALSE,FALSE,$7)`,
            [newId("alt"), id, alternative.rank, alternative.alternativeKey, alternative.title, alternative.summary, now],
          );
        }
        const view = await this.roundView(client, id, false);
        const response = { ...view, created: true };
        await saveIdempotency(client, "opportunity_round_create", scopeId, idempotencyKey, requestHash, 201, response, now, OWNER);
        return { replayed: false, statusCode: 201, body: response };
      }, "idempotent");
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
      return this.kernel.withOpportunityClient(async (client) => {
        const existing = await this.lockRound(client, body.roundKey, body.provenance);
        if (existing.terms_version !== termsVersion) {
          throw new ApiError(409, "round_unchanged", "round terms are already fixed and were not replaced");
        }
        const view = await this.roundView(client, existing.id, false);
        return { replayed: true, statusCode: 200, body: { ...view, created: false } };
      }, "read");
    }
  }

  async importClaim(
    roundKey: string,
    body: ImportBody & { scope?: { title: string; instructions: string } },
    idempotencyKey: string,
    token: string,
    tokenHash: string,
    kind: "imported_personal" | "owner_assigned",
  ) {
    assertNoPrivate(body, "import");
    if (kind === "owner_assigned" && !body.scope) {
      throw new ApiError(400, "invalid_input", "an assignment requires a scoped task");
    }
    const requestHash = hashRequest(body);
    try {
      return await this.kernel.withOpportunityClient(async (client) => {
        const round = await this.lockRound(client, roundKey, body.provenance);
        const replay = await loadIdempotency(client, kind === "imported_personal" ? "opportunity_import" : "opportunity_assign", round.id, idempotencyKey, requestHash, OWNER);
        if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
        assertAdmission(round, body.credentialRef, body.provenance);
        await this.expireUnlearned(client, round.id);
        const offer = await this.requireOffer(client, round.id, body.offerKey);
        if (kind === "imported_personal" && offer.offer_key !== body.offerKey) {
          throw new ApiError(404, "not_found", "offer not found");
        }
        const existing = await this.findIdentity(client, round.id, offer.id, body.credentialRef, body.importKey);
        if (existing) {
          assertImportIdentity(existing, offer, body, kind);
          return this.replayIdentity(client, round, offer, existing, false);
        }
        await this.ensureCapacity(client, round, offer, BigInt(offer.reward_atomic));
        const now = this.kernel.now();
        const priorToken = await client.query<{ contributor_token_id: string }>(
          `SELECT contributor_token_id FROM opportunity_claims
           WHERE round_id = $1 AND credential_ref = $2 ORDER BY created_at LIMIT 1`,
          [round.id, body.credentialRef],
        );
        let tokenId = priorToken.rows[0]?.contributor_token_id ?? "";
        let issuedToken: string | undefined;
        if (!tokenId) {
          tokenId = newId("tok");
          issuedToken = token;
          await client.query(
            `INSERT INTO earned_work_contributor_tokens (
               id, public_id, token_hash, payout_destination, task_scope, provenance, expires_at, revoked_at, created_at
             ) VALUES ($1,$2,$3,NULL,$4,$5,NULL,NULL,$6)`,
            [tokenId, body.publicLabel, tokenHash, `opportunity:${round.id}`, round.provenance, now],
          );
        }
        const claim = await this.insertClaim(client, {
          round,
          offer,
          kind,
          publicLabel: body.publicLabel,
          credentialRef: body.credentialRef,
          tokenId,
          importKey: body.importKey,
          importRequestHash: importIntentHash(body, kind),
          deferStart: body.deferStart === true,
          scope: body.scope ?? null,
          now,
        });
        await this.appendEvent(client, round.id, claim.id, "import", { offerKey: offer.offer_key, kind }, now);
        const response = holderClaim(round, offer, claim, {
          created: true,
          token: issuedToken,
          tokenReissued: false,
          credentialGrant: issuedToken
            ? round.provenance === "production"
              ? "production"
              : "fixture_or_test_only"
            : "already_issued",
          productionCredential: round.provenance === "production",
        });
        await saveIdempotency(
          client,
          kind === "imported_personal" ? "opportunity_import" : "opportunity_assign",
          round.id,
          idempotencyKey,
          requestHash,
          201,
          response,
          now,
          OWNER,
        );
        return { replayed: false, statusCode: 201, body: response };
      }, "idempotent");
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
      return this.kernel.withOpportunityClient(async (client) => {
        const round = await this.lockRound(client, roundKey, body.provenance);
        const offer = await this.requireOffer(client, round.id, body.offerKey);
        const existing = await this.findIdentity(client, round.id, offer.id, body.credentialRef, body.importKey);
        if (!existing) throw new ApiError(409, "import_conflict", "import identity collided");
        assertImportIdentity(existing, offer, body, kind);
        return this.replayIdentity(client, round, offer, existing, false);
      }, "read");
    }
  }

  async claim(
    roundKey: string,
    body: {
      provenance: Provenance;
      offerKey: string;
      termsVersion: string;
      publicLabel: string;
      volunteeredObservation?: {
        placementId: string | null;
        campaignId: string | null;
        sourceId: string | null;
        providerId: string | null;
        query: string | null;
      };
    },
    contributor: ContributorPrincipal,
    idempotencyKey: string,
    authenticatedEndpoint?: string,
  ) {
    assertNoPrivate(body, "claim");
    const requestHash = hashRequest(body);
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, body.provenance);
      const replayAck = await loadIdempotency(client, "opportunity_holder_ack", round.id, idempotencyKey, requestHash, contributor.id);
      if (replayAck.hit) return { replayed: true, statusCode: replayAck.statusCode, body: replayAck.body };
      const replay = await loadIdempotency(client, "opportunity_claim", round.id, idempotencyKey, requestHash, contributor.id);
      if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
      assertAdmission(round, contributor.id, contributor.provenance);
      if (contributor.taskScope && contributor.taskScope !== `opportunity:${round.id}`) {
        throw new ApiError(403, "forbidden", "contributor token is scoped to a different round");
      }
      await this.expireUnlearned(client, round.id);
      const now = this.kernel.now();
      if (body.termsVersion !== round.terms_version) {
        const response = await this.route(client, round, contributor, "terms_mismatch", "terms_changed", "termsVersion does not match the fixed round terms", now);
        await saveIdempotency(client, "opportunity_claim", round.id, idempotencyKey, requestHash, 409, response, now, contributor.id);
        return { replayed: false, statusCode: 409, body: response };
      }
      const offer = await this.findOffer(client, round.id, body.offerKey);
      if (!offer) {
        const response = await this.route(client, round, contributor, "offer_mismatch", "offer_mismatch", "offer is not in this round", now);
        await saveIdempotency(client, "opportunity_claim", round.id, idempotencyKey, requestHash, 409, response, now, contributor.id);
        return { replayed: false, statusCode: 409, body: response };
      }
      const credentialRef = await this.credentialForToken(client, round.id, contributor.id);
      const existing = await this.findOccupying(client, round.id, offer.id, credentialRef, contributor.id);
      if (existing) {
        if (existing.kind === "imported_personal" || existing.kind === "owner_assigned") {
          if (existing.contributor_token_id !== contributor.id) {
            throw new ApiError(403, "forbidden", "reservation belongs to a different holder");
          }
          const locked = await this.lockClaim(client, existing.id);
          if (!locked || !["reserved", "submitted", "accepted", "owed"].includes(locked.status)) {
            throw new ApiError(409, "late_submission", "reservation is no longer occupying");
          }
          const priorAck = await client.query<{ id: string }>(
            `SELECT id FROM opportunity_events WHERE claim_id = $1 AND kind = 'holder_acknowledgement' LIMIT 1`,
            [locked.id],
          );
          let acknowledgementCreated = false;
          if (!priorAck.rows[0]) {
            await this.appendEvent(client, round.id, locked.id, "holder_acknowledgement", {
              newSlot: false,
              additionalPaidSlot: false,
              verifiedExternalActivity: false,
              externalIdentity: "unknown",
              externalDelivery: "unknown",
              externalAcquisition: "unknown",
              ownerIssuance: false,
              readback: false,
            }, now);
            acknowledgementCreated = true;
          }
          const response = {
            ...holderClaim(round, offer, locked, { created: false, tokenReissued: false }),
            stage: "holder_acknowledgement",
            holderOriginatedAcknowledgement: true,
            acknowledgementCreated,
            additionalPaidSlot: false,
            newReservation: false,
            verifiedExternalActivity: false,
            externalIdentity: "unknown",
            externalDelivery: "unknown",
            externalAcquisition: "unknown",
            hostedDelivery: this.hostedFor(round.round_key),
          };
          const statusCode = acknowledgementCreated ? 201 : 200;
          await saveIdempotency(client, "opportunity_holder_ack", round.id, idempotencyKey, requestHash, statusCode, response, now, contributor.id);
          return { replayed: false, statusCode, body: response };
        }
        const response = holderClaim(round, offer, existing, { created: false, tokenReissued: false });
        await saveIdempotency(client, "opportunity_claim", round.id, idempotencyKey, requestHash, 200, response, now, contributor.id);
        return { replayed: false, statusCode: 200, body: response };
      }
      const historical = await client.query<ClaimRow>(
        `SELECT * FROM opportunity_claims WHERE round_id=$1 AND offer_id=$2
         AND (credential_ref=$3 OR contributor_token_id=$4) LIMIT 1`,
        [round.id, offer.id, credentialRef, contributor.id],
      );
      if (historical.rows[0]) {
        const response = await this.route(client, round, contributor, "reservation_expired", "late_submission", "previous unearned reservation has expired", now, body.publicLabel);
        await saveIdempotency(client, "opportunity_claim", round.id, idempotencyKey, requestHash, 409, response, now, contributor.id);
        return { replayed: false, statusCode: 409, body: response };
      }
      const closed = round.status !== "open" || round.submission_deadline.getTime() <= now.getTime();
      const publicBlocked = !offer.public_claimable;
      let full = false;
      let over = false;
      if (!closed && !publicBlocked) {
        const slots = await this.occupyingCount(client, offer.id);
        full = slots + await this.pendingOwnerSlots(client, offer) >= offer.slot_count;
        const committed = await this.committed(client, round.id);
        over = committed + big(offer.reward_atomic) > big(round.principal_cap_atomic);
      }
      if (closed || publicBlocked || full || over) {
        const reason = closed ? "closed" : publicBlocked ? "offer_mismatch" : over ? "oversubscribed" : "offer_full";
        const code = reason === "offer_full" ? "offer_full" : reason === "oversubscribed" ? "oversubscribed" : reason === "closed" ? "round_closed" : "offer_mismatch";
        const message = publicBlocked
          ? "this offer is reserved for an owner-confirmed scoped task and is not a public claim"
          : closed
            ? "round is closed; existing obligations are unchanged"
            : over
              ? "remaining principal cap does not cover this reward"
              : "offer slots are full";
        const response = await this.route(client, round, contributor, reason, code, message, now, body.publicLabel);
        await saveIdempotency(client, "opportunity_claim", round.id, idempotencyKey, requestHash, 409, response, now, contributor.id);
        return { replayed: false, statusCode: 409, body: response };
      }
      const claim = await this.insertClaim(client, {
        round,
        offer,
        kind: "public_claim",
        publicLabel: body.publicLabel,
        credentialRef,
        tokenId: contributor.id,
        importKey: null,
        deferStart: false,
        scope: null,
        now,
      });
      const eventId = newId("evt");
      const observed = {
        server: {
          eventIds: [eventId],
          placementId: null,
          campaignId: null,
          sourceId: null,
          providerId: null,
          query: null,
          endpoint: authenticatedEndpoint ?? `/v1/opportunity-rounds/${round.round_key}/claims`,
          reconstructed: false,
        },
        volunteered: body.volunteeredObservation ?? null,
      };
      await client.query(
        `INSERT INTO opportunity_source_records (id, round_id, claim_id, self_report, observed, created_at)
         VALUES ($1,$2,$3,'{}'::jsonb,$4::jsonb,$5)`,
        [newId("src"), round.id, claim.id, JSON.stringify(observed), now],
      );
      await this.appendEvent(client, round.id, claim.id, "claim", { eventId, endpoint: observed.server.endpoint, offerKey: offer.offer_key, reconstructed: false }, now);
      const response = holderClaim(round, offer, claim, { created: true });
      await saveIdempotency(client, "opportunity_claim", round.id, idempotencyKey, requestHash, 201, response, now, contributor.id);
      return { replayed: false, statusCode: 201, body: response };
    }, "idempotent");
  }

  async submit(
    roundKey: string,
    claimId: string,
    body: {
      provenance: Provenance;
      artifact: { ref: string; digestSha256: string; mediaType: string; bytes: number };
      evidence: Record<string, unknown>;
      modelUsage?: string | null;
      contributorActiveMinutes?: number | null;
    },
    contributor: ContributorPrincipal,
    idempotencyKey: string,
  ) {
    assertNoPrivate(body, "submission");
    const evidenceJson = JSON.stringify(body.evidence);
    const evidenceBytes = Buffer.byteLength(evidenceJson, "utf8");
    const requestHash = hashRequest({ claimId, ...body });
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, body.provenance);
      const replay = await loadIdempotency(client, "opportunity_submit", round.id, idempotencyKey, requestHash, contributor.id);
      if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
      await this.expireUnlearned(client, round.id);
      const claim = await this.lockClaim(client, claimId);
      if (!claim || claim.round_id !== round.id) throw new ApiError(404, "not_found", "claim not found");
      if (claim.contributor_token_id !== contributor.id) {
        throw new ApiError(403, "forbidden", "claim belongs to a different credential");
      }
      const now = this.kernel.now();
      if (claim.status === "expired" || claim.status === "released") {
        throw new ApiError(409, "late_submission", "unearned reservation has expired");
      }
      if (claim.defer_start) {
        const response = {
          outcome: "deferred_start",
          error: { code: "deferred_start", message: "do not start work until a receiving route is agreed" },
          paid: false,
          transfer: null,
          paidSlot: true,
          budgetedReservation: true,
          rewardPromised: true,
          revenue: false,
          escrowed: false,
          doNotStartWork: true,
          claimAuthority: "holder",
          kernelObligationMinted: false,
          nextAction: "wait_for_receiving_route",
          note: "The reservation and promised asset stay. Starting is deferred. Nothing is transferred.",
          claim: claimView(round, claim),
        };
        await saveIdempotency(client, "opportunity_submit", round.id, idempotencyKey, requestHash, 409, response, now, contributor.id);
        return { replayed: false, statusCode: 409, body: response };
      }
      if (claim.status === "expired" || claim.status === "released" || claim.expires_at.getTime() <= now.getTime() && claim.status === "reserved") {
        throw new ApiError(409, "late_submission", "unearned reservation has expired");
      }
      if (claim.terms_version !== round.terms_version) {
        throw new ApiError(409, "terms_changed", "claim is bound to a different terms version");
      }
      if (evidenceBytes > round.max_evidence_bytes || body.artifact.bytes > round.max_evidence_bytes) {
        throw new ApiError(400, "oversize", "evidence exceeds the round maximum");
      }
      if (body.artifact.bytes !== evidenceBytes) {
        throw new ApiError(400, "invalid_input", "artifact.bytes must equal the evidence byte length");
      }
      if (body.artifact.mediaType !== "application/json") {
        throw new ApiError(400, "invalid_input", "opportunity evidence must be application/json metadata");
      }
      if (body.artifact.digestSha256 !== digestText(evidenceJson)) {
        throw new ApiError(400, "invalid_input", "artifact.digestSha256 does not match the evidence bytes");
      }
      const offer = await this.offerById(client, claim.offer_id);
      assertEvidenceShape(offer.evidence_kind, body.evidence);
      const existingSubmission = await client.query<{ id: string; artifact_digest_sha256: string; artifact_ref: string; evidence: unknown }>(
        `SELECT id, artifact_digest_sha256, artifact_ref, evidence FROM opportunity_submissions WHERE claim_id = $1`, [claim.id],
      );
      if (existingSubmission.rows[0]) {
        const prior = existingSubmission.rows[0];
        if (prior.artifact_digest_sha256 !== body.artifact.digestSha256 || prior.artifact_ref !== body.artifact.ref || stableJson(prior.evidence) !== stableJson(body.evidence)) {
          throw new ApiError(409, "duplicate_submission", "claim already has different evidence");
        }
        const response = await this.submissionView(client, round, claim, prior.id, false);
        await saveIdempotency(client, "opportunity_submit", round.id, idempotencyKey, requestHash, 200, response, now, contributor.id);
        return { replayed: false, statusCode: 200, body: response };
      }
      if (claim.status !== "reserved") throw new ApiError(409, "duplicate_submission", "claim is not open for submission");
      const submissionId = newId("osub");
      await client.query(
        `INSERT INTO opportunity_submissions (
           id, claim_id, round_id, terms_version, evidence, evidence_bytes,
           artifact_ref, artifact_digest_sha256, artifact_media_type, artifact_bytes, created_at
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)`,
        [
          submissionId,
          claim.id,
          round.id,
          claim.terms_version,
          evidenceJson,
          evidenceBytes,
          body.artifact.ref,
          body.artifact.digestSha256,
          body.artifact.mediaType,
          body.artifact.bytes,
          now,
        ],
      );
      const selfReport = isRecord(body.evidence.selfReport) ? body.evidence.selfReport : {};
      const serverObserved = await this.serverObserved(client, claim.id);
      await client.query(
        `INSERT INTO opportunity_source_records (id, round_id, claim_id, self_report, observed, created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
        [
          newId("src"),
          round.id,
          claim.id,
          JSON.stringify({ ...selfReport, modelUsage: body.modelUsage ?? null, contributorActiveMinutes: body.contributorActiveMinutes ?? null }),
          JSON.stringify(serverObserved),
          now,
        ],
      );
      await client.query(`UPDATE opportunity_claims SET status = 'submitted', updated_at = $2 WHERE id = $1`, [claim.id, now]);
      await this.appendEvent(client, round.id, claim.id, "submission", { submissionId, fetchedArtifact: false }, now);
      const response = await this.submissionView(client, round, { ...claim, status: "submitted" }, submissionId, true);
      await saveIdempotency(client, "opportunity_submit", round.id, idempotencyKey, requestHash, 201, response, now, contributor.id);
      return { replayed: false, statusCode: 201, body: response };
    }, "idempotent");
  }

  async accept(
    roundKey: string,
    claimId: string,
    provenance: Provenance,
    idempotencyKey: string,
    requesterActiveMinutes: number | null,
  ) {
    const requestHash = hashRequest({ claimId, requesterActiveMinutes, provenance });
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, provenance);
      const replay = await loadIdempotency(client, "opportunity_accept", round.id, idempotencyKey, requestHash, OWNER);
      if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
      await this.expireUnlearned(client, round.id);
      const claim = await this.lockClaim(client, claimId);
      if (!claim || claim.round_id !== round.id) throw new ApiError(404, "not_found", "claim not found");
      const now = this.kernel.now();
      const existing = await client.query<{ id: string }>(`SELECT id FROM opportunity_obligations WHERE claim_id = $1`, [claim.id]);
      if (existing.rows[0]) {
        const response = await this.obligationView(client, round, claim, existing.rows[0].id, false);
        await saveIdempotency(client, "opportunity_accept", round.id, idempotencyKey, requestHash, 200, response, now, OWNER);
        return { replayed: false, statusCode: 200, body: response };
      }
      if (claim.status !== "submitted") throw new ApiError(409, "conflict", "acceptance requires a bounded submission");
      const submission = await client.query<{ id: string; terms_version: string }>(
        `SELECT id, terms_version FROM opportunity_submissions WHERE claim_id = $1`,
        [claim.id],
      );
      const submissionRow = submission.rows[0];
      if (!submissionRow) throw new ApiError(409, "conflict", "acceptance requires a bounded submission");
      if (submissionRow.terms_version !== claim.terms_version) {
        throw new ApiError(409, "terms_changed", "submission terms do not match the claim");
      }
      const obligationId = newId("oobl");
      await client.query(
        `INSERT INTO opportunity_obligations (
           id, claim_id, round_id, settlement_key, reward_atomic, asset, network, chain_id, terms_version,
           payout_state, adapter, kind, transfer, paid, settled, revenue, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'owed','null_nonpaying_v0','owed_record',NULL,FALSE,FALSE,FALSE,$10)`,
        [
          obligationId,
          claim.id,
          round.id,
          claim.settlement_key,
          claim.reward_atomic,
          round.asset,
          round.network,
          round.chain_id,
          claim.terms_version,
          now,
        ],
      );
      await client.query(`UPDATE opportunity_claims SET status = 'owed', updated_at = $2 WHERE id = $1`, [claim.id, now]);
      await this.appendEvent(client, round.id, claim.id, "acceptance", { obligationId, requesterActiveMinutes }, now);
      await this.appendEvent(client, round.id, claim.id, "owed", { obligationId, transfer: null, paid: false }, now);
      const response = await this.obligationView(client, round, { ...claim, status: "owed" }, obligationId, true);
      await saveIdempotency(client, "opportunity_accept", round.id, idempotencyKey, requestHash, 201, response, now, OWNER);
      return { replayed: false, statusCode: 201, body: response };
    }, "idempotent");
  }

  async acknowledgeStart(roundKey: string, claimId: string, provenance: Provenance, contributor: ContributorPrincipal, idempotencyKey: string) {
    const requestHash = hashRequest({ claimId, provenance, action: "start" });
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, provenance);
      const replay = await loadIdempotency(client, "opportunity_start", round.id, idempotencyKey, requestHash, contributor.id);
      if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
      await this.expireUnlearned(client, round.id);
      const claim = await this.lockClaim(client, claimId);
      if (!claim || claim.round_id !== round.id) throw new ApiError(404, "not_found", "claim not found");
      if (claim.contributor_token_id !== contributor.id) throw new ApiError(403, "forbidden", "claim belongs to a different credential");
      const now = this.kernel.now();
      if (claim.status !== "reserved") throw new ApiError(409, "late_submission", "start requires a current unearned reservation");
      if (claim.defer_start) {
        await client.query(`UPDATE opportunity_claims SET defer_start = FALSE, updated_at = $2 WHERE id = $1`, [claim.id, now]);
      }
      const offer = await this.offerById(client, claim.offer_id);
      const response = holderClaim(round, offer, { ...claim, defer_start: false }, { created: false });
      await saveIdempotency(client, "opportunity_start", round.id, idempotencyKey, requestHash, 200, response, now, contributor.id);
      return { replayed: false, statusCode: 200, body: response };
    }, "idempotent");
  }

  async readRound(roundKey: string, provenance: Provenance | null) {
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.resolveRound(client, roundKey, provenance, true);
      await this.expireUnlearned(client, round.id);
      return this.roundView(client, round.id, true);
    }, "read");
  }

  async readClaim(roundKey: string, claimId: string, provenance: Provenance, contributor: ContributorPrincipal | null, owner: boolean) {
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, provenance);
      await this.expireUnlearned(client, round.id);
      const claim = await this.lockClaim(client, claimId);
      if (!claim || claim.round_id !== round.id) throw new ApiError(404, "not_found", "claim not found");
      if (!owner && (!contributor || contributor.id !== claim.contributor_token_id)) {
        throw new ApiError(403, "forbidden", "claim readback requires the holding credential");
      }
      const offer = await this.offerById(client, claim.offer_id);
      const obligation = await client.query<{ id: string }>(`SELECT id FROM opportunity_obligations WHERE claim_id = $1`, [claim.id]);
      const base = {
        ...holderClaim(round, offer, claim, { created: false }),
        hostedDelivery: this.hostedFor(round.round_key),
      };
      if (!obligation.rows[0]) return base;
      return {
        ...base,
        obligation: obligationBody(round, claim, obligation.rows[0].id),
      };
    }, "read");
  }

  async listClaims(roundKey: string, provenance: Provenance) {
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, provenance);
      await this.expireUnlearned(client, round.id);
      const result = await client.query<ClaimRow & { offer_key: string }>(
        `SELECT c.*, o.offer_key FROM opportunity_claims c
         JOIN opportunity_offers o ON o.id = c.offer_id
         WHERE c.round_id = $1 ORDER BY c.created_at, c.id`,
        [round.id],
      );
      return {
        roundKey: round.round_key,
        provenance: round.provenance,
        claims: result.rows.map((row) => ({
          id: row.id,
          offerKey: row.offer_key,
          kind: row.kind,
          status: row.status,
          publicLabel: row.public_label,
          settlementKey: row.settlement_key,
          rewardAtomic: row.reward_atomic,
          deferStart: row.defer_start,
          expiresAt: iso(row.expires_at),
          termsVersion: row.terms_version,
        })),
      };
    }, "read");
  }

  async cohort(roundKey: string, provenance: Provenance) {
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, provenance);
      const events = await client.query<{ kind: string; n: string }>(
        `SELECT kind, COUNT(*)::text AS n FROM opportunity_cohort_events WHERE round_id = $1 GROUP BY kind`,
        [round.id],
      );
      const counts = Object.fromEntries(events.rows.map((row) => [row.kind, Number(row.n)])) as Record<string, number>;
      const pick = (kind: string) => counts[kind] ?? 0;
      const reservations = await client.query<{
        owner_import_rows: string;
        owner_assignment_rows: string;
        public_claim_rows: string;
        rows: string;
        unique_recipients: string;
        deferred_rows: string;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE kind = 'imported_personal')::text AS owner_import_rows,
           COUNT(*) FILTER (WHERE kind = 'owner_assigned')::text AS owner_assignment_rows,
           COUNT(*) FILTER (WHERE kind = 'public_claim')::text AS public_claim_rows,
           COUNT(*)::text AS rows,
           COUNT(DISTINCT credential_ref)::text AS unique_recipients,
           COUNT(*) FILTER (WHERE defer_start)::text AS deferred_rows
         FROM opportunity_claims WHERE round_id = $1`,
        [round.id],
      );
      const reservation = reservations.rows[0];
      const submissions = await client.query<{ rows: string; recipients: string }>(
        `SELECT COUNT(*)::text AS rows, COUNT(DISTINCT c.credential_ref)::text AS recipients
         FROM opportunity_submissions s
         JOIN opportunity_claims c ON c.id = s.claim_id
         WHERE s.round_id = $1`,
        [round.id],
      );
      const obligations = await client.query<{ rows: string; recipients: string; paid_rows: string }>(
        `SELECT COUNT(*)::text AS rows,
                COUNT(DISTINCT c.credential_ref)::text AS recipients,
                COUNT(*) FILTER (WHERE o.paid)::text AS paid_rows
         FROM opportunity_obligations o
         JOIN opportunity_claims c ON c.id = o.claim_id
         WHERE o.round_id = $1`,
        [round.id],
      );
      const acks = await client.query<{ events: string; recipients: string }>(
        `SELECT COUNT(*)::text AS events, COUNT(DISTINCT c.credential_ref)::text AS recipients
         FROM opportunity_events e
         JOIN opportunity_claims c ON c.id = e.claim_id
         WHERE e.round_id = $1 AND e.kind = 'holder_acknowledgement'`,
        [round.id],
      );
      const requests = await client.query<{ scope: string; n: string }>(
        `SELECT scope, COUNT(*)::text AS n FROM earned_work_idempotency
         WHERE task_id = $1 AND scope IN (
           'opportunity_import', 'opportunity_assign', 'opportunity_holder_ack',
           'opportunity_submit', 'opportunity_accept', 'opportunity_claim'
         )
         GROUP BY scope`,
        [round.id],
      );
      const requestCount = Object.fromEntries(requests.rows.map((row) => [row.scope, Number(row.n)])) as Record<string, number>;
      const channels = await client.query<{ channel: string; kind: string; n: string }>(
        `SELECT COALESCE(channel, 'unknown') AS channel, kind, COUNT(*)::text AS n
         FROM opportunity_cohort_events WHERE round_id = $1 GROUP BY 1, 2`,
        [round.id],
      );
      const observations = {
        email: emptyObservation(),
        http: emptyObservation(),
        operator: emptyObservation(),
        unknown: emptyObservation(),
      };
      for (const row of channels.rows) {
        const bucket = observations[row.channel as keyof typeof observations] ?? observations.unknown;
        if (row.kind in bucket) bucket[row.kind] = Number(row.n);
      }
      const claimRows = Number(reservation?.rows ?? 0);
      const submissionRows = Number(submissions.rows[0]?.rows ?? 0);
      const obligationRows = Number(obligations.rows[0]?.rows ?? 0);
      const paidObservations = pick("paid");
      const retainedObservations = pick("useful_later_consumer");
      return {
        roundKey: round.round_key,
        provenance: round.provenance,
        contacted: pick("contacted"),
        delivered: pick("delivered"),
        replied: pick("replied"),
        claimed: claimRows,
        claimedMeans: "legacy_claim_rows_including_owner_imports",
        claimedIsHolderConversion: false,
        claimedIsExternalActivity: false,
        completed: submissionRows,
        accepted: obligationRows,
        paid: 0,
        paidObservations,
        usefulLaterConsumers: retainedObservations,
        sentIsNotDelivery: true,
        paidFeedbackIsRevenue: false,
        organicAdoption: false,
        routeConversion: "unknown",
        agentConversion: "unknown",
        revenue: false,
        funnel: {
          schema: "neomorphic.opportunity-funnel.v1",
          reservations: {
            ownerImportRows: Number(reservation?.owner_import_rows ?? 0),
            ownerAssignmentRows: Number(reservation?.owner_assignment_rows ?? 0),
            publicClaimRows: Number(reservation?.public_claim_rows ?? 0),
            rows: claimRows,
            uniqueRecipients: Number(reservation?.unique_recipients ?? 0),
            deferredStartRows: Number(reservation?.deferred_rows ?? 0),
          },
          holderOriginated: {
            acknowledgementEvents: Number(acks.rows[0]?.events ?? 0),
            acknowledgementRequests: requestCount.opportunity_holder_ack ?? 0,
            uniqueRecipients: Number(acks.rows[0]?.recipients ?? 0),
            additionalPaidSlots: 0,
            ownerIssuanceIncluded: false,
            readbackIncluded: false,
            verifiedExternalActivity: false,
          },
          ownerIssuance: {
            importRequests: requestCount.opportunity_import ?? 0,
            assignmentRequests: requestCount.opportunity_assign ?? 0,
            verifiedExternalActivity: false,
          },
          submissions: {
            rows: submissionRows,
            requests: requestCount.opportunity_submit ?? 0,
            uniqueRecipients: Number(submissions.rows[0]?.recipients ?? 0),
          },
          acceptance: {
            rows: obligationRows,
            requests: requestCount.opportunity_accept ?? 0,
            uniqueRecipients: Number(obligations.rows[0]?.recipients ?? 0),
          },
          owed: {
            rows: obligationRows,
            paidRows: Number(obligations.rows[0]?.paid_rows ?? 0),
            settledRows: 0,
            transfer: null,
            revenue: false,
          },
          settlement: {
            stage: "separately_observed",
            observedEvents: paidObservations,
            inferredFromOwed: false,
            inferredFromAcceptance: false,
            obligationPaidRows: 0,
          },
          retainedUse: {
            stage: "separately_observed",
            observedEvents: retainedObservations,
            inferredFromSubmission: false,
            inferredFromAcceptance: false,
          },
          observations,
          external: {
            identity: "unknown",
            delivery: "unknown",
            acquisition: "unknown",
          },
        },
        note: "Legacy claimed counts claim rows, including owner imports, and is not holder conversion or external activity. Holder acknowledgements, submissions, acceptance, and owed are separate from observed settlement and retained use. Contacted or Sent is not delivery. External identity, delivery, and acquisition stay unknown until a distinct observation says otherwise. Paid observations are sponsored learning, not revenue. Obligation paid stays false.",
      };
    }, "read");
  }

  async recordCohort(
    roundKey: string,
    provenance: Provenance,
    body: { kind: string; eventRef: string; publicLabel?: string | null; activeMinutes?: number | null; channel?: "email" | "http" | "operator" },
    idempotencyKey: string,
  ) {
    assertNoPrivate(body, "cohort");
    const requestHash = hashRequest(body);
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, provenance);
      const replay = await loadIdempotency(client, "opportunity_cohort", round.id, idempotencyKey, requestHash, OWNER);
      if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
      const now = this.kernel.now();
      const channel = body.channel ?? null;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO opportunity_cohort_events (id, round_id, kind, event_ref, public_label, active_minutes, channel, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (round_id, kind, event_ref) DO NOTHING
         RETURNING id`,
        [newId("coh"), round.id, body.kind, body.eventRef, body.publicLabel ?? null, body.activeMinutes ?? null, channel, now],
      );
      if (!inserted.rows[0]) {
        const existing = await client.query<{ channel: string | null }>(
          `SELECT channel FROM opportunity_cohort_events WHERE round_id = $1 AND kind = $2 AND event_ref = $3`,
          [round.id, body.kind, body.eventRef],
        );
        if ((existing.rows[0]?.channel ?? null) !== channel) {
          throw new ApiError(409, "observation_conflict", "this observation is already recorded on a different channel");
        }
      }
      if (body.kind === "paid") {
        await this.appendEvent(client, round.id, null, "paid_observation", { eventRef: body.eventRef, flipsObligation: false }, now);
      }
      const response = { recorded: true, kind: body.kind, eventRef: body.eventRef, paid: false, revenue: false };
      await saveIdempotency(client, "opportunity_cohort", round.id, idempotencyKey, requestHash, 201, response, now, OWNER);
      return { replayed: false, statusCode: 201, body: response };
    }, "idempotent");
  }

  async closeRound(roundKey: string, provenance: Provenance, idempotencyKey: string) {
    const requestHash = hashRequest({ roundKey, provenance, action: "close" });
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, provenance);
      const replay = await loadIdempotency(client, "opportunity_close", round.id, idempotencyKey, requestHash, OWNER);
      if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
      const now = this.kernel.now();
      await client.query(`UPDATE opportunity_rounds SET status = 'closed', updated_at = $2 WHERE id = $1`, [round.id, now]);
      const owed = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM opportunity_obligations WHERE round_id = $1`,
        [round.id],
      );
      const response = {
        outcome: "closed",
        roundKey,
        provenance,
        obligationsPreserved: Number(owed.rows[0]?.n ?? 0),
        promisesRepriced: false,
        paid: false,
        transfer: null,
      };
      await saveIdempotency(client, "opportunity_close", round.id, idempotencyKey, requestHash, 200, response, now, OWNER);
      return { replayed: false, statusCode: 200, body: response };
    }, "idempotent");
  }

  async closeNotice(
    body: { campaignKey: string; preservedPromise: Record<string, unknown>; nextRoundKey?: string | null },
    idempotencyKey: string,
  ) {
    assertNoPrivate(body, "notice");
    const requestHash = hashRequest(body);
    const promiseText = JSON.stringify(body.preservedPromise);
    return this.kernel.withOpportunityClient(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('opportunity_notice'), hashtext($1))", [body.campaignKey]);
      const replay = await loadIdempotency(client, "opportunity_notice", body.campaignKey, idempotencyKey, requestHash, OWNER);
      if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
      const now = this.kernel.now();
      const existing = await client.query<{ preserved_promise: unknown; next_round_key: string | null }>(
        `SELECT preserved_promise, next_round_key FROM opportunity_notices WHERE campaign_key = $1 FOR UPDATE`,
        [body.campaignKey],
      );
      if (existing.rows[0]) {
        if (stableJson(existing.rows[0].preserved_promise) !== stableJson(body.preservedPromise)) {
          throw new ApiError(409, "promise_immutable", "closing a notice cannot change its preserved promise");
        }
        const response = noticeView(body.campaignKey, existing.rows[0].preserved_promise, existing.rows[0].next_round_key, false, this.hosted);
        await saveIdempotency(client, "opportunity_notice", body.campaignKey, idempotencyKey, requestHash, 200, response, now, OWNER);
        return { replayed: false, statusCode: 200, body: response };
      }
      await client.query(
        `INSERT INTO opportunity_notices (id, campaign_key, status, preserved_promise, next_round_key, created_at, updated_at)
         VALUES ($1,$2,'closed',$3::jsonb,$4,$5,$5)`,
        [newId("ntc"), body.campaignKey, promiseText, body.nextRoundKey ?? null, now],
      );
      const response = noticeView(body.campaignKey, body.preservedPromise, body.nextRoundKey ?? null, true, this.hosted);
      await saveIdempotency(client, "opportunity_notice", body.campaignKey, idempotencyKey, requestHash, 201, response, now, OWNER);
      return { replayed: false, statusCode: 201, body: response };
    }, "idempotent");
  }

  async joinWaitlist(
    roundKey: string,
    body: { provenance: Provenance; publicLabel: string; reason?: string },
    contributor: ContributorPrincipal,
    idempotencyKey: string,
  ) {
    assertNoPrivate(body, "waitlist");
    const requestHash = hashRequest(body);
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, body.provenance);
      const replay = await loadIdempotency(client, "opportunity_waitlist", round.id, idempotencyKey, requestHash, contributor.id);
      if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
      assertAdmission(round, contributor.id, contributor.provenance);
      if (contributor.taskScope && contributor.taskScope !== `opportunity:${round.id}`) {
        throw new ApiError(403, "forbidden", "contributor token is scoped to a different round");
      }
      const now = this.kernel.now();
      const response = await this.route(
        client,
        round,
        contributor,
        "waitlist",
        "waitlist",
        body.reason ?? "waitlist is not a paid slot",
        now,
        body.publicLabel,
      );
      await saveIdempotency(client, "opportunity_waitlist", round.id, idempotencyKey, requestHash, 200, response, now, contributor.id);
      return { replayed: false, statusCode: 200, body: response };
    }, "idempotent");
  }

  async readNotice(campaignKey: string) {
    return this.kernel.withOpportunityClient(async (client) => {
      const result = await client.query<{ preserved_promise: unknown; next_round_key: string | null }>(
        `SELECT preserved_promise, next_round_key FROM opportunity_notices WHERE campaign_key = $1`,
        [campaignKey],
      );
      const row = result.rows[0];
      if (!row) throw new ApiError(404, "not_found", "notice not found");
      return noticeView(campaignKey, row.preserved_promise, row.next_round_key, false, this.hosted);
    }, "read");
  }

  async recordSource(
    roundKey: string,
    claimId: string,
    provenance: Provenance,
    body: { selfReport: unknown; observed: unknown },
    contributor: ContributorPrincipal,
    idempotencyKey: string,
  ) {
    assertNoPrivate(body, "source");
    const selfParsed = selfReportSchema.safeParse(body.selfReport);
    const observedParsed = observedSchema.safeParse(body.observed);
    if (!selfParsed.success || !observedParsed.success) {
      throw new ApiError(400, "invalid_input", "source record failed validation");
    }
    const selfReport = selfParsed.data;
    const observed = observedParsed.data;
    assertUnknownUnfilled(selfReport);
    const requestHash = hashRequest({ claimId, provenance, ...body });
    return this.kernel.withOpportunityClient(async (client) => {
      const round = await this.lockRound(client, roundKey, provenance);
      const replay = await loadIdempotency(client, "opportunity_source", round.id, idempotencyKey, requestHash, contributor.id);
      if (replay.hit) return { replayed: true, statusCode: replay.statusCode, body: replay.body };
      const claim = await this.lockClaim(client, claimId);
      if (!claim || claim.round_id !== round.id) throw new ApiError(404, "not_found", "claim not found");
      if (claim.contributor_token_id !== contributor.id) throw new ApiError(403, "forbidden", "source record requires the holding credential");
      const now = this.kernel.now();
      const serverObserved = await this.serverObserved(client, claim.id);
      const id = newId("src");
      await client.query(
        `INSERT INTO opportunity_source_records (id, round_id, claim_id, self_report, observed, created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
        [id, round.id, claim.id, JSON.stringify(selfReport), JSON.stringify({ server: serverObserved.server, volunteered: observed }), now],
      );
      await this.appendEvent(client, round.id, claim.id, "encounter", { sourceId: id, reconstructed: false }, now);
      const response = {
        id,
        selfReport,
        observed: { server: serverObserved.server, volunteered: observed },
        reconstructed: false,
        currentQueryIsOriginalEncounter: false,
        currentReferrerIsOriginalEncounter: false,
        note: "Self-report and observed request evidence stay separate. A current query or referrer is not the original encounter. Unknowns are not filled from another source.",
      };
      await saveIdempotency(client, "opportunity_source", round.id, idempotencyKey, requestHash, 201, response, now, contributor.id);
      return { replayed: false, statusCode: 201, body: response };
    }, "idempotent");
  }

  private async route(
    client: pg.PoolClient,
    round: RoundRow,
    contributor: ContributorPrincipal,
    reason: string,
    code: string,
    message: string,
    now: Date,
    publicLabel = "applicant",
  ) {
    const wait = await client.query<{ id: string }>(
      `INSERT INTO opportunity_waitlist (id, round_id, credential_ref, public_label, reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (round_id, credential_ref) DO UPDATE SET reason = EXCLUDED.reason
       RETURNING id`,
      [newId("wait"), round.id, contributor.id, publicLabel, reason, now],
    );
    await this.appendEvent(client, round.id, null, "waitlist", { reason, paidSlot: false }, now);
    const nextTasks = await this.nextTasks(client, round);
    return {
      outcome: reason === "closed" ? "closed" : reason === "offer_full" || reason === "oversubscribed" || reason === "waitlist" ? "waitlist" : "alternative",
      error: { code, message },
      paid: false,
      transfer: null,
      paidSlot: false,
      budgetedReservation: false,
      rewardPromised: false,
      revenue: false,
      escrowed: false,
      doNotStartWork: true,
      claimAuthority: "none",
      kernelObligationMinted: false,
      hostedClaimAutomation: false,
      termsVersion: round.terms_version,
      waitlist: {
        id: wait.rows[0]!.id,
        paidSlot: false,
        doNotStartWork: true,
        claimAuthority: "none",
        reason,
      },
      nextTasks,
      note: "A waitlist is not a paid slot. Do not start work until a claim returns claim authority.",
    };
  }

  private async nextTasks(client: pg.PoolClient, round: RoundRow) {
    const offers = await this.offers(client, round.id);
    const tasks = [];
    for (const offer of offers) {
      const occupying = await this.occupyingCount(client, offer.id);
      const remaining = Math.max(0, offer.slot_count - occupying);
      const pendingOwner = await this.pendingOwnerSlots(client, offer);
      tasks.push({
        kind: "offer",
        offerKey: offer.offer_key,
        title: offer.title,
        listPriceAtomic: offer.reward_atomic,
        remainingSlots: remaining,
        unreservedPublicSlots: offer.public_claimable && round.status === "open" && round.submission_deadline > this.kernel.now() ? Math.max(0, remaining - pendingOwner) : 0,
        publicRemainingSlots: 0,
        publicClaimConfigured: offer.public_claimable,
        publicClaimable: false,
        deliveryState: this.hostedFor(round.round_key).deliveryState,
        ownerAssignedOnly: !offer.public_claimable,
        reservedForCaller: false,
        rewardPromised: false,
        paidSlot: false,
        doNotStartWork: true,
        claimAuthority: "none",
      });
    }
    const alternatives = await client.query<{ alternative_key: string; title: string; summary: string; rank: number }>(
      `SELECT alternative_key, title, summary, rank FROM opportunity_alternatives WHERE round_id = $1 ORDER BY rank, alternative_key`,
      [round.id],
    );
    for (const item of alternatives.rows) {
      tasks.push({
        kind: "unfunded_follow_on",
        alternativeKey: item.alternative_key,
        title: item.title,
        summary: item.summary,
        rank: item.rank,
        funded: false,
        paidSlot: false,
        rewardPromised: false,
        reservedForCaller: false,
        doNotStartWork: true,
        claimAuthority: "none",
      });
    }
    return tasks;
  }

  private async replayIdentity(client: pg.PoolClient, round: RoundRow, offer: OfferRow, claim: ClaimRow, created: boolean) {
    return {
      replayed: true,
      statusCode: 200,
      body: holderClaim(round, offer, claim, { created, tokenReissued: false, credentialGrant: "already_issued" }),
    };
  }

  private async insertClaim(
    client: pg.PoolClient,
    input: {
      round: RoundRow;
      offer: OfferRow;
      kind: ClaimRow["kind"];
      publicLabel: string;
      credentialRef: string;
      tokenId: string;
      importKey: string | null;
      importRequestHash?: string;
      deferStart: boolean;
      scope: { title: string; instructions: string } | null;
      now: Date;
    },
  ): Promise<ClaimRow> {
    const id = newId("ocl");
    const key = settlementKey([input.round.id, input.offer.id, input.credentialRef, input.kind, input.importKey ?? ""]);
    const expiresAt = new Date(
      Math.min(input.now.getTime() + input.round.claim_ttl_seconds * 1000, input.round.submission_deadline.getTime()),
    );
    await client.query(
      `INSERT INTO opportunity_claims (
         id, round_id, offer_id, kind, status, public_label, credential_ref, contributor_token_id,
         import_key, settlement_key, terms_version, reward_atomic, defer_start, expires_at, assigned_scope,
         created_at, updated_at, import_request_hash
       ) VALUES (
         $1,$2,$3,$4,'reserved',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$15,$16
       )`,
      [
        id,
        input.round.id,
        input.offer.id,
        input.kind,
        input.publicLabel,
        input.credentialRef,
        input.tokenId,
        input.importKey,
        key,
        input.round.terms_version,
        input.offer.reward_atomic,
        input.deferStart,
        expiresAt,
        input.scope ? JSON.stringify(input.scope) : null,
        input.now,
        input.importRequestHash ?? null,
      ],
    );
    return {
      id,
      round_id: input.round.id,
      offer_id: input.offer.id,
      kind: input.kind,
      status: "reserved",
      public_label: input.publicLabel,
      credential_ref: input.credentialRef,
      contributor_token_id: input.tokenId,
      import_key: input.importKey,
      import_request_hash: input.importRequestHash ?? null,
      settlement_key: key,
      terms_version: input.round.terms_version,
      reward_atomic: String(input.offer.reward_atomic),
      defer_start: input.deferStart,
      expires_at: expiresAt,
      assigned_scope: input.scope,
      created_at: input.now,
      updated_at: input.now,
    };
  }

  private async ensureCapacity(client: pg.PoolClient, round: RoundRow, offer: OfferRow, reward: bigint) {
    const now = this.kernel.now();
    if (round.status !== "open" || round.submission_deadline.getTime() <= now.getTime()) {
      throw new ApiError(409, "round_closed", "round is closed");
    }
    const slots = await this.occupyingCount(client, offer.id);
    if (slots >= offer.slot_count) throw new ApiError(409, "offer_full", "offer slots are full");
    const committed = await this.committed(client, round.id);
    if (committed + reward > big(round.principal_cap_atomic)) {
      throw new ApiError(409, "oversubscribed", "remaining principal cap does not cover this reward");
    }
  }

  private async expireUnlearned(client: pg.PoolClient, roundId: string) {
    await client.query(
      `UPDATE opportunity_claims
       SET status = 'expired', updated_at = $2
       WHERE round_id = $1 AND status = 'reserved' AND expires_at <= $2`,
      [roundId, this.kernel.now()],
    );
  }

  private async committed(client: pg.PoolClient, roundId: string): Promise<bigint> {
    const result = await client.query<{ n: string }>(
      `SELECT COALESCE(SUM(reward_atomic), 0)::text AS n FROM opportunity_claims
       WHERE round_id = $1 AND status IN ${OCCUPYING}`,
      [roundId],
    );
    return big(result.rows[0]?.n ?? "0");
  }

  private async occupyingCount(client: pg.PoolClient, offerId: string): Promise<number> {
    const result = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM opportunity_claims WHERE offer_id = $1 AND status IN ${OCCUPYING}`,
      [offerId],
    );
    return Number(result.rows[0]?.n ?? 0);
  }

  private async pendingOwnerSlots(client: pg.PoolClient, offer: OfferRow): Promise<number> {
    const result = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM opportunity_claims WHERE offer_id=$1 AND kind IN ('imported_personal','owner_assigned')`, [offer.id],
    );
    // An expired personal import has already reconciled its sent offer and releases
    // capacity under its fixed expiry. Only not-yet-imported offers stay protected.
    return Math.max(0, offer.owner_reserved_slots - Number(result.rows[0]?.n ?? 0));
  }

  private async lockRound(client: pg.PoolClient, roundKey: string, provenance: Provenance): Promise<RoundRow> {
    return this.resolveRound(client, roundKey, provenance, true);
  }

  private async resolveRound(client: pg.PoolClient, roundKey: string, provenance: Provenance | null, lock: boolean): Promise<RoundRow> {
    const result = await client.query<RoundRow>(
      `SELECT * FROM opportunity_rounds WHERE round_key = $1 AND ($2::text IS NULL OR provenance = $2) ${lock ? "FOR UPDATE" : ""}`,
      [roundKey, provenance],
    );
    if (result.rows.length === 0) throw new ApiError(404, "not_found", "round not found");
    if (result.rows.length > 1) throw new ApiError(409, "ambiguous_round", "provenance is required when more than one round key exists");
    return result.rows[0]!;
  }

  private async requireOffer(client: pg.PoolClient, roundId: string, offerKey: string): Promise<OfferRow> {
    const offer = await this.findOffer(client, roundId, offerKey);
    if (!offer) throw new ApiError(404, "not_found", "offer not found");
    return offer;
  }

  private async findOffer(client: pg.PoolClient, roundId: string, offerKey: string): Promise<OfferRow | null> {
    const result = await client.query<OfferRow>(
      `SELECT * FROM opportunity_offers WHERE round_id = $1 AND offer_key = $2`,
      [roundId, offerKey],
    );
    return result.rows[0] ?? null;
  }

  private async offerById(client: pg.PoolClient, offerId: string): Promise<OfferRow> {
    const result = await client.query<OfferRow>(`SELECT * FROM opportunity_offers WHERE id = $1`, [offerId]);
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "not_found", "offer not found");
    return row;
  }

  private async offers(client: pg.PoolClient, roundId: string): Promise<OfferRow[]> {
    const result = await client.query<OfferRow>(
      `SELECT * FROM opportunity_offers WHERE round_id = $1 ORDER BY rank, offer_key`,
      [roundId],
    );
    return result.rows;
  }

  private async lockClaim(client: pg.PoolClient, claimId: string): Promise<ClaimRow | null> {
    const result = await client.query<ClaimRow>(`SELECT * FROM opportunity_claims WHERE id = $1 FOR UPDATE`, [claimId]);
    return result.rows[0] ?? null;
  }

  private async credentialForToken(client: pg.PoolClient, roundId: string, tokenId: string): Promise<string> {
    const prior = await client.query<{ credential_ref: string }>(
      `SELECT credential_ref FROM opportunity_claims
       WHERE round_id = $1 AND contributor_token_id = $2
       ORDER BY created_at LIMIT 1`,
      [roundId, tokenId],
    );
    return prior.rows[0]?.credential_ref ?? tokenId;
  }

  private async findOccupying(
    client: pg.PoolClient,
    roundId: string,
    offerId: string,
    credentialRef: string,
    tokenId?: string,
  ): Promise<ClaimRow | null> {
    const result = await client.query<ClaimRow>(
      `SELECT * FROM opportunity_claims
       WHERE round_id = $1 AND offer_id = $2 AND status IN ${OCCUPYING}
         AND (credential_ref = $3 OR contributor_token_id = $4)
       LIMIT 1`,
      [roundId, offerId, credentialRef, tokenId ?? credentialRef],
    );
    return result.rows[0] ?? null;
  }

  private async findIdentity(client: pg.PoolClient, roundId: string, offerId: string, credentialRef: string, importKey: string): Promise<ClaimRow | null> {
    const byKey = await client.query<ClaimRow>(
      `SELECT * FROM opportunity_claims WHERE round_id = $1 AND import_key = $2 LIMIT 1`,
      [roundId, importKey],
    );
    if (byKey.rows[0]) return byKey.rows[0];
    const prior = await client.query<ClaimRow>(
      `SELECT * FROM opportunity_claims WHERE round_id=$1 AND offer_id=$2 AND credential_ref=$3 ORDER BY created_at LIMIT 1`,
      [roundId, offerId, credentialRef],
    );
    return prior.rows[0] ?? null;
  }

  private async roundView(client: pg.PoolClient, roundId: string, publicView: boolean) {
    const roundResult = await client.query<RoundRow>(`SELECT * FROM opportunity_rounds WHERE id = $1`, [roundId]);
    const round = roundResult.rows[0]!;
    const committed = await this.committed(client, round.id);
    const cap = big(round.principal_cap_atomic);
    const offers = await this.offers(client, round.id);
    const offerViews = [];
    let protectedPersonal = 0n;
    for (const offer of offers) {
      const occupying = await this.occupyingCount(client, offer.id);
      const pendingOwner = await this.pendingOwnerSlots(client, offer);
      protectedPersonal += BigInt(pendingOwner) * big(offer.reward_atomic);
      offerViews.push({
        offerKey: offer.offer_key,
        title: offer.title,
        summary: offer.summary,
        slotCount: offer.slot_count,
        occupying,
        remainingSlots: Math.max(0, offer.slot_count - occupying),
        ownerReservedSlots: offer.owner_reserved_slots,
        pendingOwnerSlots: pendingOwner,
        unreservedPublicSlots: offer.public_claimable && round.status === "open" && round.submission_deadline > this.kernel.now()
          ? Math.max(0, offer.slot_count - occupying - pendingOwner) : 0,
        publicRemainingSlots: 0,
        rewardAtomic: offer.reward_atomic,
        reward: rewardView(big(offer.reward_atomic), round),
        maxEffortSeconds: offer.max_effort_seconds,
        acceptance: offer.acceptance,
        evidenceKind: offer.evidence_kind,
        publicClaimConfigured: offer.public_claimable,
        publicClaimable: false,
        ownerAssignedOnly: !offer.public_claimable,
        rank: offer.rank,
        rewardPromised: false,
        reservedForCaller: false,
      });
    }
    const alternatives = await client.query(
      `SELECT alternative_key, rank, title, summary, funded, paid_slot
       FROM opportunity_alternatives WHERE round_id = $1 ORDER BY rank, alternative_key`,
      [round.id],
    );
    return {
      schema: "neomorphic.opportunity-round.v1",
      roundKey: round.round_key,
      provenance: round.provenance,
      productionAdmission: round.production_admission,
      status: round.status,
      termsVersion: round.terms_version,
      termsDocument: round.terms_document,
      principalCapAtomic: cap.toString(),
      committedAtomic: committed.toString(),
      remainingAtomic: (cap - committed).toString(),
      protectedPersonalAtomic: protectedPersonal.toString(),
      availableAtomic: (cap - committed - protectedPersonal).toString(),
      asset: round.asset,
      network: round.network,
      chainId: round.chain_id,
      atomicScale: round.atomic_scale,
      submissionDeadline: iso(round.submission_deadline),
      offers: offerViews,
      alternatives: alternatives.rows.map((row) => ({
        ...(row as Record<string, unknown>),
        funded: false,
        paidSlot: false,
        rewardPromised: false,
        doNotStartWork: true,
      })),
      paid: false,
      transfer: null,
      escrowed: false,
      revenue: false,
      claimAuthority: "none",
      doNotStartWork: true,
      hostedClaimAutomation: false,
      deliveryState: this.hostedFor(round.round_key).deliveryState,
      hostedDelivery: this.hostedFor(round.round_key),
      publicView,
      note: "Reading a round does not reserve a reward and does not transfer funds. Fixture provenance is not production participation.",
    };
  }

  private async serverObserved(client: pg.PoolClient, claimId: string) {
    const events = await client.query<{ id: string; payload: { eventId?: string; endpoint?: string } }>(
      `SELECT id, payload FROM opportunity_events WHERE claim_id = $1 AND kind = 'claim' ORDER BY created_at`,
      [claimId],
    );
    const eventIds = events.rows.map((row) => row.payload.eventId).filter((id): id is string => Boolean(id));
    return {
      server: {
        eventIds,
        placementId: null,
        campaignId: null,
        sourceId: null,
        providerId: null,
        query: null,
        endpoint: events.rows[0]?.payload.endpoint ?? null,
        reconstructed: false,
      },
    };
  }

  private async submissionView(client: pg.PoolClient, round: RoundRow, claim: ClaimRow, submissionId: string, created: boolean) {
    const submission = await client.query<{ artifact_ref: string; artifact_digest_sha256: string; evidence: unknown }>(
      `SELECT artifact_ref, artifact_digest_sha256, evidence FROM opportunity_submissions WHERE id = $1`,
      [submissionId],
    );
    return {
      outcome: "submitted",
      created,
      paid: false,
      transfer: null,
      doNotStartWork: false,
      claimAuthority: "holder",
      kernelObligationMinted: false,
      submission: {
        id: submissionId,
        claimId: claim.id,
        termsVersion: claim.terms_version,
        artifactRef: submission.rows[0]?.artifact_ref,
        digestSha256: submission.rows[0]?.artifact_digest_sha256,
        fetched: false,
        executed: false,
      },
      evidenceRetained: true,
      evidenceAuthority: "untrusted_self_report",
      reward: rewardView(big(claim.reward_atomic), round),
      hostedDelivery: this.hostedFor(round.round_key),
      note: "Evidence is stored metadata. The artifact ref was not fetched or executed. Submission is not acceptance and not payment.",
    };
  }

  private async obligationView(client: pg.PoolClient, round: RoundRow, claim: ClaimRow, obligationId: string, created: boolean) {
    void client;
    return {
      outcome: "owed",
      created,
      paid: false,
      settled: false,
      transfer: null,
      revenue: false,
      escrowed: false,
      kernelObligationMinted: false,
      doNotStartWork: true,
      claimAuthority: "holder",
      nextAction: "await_owner_settlement",
      obligation: obligationBody(round, claim, obligationId),
      note: "Acceptance records an owed IOU on the null nonpaying adapter. It does not transfer USDC and it is not revenue.",
    };
  }

  private async appendEvent(client: pg.PoolClient, roundId: string, claimId: string | null, kind: string, payload: Record<string, unknown>, now: Date) {
    await client.query(
      `INSERT INTO opportunity_events (id, round_id, claim_id, kind, payload, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [newId("oev"), roundId, claimId, kind, JSON.stringify(payload), now],
    );
  }
}

function toTermsInput(body: RoundBody): RoundTermsInput {
  return {
    roundKey: body.roundKey,
    principalCapAtomic: body.principalCapAtomic,
    atomicScale: body.atomicScale,
    asset: body.asset,
    network: body.network,
    chainId: body.chainId,
    submissionDeadline: body.submissionDeadline,
    claimTtlSeconds: body.claimTtlSeconds,
    reviewWithinDays: body.reviewWithinDays,
    maxClarifications: body.maxClarifications,
    maxEvidenceBytes: body.maxEvidenceBytes ?? 12000,
    transferFeeCap: body.transferFeeCap,
    offers: body.offers.map((offer) => ({
      offerKey: offer.offerKey,
      title: offer.title,
      summary: offer.summary,
      slotCount: offer.slotCount,
      ownerReservedSlots: offer.ownerReservedSlots ?? 0,
      rewardAtomic: offer.rewardAtomic,
      maxEffortSeconds: offer.maxEffortSeconds,
      publicClaimable: offer.publicClaimable,
      acceptance: offer.acceptance,
      evidenceKind: offer.evidenceKind,
      rank: offer.rank,
    })),
    alternatives: body.alternatives.map((item) => ({
      alternativeKey: item.alternativeKey,
      rank: item.rank,
      title: item.title,
      summary: item.summary,
      funded: false,
      paidSlot: false,
    })),
  };
}

function assertAdmission(round: RoundRow, credentialRef: string, credentialProvenance: Provenance) {
  if (round.provenance === "production") {
    if (!round.production_admission) throw new ApiError(403, "fixture_not_admitted", "production round is not admitted");
    if (credentialProvenance !== "production" || credentialRef.startsWith("fixture:") || credentialRef.startsWith("test:")) {
      throw new ApiError(403, "fixture_not_admitted", "fixture identity cannot enter a production round");
    }
    return;
  }
  if (credentialProvenance !== round.provenance) {
    throw new ApiError(403, "fixture_not_admitted", "credential provenance does not match the round");
  }
}

function assertUnknownUnfilled(selfReport: { route: string; query: string | null; endpointOrFilter: string | null; upstreamPublicLink: string | null }) {
  if (selfReport.route === "unknown" && (selfReport.query || selfReport.endpointOrFilter || selfReport.upstreamPublicLink)) {
    throw new ApiError(400, "reconstructed_route", "unknown route must not be filled with a query, endpoint, or upstream link");
  }
}

function assertEvidenceShape(evidenceKind: string, evidence: Record<string, unknown>) {
  if (evidenceKind === "workflow_witness") {
    if (!workflowEvidenceSchema.safeParse(evidence).success) throw new ApiError(400, "invalid_input", "workflow evidence requires a bounded nonempty self-report of the attempt and result or limitation");
    return;
  }
  if (!discoveryEvidenceSchema.safeParse(evidence).success) {
    throw new ApiError(400, "invalid_input", "discovery evidence requires a source self-report");
  }
  const parsed = selfReportSchema.safeParse(evidence.selfReport);
  if (!parsed.success) throw new ApiError(400, "invalid_input", "discovery self-report failed validation");
  assertUnknownUnfilled(parsed.data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function claimView(round: RoundRow, claim: ClaimRow) {
  return {
    id: claim.id,
    status: claim.status,
    kind: claim.kind,
    publicLabel: claim.public_label,
    settlementKey: claim.settlement_key,
    termsVersion: claim.terms_version,
    rewardAtomic: claim.reward_atomic,
    reward: rewardView(big(claim.reward_atomic), round),
    deferStart: claim.defer_start,
    expiresAt: iso(claim.expires_at),
    assignedScope: claim.assigned_scope,
  };
}

function holderClaim(
  round: RoundRow,
  offer: OfferRow,
  claim: ClaimRow,
  extra: { created: boolean; token?: string; tokenReissued?: boolean; credentialGrant?: string; productionCredential?: boolean },
) {
  const occupying = ["reserved", "submitted", "accepted", "owed"].includes(claim.status);
  const canSubmit = claim.status === "reserved" && !claim.defer_start;
  return {
    outcome: occupying ? "claimed" : claim.status,
    created: extra.created,
    paid: false,
    transfer: null,
    settled: false,
    revenue: false,
    escrowed: false,
    paidSlot: occupying,
    budgetedReservation: occupying,
    rewardPromised: occupying,
    doNotStartWork: !canSubmit,
    claimAuthority: occupying ? "holder" : "none",
    kernelObligationMinted: false,
    hostedClaimAutomation: false,
    productionCredential: extra.productionCredential ?? false,
    credentialGrant: extra.credentialGrant ?? null,
    tokenReissued: extra.tokenReissued ?? false,
    token: extra.token,
    nextAction: !occupying ? "join_nonpaying_waitlist" : claim.status === "owed" ? "await_owner_settlement"
      : claim.status !== "reserved" ? "await_owner_review" : claim.defer_start ? "wait_for_receiving_route" : "submit_bounded_evidence",
    offerKey: offer.offer_key,
    claim: claimView(round, claim),
    note: "Budgeted reservation under fixed terms. Acceptance later records an owed IOU. Nothing is transferred by this claim.",
  };
}

function obligationBody(round: RoundRow, claim: ClaimRow, obligationId: string) {
  return {
    id: obligationId,
    kind: "owed_record",
    adapter: "null_nonpaying_v0",
    payoutState: "owed",
    settlementKey: claim.settlement_key,
    claimId: claim.id,
    termsVersion: claim.terms_version,
    reward: rewardView(big(claim.reward_atomic), round),
    paid: false,
    settled: false,
    transfer: null,
    revenue: false,
    escrowed: false,
  };
}

function noticeView(
  campaignKey: string,
  preservedPromise: unknown,
  nextRoundKey: string | null,
  created: boolean,
  hosted?: HostedDeliveryProjection,
) {
  const projection = nextRoundKey ? projectionForRound(hosted ?? absentHostedDelivery(), nextRoundKey) : null;
  return {
    campaignKey,
    status: "closed",
    created,
    preservedPromise,
    promiseChanged: false,
    priorPromisesUnchanged: true,
    repriced: false,
    doNotStartWork: true,
    claimAuthority: "none",
    paidSlot: false,
    paid: false,
    transfer: null,
    continuation: nextRoundKey
      ? {
          roundKey: nextRoundKey,
          reservedForCaller: false,
          rewardPromised: false,
          doNotStartWork: true,
          claimAuthority: "none",
          path: projection?.roundReadPath ?? null,
          deliveryState: projection?.deliveryState ?? "unconfigured",
          hostedClaimAutomation: false,
          publicPaidCapacity: 0,
          anonymousSelfRegistration: false,
          settlementAutomatic: false,
          grantsDelivered: false,
        }
      : null,
    note: "The closed notice keeps its original promise. The continuation is not a claim and not a payment.",
  };
}

function importIntentHash(body: ImportBody & { scope?: { title: string; instructions: string } }, kind: ClaimRow["kind"]) {
  return hashRequest({ ...body, deferStart: body.deferStart === true, kind });
}

function assertImportIdentity(claim: ClaimRow, offer: OfferRow, body: ImportBody & { scope?: { title: string; instructions: string } }, kind: ClaimRow["kind"]) {
  if (claim.offer_id !== offer.id || claim.credential_ref !== body.credentialRef || claim.public_label !== body.publicLabel || claim.kind !== kind
    || stableJson(claim.assigned_scope) !== stableJson(body.scope ?? null)
    || (claim.import_request_hash && claim.import_request_hash !== importIntentHash(body, kind))) {
    throw new ApiError(409, "import_conflict", "import identity and scoped terms are already fixed");
  }
}

async function loadIdempotency(
  client: pg.PoolClient,
  scope: string,
  taskId: string,
  key: string,
  requestHash: string,
  principalId: string,
): Promise<{ hit: true; statusCode: number; body: unknown } | { hit: false }> {
  const existing = await client.query<{ request_hash: string; status_code: number; response_json: unknown; principal_id: string }>(
    `SELECT request_hash, status_code, response_json, principal_id
     FROM earned_work_idempotency WHERE scope = $1 AND task_id = $2 AND key = $3 FOR UPDATE`,
    [scope, taskId, key],
  );
  const row = existing.rows[0];
  if (!row) return { hit: false };
  if ((row.principal_id || OWNER) !== principalId) {
    throw new ApiError(403, "forbidden", "idempotency key is bound to a different principal");
  }
  if (row.request_hash !== requestHash) {
    throw new ApiError(409, "idempotency_conflict", "Idempotency-Key was reused with a different body");
  }
  return { hit: true, statusCode: row.status_code, body: row.response_json };
}

async function saveIdempotency(
  client: pg.PoolClient,
  scope: string,
  taskId: string,
  key: string,
  requestHash: string,
  statusCode: number,
  body: unknown,
  now: Date,
  principalId: string,
) {
  await client.query(
    `INSERT INTO earned_work_idempotency (
       scope, task_id, key, request_hash, status_code, response_json, principal_id, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
    [scope, taskId, key, requestHash, statusCode, JSON.stringify(body), principalId, now],
  );
}
