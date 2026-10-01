// Optional public-readiness mount for the existing SameDayDesk Node process.
// Unconfigured checker: truthful disabled healthz only. Never takes down SDS routes.
// This process does not claim a public-host deployment.
import express from "express";
import { SUPPORTED_PROTOCOL_VERSIONS } from "../routes/mcp.js";
import {
  fixtureRelative,
  runPublicAdapter,
  verifyPublicChecker,
} from "../../tools/l08-agent-repair/lib/public-adapter.mjs";

export const PUBLIC_READINESS_PREFIX = "/api/public-readiness";

export function compiledRepairBody() {
  return {
    scope: "this-process",
    source: "server/routes/mcp.js",
    protocolHeader: "MCP-Protocol-Version",
    supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
    unsupportedStatus: 400,
    unsupportedCode: -32000,
    missingHeader: "accepted",
  };
}

export function publicDeploymentBody() {
  return {
    activated: false,
    readback: null,
    reason: "compiled repair is not a public-host readback",
  };
}

export function readinessHealth(provenance, reason) {
  if (!provenance) {
    return {
      ok: false,
      enabled: false,
      reason: reason || "checker_unavailable",
      privateGitRequired: false,
      compiledRepair: compiledRepairBody(),
      publicDeployment: publicDeploymentBody(),
    };
  }
  return {
    ok: true,
    enabled: true,
    privateGitRequired: false,
    checker: {
      commit: provenance.checker.commit,
      license: provenance.checker.license,
      path: "vendor/agent-payment-integrity",
    },
    compiledRepair: compiledRepairBody(),
    publicDeployment: publicDeploymentBody(),
  };
}

export function createPublicReadinessRouter(options = {}) {
  const verify = options.verifyProvenance || verifyPublicChecker;
  const run = options.runCatalogRow || runPublicAdapter;
  const router = express.Router();

  router.get("/healthz", (_req, res) => {
    try {
      return res.status(200).json(readinessHealth(verify(), null));
    } catch (err) {
      return res.status(200).json(readinessHealth(null, err.code || "checker_unavailable"));
    }
  });

  router.post("/catalog-row", (req, res) => {
    let relative;
    try {
      relative = fixtureRelative(req.body?.fixture);
      verify();
    } catch (err) {
      const code = err.code || "fixture_refused";
      const status = code === "fixture_refused" ? 400 : 503;
      return res.status(status).json({ error: { code, message: "public checker did not accept that row" } });
    }
    let ran;
    try {
      ran = run(relative);
    } catch (err) {
      return res.status(503).json({ error: { code: err.code || "checker_unavailable", message: "public checker did not accept that row" } });
    }
    if (!ran?.json) {
      return res.status(503).json({ error: { code: "checker_unavailable", message: "public checker returned no decision" } });
    }
    return res.status(200).json({
      fixture: req.body.fixture,
      exit: ran.status ?? 1,
      decision: ran.json,
      compiledRepair: compiledRepairBody(),
      publicDeployment: publicDeploymentBody(),
    });
  });

  return router;
}

export function mountPublicReadiness(app, options = {}) {
  const prefix = options.prefix || PUBLIC_READINESS_PREFIX;
  app.use(prefix, createPublicReadinessRouter(options));
  return { prefix };
}
