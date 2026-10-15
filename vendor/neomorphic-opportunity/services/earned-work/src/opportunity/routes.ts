import {mountOriginalContinuationRoutes} from "./continuation.js";
import type { NextFunction, Request, Response } from "express";
import { requireContributor, readBearer, type AuthedRequest } from "../auth.js";
import { assertOwner, type ServiceConfig } from "../config.js";
import { hashToken, issueToken } from "../crypto.js";
import { requireIdempotencyKey } from "../validation.js";
import type { PostgresStore } from "../store/postgres.js";
import { OpportunityService } from "./service.js";
import { ApiError } from "../errors.js";
import { publicJson } from "./redact.js";
import {
  acceptBodySchema,
  assignBodySchema,
  claimBodySchema,
  cohortBodySchema,
  createRoundBodySchema,
  importBodySchema,
  noticeBodySchema,
  parseBody,
  provenanceBodySchema,
  sourceBodySchema,
  submitBodySchema,
  waitlistBodySchema,
} from "./validate.js";
import type { Provenance } from "../types.js";

function param(value: string | string[] | undefined): string {
  if (value == null) return "";
  return Array.isArray(value) ? value[0]! : value;
}

function provenanceOf(value: unknown): Provenance {
  if (value === "test" || value === "fixture" || value === "production") return value;
  if (value == null) return "fixture";
  throw new ApiError(400, "invalid_input", "provenance must be test, fixture, or production");
}

export function mountOpportunityRoutes(app: { post: Function; get: Function }, store: PostgresStore, config: ServiceConfig) {
  const opportunity = new OpportunityService(store, config.hostedDelivery);
  mountOriginalContinuationRoutes(app,store,opportunity);

  app.post("/v1/opportunity-rounds", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertOwner(readBearer(req), config);
      const body = parseBody(createRoundBodySchema, req.body);
      const result = await opportunity.createRound(body, requireIdempotencyKey(req.header("idempotency-key") ?? undefined));
      res.status(result.replayed ? 200 : result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/opportunity-rounds/:roundKey", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provenance = req.query.provenance == null ? null : provenanceOf(req.query.provenance);
      const view = await opportunity.readRound(param(req.params.roundKey), provenance);
      res.status(200).json(publicJson(view));
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/imports", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertOwner(readBearer(req), config);
      const body = parseBody(importBodySchema, req.body);
      const token = issueToken("ew_ctr");
      const result = await opportunity.importClaim(
        param(req.params.roundKey),
        body,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
        token,
        hashToken(token),
        "imported_personal",
      );
      res.status(result.replayed ? 200 : result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/assignments", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertOwner(readBearer(req), config);
      const body = parseBody(assignBodySchema, req.body);
      const token = issueToken("ew_ctr");
      const result = await opportunity.importClaim(
        param(req.params.roundKey),
        body,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
        token,
        hashToken(token),
        "owner_assigned",
      );
      res.status(result.replayed ? 200 : result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/claims", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const contributor = await requireContributor(req, store);
      const body = parseBody(claimBodySchema, req.body);
      const result = await opportunity.claim(
        param(req.params.roundKey),
        body,
        contributor,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
        `${req.baseUrl}${req.path}`,
      );
      res.status(result.replayed ? 200 : result.statusCode).json(publicJson(result.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/opportunity-rounds/:roundKey/claims/:claimId", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const token = readBearer(req);
      let owner = false;
      let contributor = null;
      if (token) {
        try {
          assertOwner(token, config);
          owner = true;
        } catch {
          contributor = await requireContributor(req, store);
        }
      }
      if (!owner && !contributor) {
        contributor = await requireContributor(req, store);
      }
      const provenance = provenanceOf(req.query.provenance);
      const view = await opportunity.readClaim(param(req.params.roundKey), param(req.params.claimId), provenance, contributor, owner);
      res.status(200).json(owner ? view : publicJson(view, { retainAssignedScope: true }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/opportunity-rounds/:roundKey/claims", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertOwner(readBearer(req), config);
      const view = await opportunity.listClaims(param(req.params.roundKey), provenanceOf(req.query.provenance));
      res.status(200).json(view);
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/claims/:claimId/submissions", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const contributor = await requireContributor(req, store);
      const body = parseBody(submitBodySchema, req.body);
      const result = await opportunity.submit(
        param(req.params.roundKey),
        param(req.params.claimId),
        body,
        contributor,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
      );
      res.status(result.replayed ? 200 : result.statusCode).json(publicJson(result.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/claims/:claimId/accept", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertOwner(readBearer(req), config);
      const body = parseBody(acceptBodySchema, req.body ?? {});
      const result = await opportunity.accept(
        param(req.params.roundKey),
        param(req.params.claimId),
        body.provenance,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
        body.requesterActiveMinutes ?? null,
      );
      res.status(result.replayed ? 200 : result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/claims/:claimId/start", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const contributor = await requireContributor(req, store);
      const body = parseBody(provenanceBodySchema, req.body ?? {});
      const result = await opportunity.acknowledgeStart(
        param(req.params.roundKey),
        param(req.params.claimId),
        body.provenance,
        contributor,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
      );
      res.status(result.statusCode).json(publicJson(result.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/claims/:claimId/source", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const contributor = await requireContributor(req, store);
      const body = parseBody(sourceBodySchema, req.body);
      const result = await opportunity.recordSource(
        param(req.params.roundKey),
        param(req.params.claimId),
        body.provenance,
        body,
        contributor,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
      );
      res.status(result.replayed ? 200 : result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/waitlist", async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const contributor = await requireContributor(req, store);
      const body = parseBody(waitlistBodySchema, req.body);
      const result = await opportunity.joinWaitlist(
        param(req.params.roundKey),
        body,
        contributor,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
      );
      res.status(result.statusCode).json(publicJson(result.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/opportunity-rounds/:roundKey/cohort", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertOwner(readBearer(req), config);
      const view = await opportunity.cohort(param(req.params.roundKey), provenanceOf(req.query.provenance));
      res.status(200).json(view);
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/cohort-events", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertOwner(readBearer(req), config);
      const body = parseBody(cohortBodySchema, req.body);
      const provenance = provenanceOf(req.query.provenance ?? (req.body as { provenance?: unknown }).provenance);
      const result = await opportunity.recordCohort(
        param(req.params.roundKey),
        provenance,
        body,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
      );
      res.status(result.replayed ? 200 : result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-rounds/:roundKey/close", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertOwner(readBearer(req), config);
      const body = parseBody(provenanceBodySchema, req.body ?? {});
      const result = await opportunity.closeRound(
        param(req.params.roundKey),
        body.provenance,
        requireIdempotencyKey(req.header("idempotency-key") ?? undefined),
      );
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  app.post("/v1/opportunity-notices", async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertOwner(readBearer(req), config);
      const body = parseBody(noticeBodySchema, req.body);
      const result = await opportunity.closeNotice(body, requireIdempotencyKey(req.header("idempotency-key") ?? undefined));
      res.status(result.replayed ? 200 : result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/opportunity-notices/:campaignKey", async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(publicJson(await opportunity.readNotice(param(req.params.campaignKey))));
    } catch (error) {
      next(error);
    }
  });
}
