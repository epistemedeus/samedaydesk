import express from "express";
import {fileURLToPath} from 'node:url';
import {verifyContributorRuntime} from './contributor-artifact.js';
import {createRecoveryState, noteContributorFailure} from './contributor-mount-recovery.js';

export const CONTRIBUTOR_JOURNEY_PREFIX = "/api/neomorphic-contributor-journey";
const ENTRY_URL = new URL("../../vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js", import.meta.url);

/** Optional exact installed adapter. No product configuration, database, or authority fallback. */
export function mountNeomorphicContributorJourney(app, options = {}) {
  const env = options.env || process.env;
  const now = options.now || Date.now;
  const enabled = ["staging", "live"].includes(env.CONTRIBUTOR_JOURNEY_MODE);
  const state = createRecoveryState(enabled ? "starting" : "disabled");
  let starting = null;
  const disabled = express.Router();
  disabled.get("/healthz", (_req, res) => res.status(state.reason === "unavailable" ? 503 : 200).json({
    schema: "neomorphic.contributor-journey.mount.v1", ready: false, publicEnabled: false,
    wholeJourney: "integration_pending", releaseAccepted: false, reason: state.reason,
  }));
  disabled.use((_req, res) => res.status(503).json({ error: { code: state.reason }, publicEnabled: false }));

  async function initialize() {
    state.initializations += 1;
    let stage = "source_verify";
    try {
      if (env.CONTRIBUTOR_JOURNEY_MODE === "live" && (options.loadService || options.ports || options.modules ||
          !/^[a-f0-9]{40}$/.test(env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT ?? ""))) {
        throw Object.assign(new Error("live mount requires the exact default artifact and installed adapters"), { code: "installed_source_changed" });
      }
      if (!options.loadService) await verifyContributorRuntime(fileURLToPath(new URL("../../vendor/neomorphic-contributor-journey/", import.meta.url)), env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT);
      // Default loader consumes the committed exact compiled closure and SOURCE.json.
      // An explicit loader remains available for bounded foundation diagnostics.
      stage = "service_import";
      const service = options.loadService ? await options.loadService() : await import(ENTRY_URL.href);
      stage = "service_config";
      const config = service.loadJourneyConfig(env);
      if (!["staging", "live"].includes(config.mode) || config.mountPath !== CONTRIBUTOR_JOURNEY_PREFIX) {
        state.status = "disabled";
        state.reason = "invalid_config";
        state.terminal = true;
        state.diagnostic = { stage: "service_config", code: "INVALID_INPUT" };
        console.error("contributor_journey_unavailable", { stage: state.diagnostic.stage, code: state.diagnostic.code });
        return;
      }
      stage = "store_create";
      starting = await service.createJourneyRuntime({
        config, ports: options.ports, modules: options.modules, canonicalReceiving: options.canonicalReceiving,
      });
      if (state.closed) { await starting.close(); starting = null; return; }
      state.runtime = starting;
      starting = null;
      state.status = "ready";
      state.reason = "ready";
      state.terminal = false;
      state.diagnostic = null;
      state.attempts = 0;
      state.nextAttemptAt = 0;
    } catch (error) {
      if (starting) await starting.close().catch(() => {});
      starting = null;
      state.runtime = null;
      if (state.closed) return;
      noteContributorFailure(state, stage, error, now, "contributor_journey_unavailable");
    }
  }

  function ensure() {
    if (state.closed || state.inFlight) return state.inFlight || Promise.resolve();
    if (!enabled || state.status === "ready" || state.terminal) return Promise.resolve();
    if (now() < state.nextAttemptAt) return Promise.resolve();
    state.status = "starting";
    state.inFlight = initialize().finally(() => {
      if (!state.runtime) state.status = "disabled";
      state.inFlight = null;
    });
    return state.inFlight;
  }

  if (enabled) ensure();
  else if (env.CONTRIBUTOR_JOURNEY_MODE && env.CONTRIBUTOR_JOURNEY_MODE !== "disabled") {
    state.reason = "invalid_config";
    state.terminal = true;
    state.status = "disabled";
    state.diagnostic = { stage: "service_config", code: "INVALID_INPUT" };
  }
  app.use(CONTRIBUTOR_JOURNEY_PREFIX, async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    await ensure();
    return (state.runtime?.app || disabled)(req, res, next);
  });
  return {
    state,
    ready: () => state.inFlight || Promise.resolve(),
    ensure,
    close: async () => {
      state.closed = true;
      state.terminal = true;
      await state.inFlight;
      const runtime = state.runtime;
      state.runtime = null;
      starting = null;
      state.status = "disabled";
      state.reason = "disabled";
      if (runtime) await runtime.close();
    },
  };
}
