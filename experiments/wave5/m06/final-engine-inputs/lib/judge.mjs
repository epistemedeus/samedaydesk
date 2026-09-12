const UNSAFE = new Set(["breaking", "deleted", "added"]);
const SAFE = new Set(["compatible", "unchanged", "informational"]);

export function engineClaim(obs) {
  if (!obs) return "unknown";
  if (obs.refused) return "refuse";
  if (obs.usedClass && UNSAFE.has(obs.usedClass)) return "unsafe";
  if (obs.usedClass && SAFE.has(obs.usedClass)) return "safe";
  if (obs.usedClass === "unknown") return "unknown";
  if ((obs.breaking || 0) > 0) return "unsafe";
  if ((obs.unknown || 0) > 0 && (obs.breaking || 0) === 0) return "unknown";
  if ((obs.compatible || 0) > 0 || (obs.unchangedCount || 0) > 0) return "safe";
  return "unknown";
}

export function specifiedClaim(entry) {
  if (entry.specified.relation === "refuse") return "refuse";
  if (entry.specified.relation === "incompatible") return "unsafe";
  if (entry.specified.relation === "compatible") return "safe";
  if (entry.specified.relation === "unsupported") return "unknown";
  return "unknown";
}

export function judge(entry, obs) {
  const specified = specifiedClaim(entry);
  const engine = engineClaim(obs);
  if (specified === engine) {
    return {
      id: "agree",
      specified,
      engine,
      affectsUsed: true,
    };
  }
  if (specified === "unsafe" && engine === "safe") {
    return { id: "false-safe", specified, engine, affectsUsed: true };
  }
  if (specified === "safe" && engine === "unsafe") {
    return { id: "false-unsafe", specified, engine, affectsUsed: true };
  }
  if (specified === "unknown" && (engine === "safe" || engine === "unsafe")) {
    return { id: "wrongly-certain", specified, engine, affectsUsed: true };
  }
  if (specified === "unsafe" && engine === "unknown") {
    return { id: "honest-unsupported", specified, engine, affectsUsed: true };
  }
  if (specified === "safe" && engine === "unknown") {
    return { id: "honest-unsupported", specified, engine, affectsUsed: true };
  }
  return { id: "mismatch", specified, engine, affectsUsed: true };
}

export function isDefect(judgment) {
  return judgment.id === "false-safe" || judgment.id === "false-unsafe" || judgment.id === "wrongly-certain";
}
