/**
 * Public read-only observatory: named fixed-upstream sources only.
 * Not an arbitrary URL proxy. Caller credentials are never forwarded.
 */

import { Router } from "express";
import { SCHEMA_VERSION } from "../lib/observatory/contract.js";
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

const router = createObservatoryRouter();
export default router;
