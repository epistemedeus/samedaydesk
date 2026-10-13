import express from "express";

export const CONTRIBUTOR_JOURNEY_PREFIX = "/api/neomorphic-contributor-journey";
const ENTRY_URL = new URL("../../vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js", import.meta.url);

/** Optional staging adapter. No product configuration, database, or authority fallback. */
export function mountNeomorphicContributorJourney(app, options = {}) {
  const env = options.env || process.env;
  const state = { status: "disabled", reason: "disabled", runtime: null, inFlight: null, closed: false };
  let starting = null;
  const disabled = express.Router();
  disabled.get("/healthz", (_req, res) => res.status(state.reason === "unavailable" ? 503 : 200).json({
    schema: "neomorphic.contributor-journey.mount.v1", ready: false, publicEnabled: false,
    wholeJourney: "integration_pending", releaseAccepted: false, reason: state.reason,
  }));
  disabled.use((_req, res) => res.status(503).json({ error: { code: state.reason }, publicEnabled: false }));

  async function initialize() {
    try {
      // Exact received build is supplied by the integrator. Tests inject the
      // actual isolated producer build, never a mock kernel or persistence.
      const service = options.loadService ? await options.loadService() : await import(ENTRY_URL.href);
      const config = service.loadJourneyConfig(env);
      if (config.mode !== "staging" || config.mountPath !== CONTRIBUTOR_JOURNEY_PREFIX) {
        state.reason = "invalid_config"; return;
      }
      starting = await service.createJourneyRuntime({ config, ports: options.ports, modules: options.modules });
      if (state.closed) { await starting.close(); starting = null; return; }
      state.runtime = starting; starting = null;
      state.status = "ready"; state.reason = "ready";
    } catch (error) {
      if (starting) await starting.close().catch(() => {});
      starting = null;
      state.reason = error && ["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"].includes(error.code)
        ? "integration_pending" : "unavailable";
    }
  }
  if (env.CONTRIBUTOR_JOURNEY_MODE === "staging") {
    state.status = "starting";
    state.inFlight = initialize().finally(() => {
      if (!state.runtime) state.status = "disabled";
      state.inFlight = null;
    });
  } else if (env.CONTRIBUTOR_JOURNEY_MODE && env.CONTRIBUTOR_JOURNEY_MODE !== "disabled") {
    state.reason = "invalid_config";
  }
  app.use(CONTRIBUTOR_JOURNEY_PREFIX, async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (state.inFlight) await state.inFlight;
    return (state.runtime?.app || disabled)(req, res, next);
  });
  return {
    state,
    ready: () => state.inFlight || Promise.resolve(),
    close: async () => {
      state.closed = true;
      await state.inFlight;
      const runtime = state.runtime; state.runtime = null;
      state.status = "disabled"; state.reason = "disabled";
      if (runtime) await runtime.close();
    },
  };
}
