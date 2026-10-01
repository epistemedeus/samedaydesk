// Optional earned-work mount on the existing SDS process.
// The packed adapter owns Postgres. This file only refuses the product
// Supabase project and keeps a disabled health route when that happens.
import express from "express";
import { inspectEarnedWorkMountEnv, mountEarnedWork as mountPackedEarnedWork } from "@neomorphic/earned-work-host";
import { reusesProductDataService } from "../foundry/product-isolation.js";

export const EARNED_WORK_PREFIX = "/api/earned-work";

function disabledProductReuse(app, prefix) {
  const state = { status: "disabled", reason: "invalid_config" };
  const router = express.Router();
  router.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: false, enabled: false, reason: "invalid_config" });
  });
  router.use((_req, res) => {
    res.status(503).json({
      error: { code: "invalid_config", message: "earned-work mount is not enabled" },
    });
  });
  app.use(prefix, router);
  return {
    state,
    ready: () => Promise.resolve(),
    close: async () => {},
  };
}

export function mountEarnedWork(app, options = {}) {
  const env = options.env || process.env;
  const prefix = options.prefix || EARNED_WORK_PREFIX;
  const inspected = inspectEarnedWorkMountEnv(env);
  if (inspected.kind === "configured" && reusesProductDataService(inspected.url, { supabaseUrl: env.SUPABASE_URL })) {
    return disabledProductReuse(app, prefix);
  }
  return mountPackedEarnedWork(app, { ...options, env, prefix });
}
