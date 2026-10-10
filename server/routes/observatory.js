/**
 * Public read-only observatory: named fixed-upstream sources only.
 * Not an arbitrary URL proxy. Caller credentials are never forwarded.
 */

import { Router } from "express";
import { SCHEMA_VERSION } from "../lib/observatory/contract.js";
import { buildConvergence } from "../lib/observatory/convergence.js";
import { CONVERGENCE_SCHEMA } from "../lib/observatory/convergence-enrollment.js";
import { projectPositioning } from "../lib/observatory/positioning.js";
import {
  UnknownSourceError,
  createObservatoryRuntime,
  getSource,
  listCatalog,
} from "../lib/observatory/registry.js";

export const DEFAULT_CORS_ORIGIN = "https://neomorphic.io";
export const OBSERVATORY_ROUTE = "/api/observatory";

export function corsAllowlist(env = process.env) {
  const allowed = new Set([DEFAULT_CORS_ORIGIN]);
  const extra = env.OBSERVATORY_CORS_ORIGINS || "";
  for (const part of extra.split(",")) {
    const origin = part.trim();
    if (!origin || origin === "*") continue;
    allowed.add(origin);
  }
  return allowed;
}

export function createObservatoryRouter(options = {}) {
  const runtime = options.runtime || createObservatoryRuntime(options);
  const router = Router();

  function applyCors(req, res) {
    res.set("Vary", "Origin");
    res.set("Cache-Control", "no-store");
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const allowed = Boolean(origin) && corsAllowlist().has(origin);
    if (allowed) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Accept");
    }
    return { origin, allowed };
  }

  router.use((req, res, next) => {
    const { allowed } = applyCors(req, res);
    if (req.method === "OPTIONS") {
      if (!allowed) return res.status(403).json({ error: "origin_not_allowed" });
      return res.status(204).end();
    }
    next();
  });

  router.get("/sources", (_req, res) => {
    return res.status(200).json(listCatalog());
  });

  router.get("/snapshot", async (_req, res) => {
    const snapshot = await runtime.observeAll();
    return res.status(200).json(snapshot);
  });

  router.get("/positioning", async (_req, res) => {
    const snapshot = await runtime.observeAll();
    return res.status(200).json(projectPositioning({
      observations: snapshot.observations,
      fetchedAt: snapshot.fetchedAt,
    }));
  });

  async function sendConvergence(req, res, mode) {
    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: "query_not_allowed",
        schemaVersion: CONVERGENCE_SCHEMA,
        measuredZero: false,
      });
    }
    try {
      const document = await buildConvergence({
        runtime,
        mode,
        requestTime: convergenceRequestTime(options.now),
        fetchImpl: options.fetchImpl,
        now: options.now,
        timeoutMs: options.timeoutMs,
        maxBytes: options.maxBytes,
        originalCapturePath: Object.prototype.hasOwnProperty.call(options, "originalCapturePath")
          ? options.originalCapturePath
          : (process.env.OBSERVATORY_ORIGINAL_CAPTURE || ""),
        capturePin: options.capturePin,
        ownedResources: options.ownedResources,
      });
      return res.status(200).json(document);
    } catch (error) {
      return res.status(200).json({
        schemaVersion: CONVERGENCE_SCHEMA,
        transport: "samedaydesk-bridge",
        route: mode === "refresh"
          ? "/api/observatory/convergence/refresh"
          : mode === "metadata"
            ? "/api/observatory/convergence/metadata"
            : "/api/observatory/convergence",
        availability: "error",
        reason: "convergence_failed",
        measuredZero: false,
        message: error && error.message ? String(error.message) : "convergence failed",
      });
    }
  }

  router.get("/convergence", (req, res, next) => {
    sendConvergence(req, res, "bridge").catch(next);
  });
  router.get("/convergence/refresh", (req, res, next) => {
    sendConvergence(req, res, "refresh").catch(next);
  });
  router.get("/convergence/metadata", (req, res, next) => {
    sendConvergence(req, res, "metadata").catch(next);
  });

  router.get("/sources/:sourceId", async (req, res) => {
    const sourceId = req.params.sourceId;
    if (!getSource(sourceId)) {
      return res.status(404).json({
        error: "unknown_source",
        sourceId,
        schemaVersion: SCHEMA_VERSION,
      });
    }
    try {
      const observation = await runtime.observe(sourceId);
      return res.status(200).json(observation);
    } catch (error) {
      if (error instanceof UnknownSourceError) {
        return res.status(404).json({
          error: "unknown_source",
          sourceId: error.sourceId,
          schemaVersion: SCHEMA_VERSION,
        });
      }
      throw error;
    }
  });

  return router;
}

function convergenceRequestTime(now) {
  if (typeof now !== "function") return new Date().toISOString();
  const value = now();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(Date.parse(value)).toISOString();
  }
  return new Date().toISOString();
}

const router = createObservatoryRouter();
export default router;
