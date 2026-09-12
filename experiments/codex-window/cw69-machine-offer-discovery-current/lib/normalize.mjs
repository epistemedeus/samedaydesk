function omitVolatile(value) {
  if (Array.isArray(value)) return value.map(omitVolatile);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "volatile") continue;
    if (key === "generatedAt" || key === "outDir" || key === "path") continue;
    out[key] = omitVolatile(child);
  }
  return out;
}

export function normalizeDiscovery(discovery) {
  const n = omitVolatile(discovery);
  if (n.identity) {
    // Keep identity hashes; drop absolute runtime paths if any leaked.
    delete n.volatile;
  }
  return n;
}

export function normalizeDescription(description) {
  const n = omitVolatile(description);
  if (n.caller?.before) delete n.caller.before.path;
  if (n.caller?.after) delete n.caller.after.path;
  return n;
}

export function normalizeInvocation(invocation) {
  const n = omitVolatile(invocation);
  if (Array.isArray(n.artifacts)) {
    n.artifacts = n.artifacts.map((row) => {
      const copy = { ...row };
      delete copy.path;
      return copy;
    });
  }
  if (n.receipt) delete n.receipt.path;
  return n;
}
