export function classifySpawn(spawn) {
  if (spawn?.error) {
    return {
      layer: "transport",
      outcome: spawn.error.code === "ENOENT" ? "engine-cli-missing" : "engine-spawn-error",
      code: spawn.error.code || "spawn-error",
    };
  }
  if (spawn?.signal) {
    return { layer: "transport", outcome: "engine-killed", code: "engine-killed", signal: spawn.signal };
  }
  if (spawn?.status === null) {
    return { layer: "transport", outcome: "engine-no-status", code: "engine-no-status" };
  }
  if (!spawn?.json) {
    return {
      layer: "transport",
      outcome: "engine-non-json",
      code: "engine-non-json",
      status: spawn?.status,
    };
  }
  if (spawn.json.refused === true || spawn.json.ok === false) {
    return {
      layer: "analysis",
      outcome: "refused",
      code: spawn.json.code || "engine-refused",
      validRefusal: true,
    };
  }
  if (spawn.status !== 0) {
    return {
      layer: "transport",
      outcome: "engine-nonzero",
      code: "engine-nonzero",
      status: spawn.status,
    };
  }
  return { layer: "analysis", outcome: "engine-ok", code: null };
}

export function analysisOutcome({ engineStatus, changed, added, removed, omittedResolved, missingIntegrity }) {
  const hasEngineDelta = (changed?.length || 0) + (added?.length || 0) + (removed?.length || 0) > 0;
  const hasResolvedOnly = (omittedResolved?.length || 0) > 0;
  if (!hasEngineDelta && !hasResolvedOnly) {
    return missingIntegrity > 0 ? "partial" : "no-change";
  }
  if (hasResolvedOnly && !hasEngineDelta) return "actionable";
  if (missingIntegrity > 0) return "partial";
  if (engineStatus === "partial") return "partial";
  return "actionable";
}
