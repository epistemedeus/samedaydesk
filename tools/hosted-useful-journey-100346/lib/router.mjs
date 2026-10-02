import express from "express";
import { Budget, JourneyError, INPUT_MAX_BYTES, readNodeStream, parseJson } from "./budget.mjs";
import { PREFIX, recipeCatalog, validateRequest } from "./contracts.mjs";
import { executeRecipe } from "./executor.mjs";
import { openJourneyFromEnv } from "./service.mjs";

function errorBody(error) {
  return { error: { code: error.code || "store_unavailable_or_outcome_unknown", nextAction: error.nextAction || error.nextStep || "Reload current job with the same operation/body/grant. Commit outcome may be unknown." } };
}

export function createJourneyRouter({ service = null, reason = "unconfigured", maxInFlight = 4 } = {}) {
  const router = express.Router();
  let active = 0;
  router.use((_req, res, next) => { res.set("cache-control", "no-store"); next(); });
  router.get("/recipes", (_req, res) => res.json(recipeCatalog()));
  router.get("/healthz", (_req, res) => res.json({ enabled: !!service, store: service ? "postgres" : null,
    reason: service ? null : reason, publicEvaluation: true, publicationVerified: false, productionReady: false }));

  function handler(fn, { publicCall = false } = {}) {
    return async (req, res) => {
      const declaredDeadline = req.get("x-useful-deadline-at");
      const budget = new Budget({ ...(declaredDeadline && /^\d{13}$/.test(declaredDeadline)
        ? { deadlineAt: Number(declaredDeadline) } : {}) });
      let counted = false;
      try {
        if (declaredDeadline && !/^\d{13}$/.test(declaredDeadline)) throw new JourneyError(400, "invalid_deadline");
        budget.check();
        if (active >= maxInFlight) throw new JourneyError(429, "busy", "Retry the same operation with jitter after current work completes.");
        active++; counted = true;
        if (!publicCall && !service) throw new JourneyError(503, reason, "Root must receive and enroll the existing Postgres host before admission. Public snapshot evaluation remains available.");
        // Auth syntax before raw intake. The owning backend rechecks current
        // grant, project, role and expiry in every read/write transaction.
        const token = /^Bearer\s+(\S{8,200})$/i.exec(req.get("authorization") || "")?.[1];
        if (!publicCall && !token) throw new JourneyError(401, "unauthorized");
        let body;
        if (req.method === "POST") {
          if (!req.is("application/json") || req.get("content-encoding")) throw new JourneyError(415, "json_required");
          if (req.body !== undefined) throw new JourneyError(500, "mount_before_json_parser", "Apply the provided shared mount patch before the global JSON parser.");
          if (Number(req.get("content-length")) > INPUT_MAX_BYTES) throw new JourneyError(413, "input_too_large");
          body = parseJson(await readNodeStream(req, budget));
        }
        const result = await fn({ context: { projectId: req.params.projectId, token }, body, req, budget });
        const text = JSON.stringify(result);
        if (Buffer.byteLength(text) > budget.outputBytes) throw new JourneyError(413, "output_too_large");
        budget.spend(Buffer.byteLength(text), "http-output");
        return res.status(result.state === "running" ? 202 : result.admitted && !result.replayed ? 201 : 200).type("application/json").send(text);
      } catch (error) {
        if (res.destroyed) return;
        const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 503;
        return res.status(status).json(errorBody(error));
      } finally { if (counted) active--; }
    };
  }
  router.post("/evaluate", handler(async ({ body, budget }) => {
    const request = validateRequest(body);
    if (request.input.priorResult) throw new JourneyError(400, "authenticated_prior_required");
    budget.tighten(request.limits);
    return { mode: "public-evaluation", admitted: false, ...(await executeRecipe(request, budget)), publicationVerified: false };
  }, { publicCall: true }));
  const jobs = "/projects/:projectId/jobs";
  router.post(jobs, handler(({ context, body, req, budget }) => service.admit(context, body, req.get("idempotency-key"), budget)));
  router.get(`${jobs}/:jobId`, handler(({ context, req, budget }) => service.status(context, req.params.jobId, req.query.taskId, budget)));
  router.get(`${jobs}/:jobId/result`, handler(({ context, req, budget }) => service.result(context, req.params.jobId, req.query.taskId, budget)));
  router.post(`${jobs}/:jobId/run`, handler(({ context, body, req, budget }) => {
    if (!body || Object.keys(body).join(",") !== "taskId") throw new JourneyError(400, "invalid_run");
    return service.run(context, req.params.jobId, body.taskId, budget);
  }));
  router.post(`${jobs}/:jobId/cancel`, handler(({ context, body, req, budget }) => service.cancel(context, req.params.jobId, body, req.get("idempotency-key"), budget)));
  router.post(`${jobs}/:jobId/export`, handler(({ context, body, req, budget }) => service.export(context, req.params.jobId, body, budget)));
  router.use((_req, res) => res.status(404).json({ error: { code: "not_found" } }));
  return router;
}

// Startup only checks enrollment. It never migrates or bootstraps a principal.
export function mountHostedUsefulJourney(app, options = {}) {
  let closed = false;
  let mounted;
  let owned;
  const ready = (async () => {
    const opened = options.service ? { service: options.service, reason: null } : await openJourneyFromEnv(options.env || process.env);
    if (!options.service) owned = opened.service;
    if (closed) { await owned?.close(); return; }
    mounted = createJourneyRouter({ ...options, ...opened });
  })();
  app.use(options.prefix || PREFIX, async (req, res, next) => {
    try { await ready; if (closed) throw new JourneyError(503, "closed"); mounted(req, res, next); }
    catch (error) { res.status(503).json(errorBody(error)); }
  });
  return { ready, async close() { closed = true; await ready; await owned?.close(); } };
}
