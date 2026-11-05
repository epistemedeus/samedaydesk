import { CONSUMERS, RUNTIME_EXECUTION_STATUS, resolveConsumer } from "./pins.mjs";

const HINT_KEYS = Object.freeze({
  dify: ["DIFY_API_URL", "DIFY_API_KEY"],
  ghost: ["GHOST_URL", "GHOST_ADMIN_API_KEY", "GHOST_CONTENT_API_KEY"],
});

export function inspectRuntime({ consumer = "dify", env = process.env } = {}) {
  const resolved = resolveConsumer(consumer);
  const runtime = resolved.ok ? resolved.consumer.runtime : String(consumer);
  const keys = HINT_KEYS[runtime] || [];
  const hints = keys.filter((key) => typeof env[key] === "string" && env[key].trim());
  const label = CONSUMERS[runtime]?.label || runtime;
  return {
    runtime,
    available: false,
    probed: false,
    called: false,
    executionStatus: RUNTIME_EXECUTION_STATUS,
    envHints: hints,
    reason: hints.length
      ? `environment hints are present for ${label} but were not probed and are not runtime execution proof`
      : `no ${label} runtime was probed; this source-only package does not call ${runtime}`,
  };
}
